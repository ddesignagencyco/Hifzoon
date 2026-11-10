import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Shared-secret gate for the deployed API. It exists to keep bots and crawlers from
 * spending requests on a public Render service; it is not a replacement for JWT auth.
 * When no key is configured the gate is off (local development, tests).
 */

/** Paths that must stay reachable without the key: Render's health probe. */
export function isExemptPath(path: string, apiPrefix: string): boolean {
  const prefix = `/${apiPrefix.replace(/^\/+|\/+$/g, '')}/health`;
  return path === prefix || path.startsWith(`${prefix}/`);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Extracts the presented key from `x-api-key`, or the password of Basic Auth. */
export function presentedKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const direct = first(headers['x-api-key']);
  if (direct) return direct;
  const auth = first(headers['authorization']);
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    return idx >= 0 ? decoded.slice(idx + 1) : undefined;
  }
  return undefined;
}

export function keyMatches(presented: string | undefined, expected: string): boolean {
  return presented !== undefined && safeEqual(presented, expected);
}

const COOKIE = 'hifzoon_api_access';
const GATE_PATH = '/__access';
const MAX_AGE_S = 60 * 60 * 24 * 7;

/** The cookie stores a hash of the key, never the key itself. */
function cookieToken(key: string): string {
  return createHash('sha256').update(`hifzoon-api-access:${key}`).digest('hex');
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

function safeNext(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith(GATE_PATH)
    ? value
    : '/';
}

function gatePage(res: Response, next: string, error: boolean): void {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Hifzoon API · Private access</title>
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
button{padding:12px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--err);font-size:14px;margin:0}.fine{font-size:12.5px;color:var(--muted);margin:16px 0 0}
</style></head><body><main>
<h1>Hifzoon API</h1>
<p class="sub">Private access. This server is open to authorised users and the Hifzoon apps only.</p>
<h2>Who needs this</h2>
<ul>
<li><b>Developers &amp; academy tech staff</b>API documentation (Swagger) and service status.</li>
<li><b>Parents, teachers &amp; staff</b>You do not need this page. Use the Hifzoon website; it connects to this server for you.</li>
</ul>
<h2>Enter the access key</h2>
<form method="post" action="${GATE_PATH}">
<input type="hidden" name="next" value="${esc(next)}">
<label for="p">Access key</label>
<input id="p" name="key" type="password" autocomplete="current-password" required autofocus>
${error ? '<p class="err" role="alert">That access key is not correct. Please try again.</p>' : ''}
<button type="submit">Continue</button>
</form>
<p class="fine">Don't have a key? Contact the Hifzoon team.</p>
</main></body></html>`;
  res
    .status(error ? 401 : 200)
    // helmet's API-wide CSP forbids form posts and inline styles; this page needs both.
    .setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
  res.setHeader('Cache-Control', 'no-store').type('html').send(html);
}

export function apiAccessKeyMiddleware(expected: string | undefined, apiPrefix: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!expected || req.method === 'OPTIONS' || isExemptPath(req.path, apiPrefix)) {
      next();
      return;
    }

    // Browser sign-in form: a correct key sets a cookie so later page loads pass.
    if (req.path === GATE_PATH && req.method === 'POST') {
      const body = (req.body ?? {}) as { key?: unknown; next?: unknown };
      const target = safeNext(body.next);
      if (typeof body.key !== 'string' || !keyMatches(body.key, expected)) {
        gatePage(res, target, true);
        return;
      }
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${cookieToken(expected)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_S}${secure ? '; Secure' : ''}`,
      );
      res.redirect(303, target);
      return;
    }

    if (
      keyMatches(presentedKey(req.headers), expected) ||
      keyMatches(readCookie(req.headers.cookie, COOKIE), cookieToken(expected))
    ) {
      next();
      return;
    }

    // A person opening the URL in a browser gets the sign-in page; programs get JSON.
    if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
      gatePage(res, safeNext(req.originalUrl), false);
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Hifzoon", charset="UTF-8"');
    res.status(401).json({
      success: false,
      error: { code: 'API_KEY_REQUIRED', message: 'A valid API access key is required' },
    });
  };
}
