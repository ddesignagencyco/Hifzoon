import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Optional site-wide access gate, keeping bots and crawlers off a public deployment.
 * Off unless SITE_ACCESS_PASSWORD is set, so local dev is unaffected.
 *
 * Visitors without the access cookie are redirected to /access, a branded page that
 * explains who the site is for and takes the access code. A correct code sets an httpOnly
 * cookie holding a SHA-256 of the password (never the password itself).
 * /api/v1 and /socket.io are excluded: they are proxied to the API, which has its own
 * API_ACCESS_KEY gate and needs the Authorization header for JWTs.
 */
const COOKIE = 'hifzoon_site_access';
const GATE_PATH = '/access';
const MAX_AGE = 60 * 60 * 24 * 7;

async function token(password: string): Promise<string> {
  const data = new TextEncoder().encode(`hifzoon-site-access:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only same-site relative paths, so the form cannot be used as an open redirect. */
function safeNext(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith(GATE_PATH)
    ? value
    : '/';
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function gatePage(next: string, error: boolean): NextResponse {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Hifzoon · Private access</title>
<style>
:root{--bg:#f4f1ea;--card:#fff;--ink:#16302b;--muted:#5b6b66;--accent:#1f6f5c;--line:#e2ddd0;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#0f1b18;--card:#162622;--ink:#eaf1ee;--muted:#9fb3ac;--accent:#4fb89c;--line:#27403a;--err:#ff8a80}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{width:100%;max-width:520px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:32px 28px}
h1{margin:0 0 4px;font-size:26px}.sub{margin:0 0 20px;color:var(--muted)}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:24px 0 8px}
ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
li{border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14.5px}li b{display:block;font-size:15px}
form{margin-top:8px;display:grid;gap:10px}label{font-weight:600;font-size:14px}
input{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:var(--ink);font:inherit}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{padding:12px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--err);font-size:14px;margin:0}.fine{font-size:12.5px;color:var(--muted);margin:16px 0 0}
</style></head><body><main>
<h1>Hifzoon</h1>
<p class="sub">Private access. This site is open to invited users only.</p>
<h2>Who can use it</h2>
<ul>
<li><b>Parents &amp; guardians</b>Manage your family, book and follow your child's Quran lessons, view progress and billing.</li>
<li><b>Teachers</b>Run live classes, record hifz and revision progress, and manage your schedule and availability.</li>
<li><b>Academy staff &amp; admins</b>Operations, admissions, hiring, payments and support. Staff accounts use two-factor sign-in.</li>
</ul>
<h2>Enter the access code</h2>
<form method="post" action="${GATE_PATH}">
<input type="hidden" name="next" value="${esc(next)}">
<label for="p">Access code</label>
<input id="p" name="password" type="password" autocomplete="current-password" required autofocus>
${error ? '<p class="err" role="alert">That access code is not correct. Please try again.</p>' : ''}
<button type="submit">Continue to Hifzoon</button>
</form>
<p class="fine">The access code only opens the site. You will still sign in with your own account and role afterwards. Don't have a code? Contact the Hifzoon team.</p>
</main></body></html>`;
  return new NextResponse(html, {
    status: error ? 401 : 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function proxy(request: NextRequest) {
  const password = process.env.SITE_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const expected = await token(password);
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === GATE_PATH && request.method === 'POST') {
    const form = await request.formData();
    const next = safeNext(String(form.get('next') ?? ''));
    const given = await token(String(form.get('password') ?? ''));
    if (!safeEqual(given, expected)) return gatePage(next, true);
    const res = NextResponse.redirect(new URL(next, request.url), 303);
    res.cookies.set(COOKIE, expected, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: MAX_AGE,
    });
    return res;
  }

  const cookie = request.cookies.get(COOKIE)?.value;
  if (cookie && safeEqual(cookie, expected)) {
    return pathname === GATE_PATH ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (pathname === GATE_PATH) return gatePage(safeNext(searchParams.get('next')), false);

  const target = new URL(GATE_PATH, request.url);
  target.searchParams.set('next', pathname + request.nextUrl.search);
  return NextResponse.redirect(target);
}

export const config = {
  // Public static files (logo, hero and teacher photos, fonts) are not gated: they are
  // marketing assets, and the Next.js image optimizer fetches them server-side without the
  // visitor's cookie, so gating them breaks every <Image> on the page.
  matcher: [
    '/((?!api/v1|socket\\.io|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?)$).*)',
  ],
};
