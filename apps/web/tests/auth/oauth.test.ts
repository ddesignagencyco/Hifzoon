import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import {
  clearAccessToken,
  completeOAuth,
  fetchOAuthProviders,
  getAccessToken,
  setAccessToken,
  startOAuth,
} from '@/lib/api/client';
import { GET, POST } from '@/app/auth/oauth/[provider]/route';

afterEach(() => {
  vi.restoreAllMocks();
  clearAccessToken();
});

const USER = { id: 'u-1', email: 'g@x.test', name: 'Guardian', roles: ['GUARDIAN'], status: 'ACTIVE', twoFactorEnabled: false, lastActiveAt: null };

describe('OAuth client (FR-AUTH-01)', () => {
  it('lists providers, and treats an unavailable endpoint as "none configured"', async () => {
    mockApi({ 'GET /auth/oauth/providers': { body: envelope([{ name: 'google', configured: true }]) } });
    await expect(fetchOAuthProviders()).resolves.toEqual([{ name: 'google', configured: true }]);

    mockApi({});
    await expect(fetchOAuthProviders()).resolves.toEqual([]);
  });

  it('starts with a same-origin redirect URI and the access token when linking', async () => {
    setAccessToken('linking-token');
    const api = mockApi({
      'GET /auth/oauth/google/start': { body: envelope({ authorizationUrl: 'https://accounts.example/auth', state: 's1' }) },
    });
    const res = await startOAuth('google');
    expect(res).toEqual({ success: true, authorizationUrl: 'https://accounts.example/auth' });
    const call = api.calls[0];
    expect(new URL(call.url).searchParams.get('redirectUri')).toMatch(/\/auth\/oauth\/google$/);
    expect(call.headers.get('Authorization')).toBe('Bearer linking-token');
  });

  it('exchanges code + state once and keeps the access token in memory only', async () => {
    const api = mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'POST /auth/oauth/apple/callback': { body: envelope({ accessToken: 'fresh', expiresIn: 900, user: USER }) },
    });
    const res = await completeOAuth('apple', { code: 'c0de', state: 'st4te' });
    expect(res.success).toBe(true);
    expect(getAccessToken()).toBe('fresh');
    const cb = api.calls.find((c) => c.url.endsWith('/auth/oauth/apple/callback'));
    expect(cb?.body).toMatchObject({ code: 'c0de', state: 'st4te' });
    expect((cb?.body as { redirectUri: string }).redirectUri).toMatch(/\/auth\/oauth\/apple$/);
    expect(api.calls.filter((c) => c.url.endsWith('/callback'))).toHaveLength(1);
  });

  it('turns backend error codes into actionable messages', async () => {
    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'POST /auth/oauth/google/callback': apiError(409, 'OAUTH_LINK_REQUIRED', 'raw'),
    });
    const linkRequired = await completeOAuth('google', { code: 'c', state: 's' });
    expect(linkRequired).toMatchObject({ success: false, code: 'OAUTH_LINK_REQUIRED' });
    expect(linkRequired.error).toMatch(/sign in with your password, then link/i);

    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'POST /auth/oauth/google/callback': apiError(401, 'TWO_FACTOR_REQUIRED', 'raw'),
    });
    const staff = await completeOAuth('google', { code: 'c', state: 's' });
    expect(staff.twoFactorRequired).toBe(true);
    expect(staff.error).toMatch(/password and code/i);
  });
});

describe('OAuth redirect route handler', () => {
  const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) }) as never;

  it("forwards Google's GET query to the completion page with a 303", async () => {
    const res = await GET(new NextRequest('http://localhost:3000/auth/oauth/google?code=abc&state=xyz&scope=email'), ctx('google'));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location')!);
    expect(to.pathname).toBe('/auth/complete');
    expect(Object.fromEntries(to.searchParams)).toEqual({ provider: 'google', code: 'abc', state: 'xyz' });
  });

  it("forwards Apple's form_post body", async () => {
    const body = new URLSearchParams({ code: 'a1', state: 's1', user: '{"name":{}}' });
    const req = new NextRequest('http://localhost:3000/auth/oauth/apple', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const res = await POST(req, ctx('apple'));
    const to = new URL(res.headers.get('location')!);
    expect(Object.fromEntries(to.searchParams)).toEqual({ provider: 'apple', code: 'a1', state: 's1' });
  });

  it('drops an unknown provider and passes provider errors through', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/auth/oauth/evil?error=access_denied'), ctx('evil'));
    const to = new URL(res.headers.get('location')!);
    expect(to.origin).toBe('http://localhost:3000');
    expect(to.searchParams.get('provider')).toBeNull();
    expect(to.searchParams.get('error')).toBe('access_denied');
  });
});
