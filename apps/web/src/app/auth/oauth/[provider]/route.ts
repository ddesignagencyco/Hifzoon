import { NextResponse, type NextRequest } from 'next/server';

/**
 * OAuth redirect URI (FR-AUTH-01). Google returns with `?code&state` (GET); Apple posts a
 * form (`response_mode=form_post`). Either way we hand the values to the client page,
 * which holds the in-memory session and calls `POST /auth/oauth/:provider/callback`.
 * Nothing is exchanged here, so the provider `code` never touches this server's state.
 */
const PROVIDERS = new Set(['google', 'apple']);
const FORWARDED = ['code', 'state', 'error', 'error_description'] as const;

function forward(request: NextRequest, provider: string, values: Record<string, string | null>) {
  const target = new URL('/auth/complete', request.nextUrl.origin);
  if (PROVIDERS.has(provider)) target.searchParams.set('provider', provider);
  for (const key of FORWARDED) {
    const value = values[key];
    if (value) target.searchParams.set(key, value);
  }
  // 303 so a POST callback becomes a GET of the page.
  return NextResponse.redirect(target, 303);
}

export async function GET(request: NextRequest, ctx: RouteContext<'/auth/oauth/[provider]'>) {
  const { provider } = await ctx.params;
  const params = request.nextUrl.searchParams;
  return forward(request, provider, Object.fromEntries(FORWARDED.map((k) => [k, params.get(k)])));
}

export async function POST(request: NextRequest, ctx: RouteContext<'/auth/oauth/[provider]'>) {
  const { provider } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const read = (key: string) => {
    const value = form?.get(key);
    return typeof value === 'string' ? value : null;
  };
  return forward(request, provider, Object.fromEntries(FORWARDED.map((k) => [k, read(k)])));
}
