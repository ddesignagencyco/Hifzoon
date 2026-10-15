import { describe, it, expect, beforeEach } from 'vitest';
import { http, ApiClientError, buildQuery, getErrorMessage } from '@/lib/api/http';
import { clearAccessToken, getAccessToken, loginUser, setAccessToken } from '@/lib/api/client';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

describe('http helpers', () => {
  beforeEach(() => clearAccessToken());

  it('builds query strings, skipping empty values and repeating arrays', () => {
    expect(buildQuery({ page: 2, q: '', status: undefined, tags: ['a', 'b'], active: false })).toBe(
      '?page=2&tags=a&tags=b&active=false',
    );
    expect(buildQuery()).toBe('');
  });

  it('unwraps the { data } envelope and sends JSON bodies with the bearer token', async () => {
    setAccessToken('tok-1');
    const api = mockApi({ 'POST /families': { status: 201, body: envelope({ id: 'fam-1' }) } });

    const result = await http.post<{ id: string }>('/families', { name: 'Khan Family' });

    expect(result).toEqual({ id: 'fam-1' });
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toEqual({ name: 'Khan Family' });
    expect(api.calls[0].headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('throws ApiClientError carrying status, code and details', async () => {
    mockApi({ 'GET /admin/settings': apiError(403, 'FORBIDDEN', 'Insufficient role', ['x']) });

    const error = (await http.get('/admin/settings').catch((e: unknown) => e)) as ApiClientError;

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(getErrorMessage(error)).toBe('You do not have permission to do this.');
  });

  it('adds the Idempotency-Key header when requested', async () => {
    const api = mockApi({ 'POST /billing/checkout': { body: envelope({ ok: true }) } });
    await http.post('/billing/checkout', {}, { idempotencyKey: 'idem-123' });
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('idem-123');
  });

  it('getPage keeps pagination meta from the envelope', async () => {
    mockApi({
      'GET /notifications': {
        body: envelope([{ id: 'n1' }, { id: 'n2' }], { page: 1, limit: 2, total: 5, totalPages: 3 }),
      },
    });

    const page = await http.getPage<{ id: string }>('/notifications', { query: { page: 1, limit: 2 } });

    expect(page.items).toHaveLength(2);
    expect(page.meta).toMatchObject({ page: 1, limit: 2, total: 5, totalPages: 3 });
  });

  it('getPage derives meta when the backend omits it', async () => {
    mockApi({ 'GET /cases': { body: envelope([{ id: 'c1' }]) } });
    const page = await http.getPage('/cases');
    expect(page.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
  });
});

describe('silent refresh on protected auth routes', () => {
  beforeEach(() => clearAccessToken());

  it('refreshes once and retries GET /auth/me after an expired access token', async () => {
    setAccessToken('expired');
    let meCalls = 0;
    const api = mockApi({
      'GET /auth/me': (call) => {
        meCalls += 1;
        return call.headers.get('Authorization') === 'Bearer fresh'
          ? { body: envelope({ id: 'u1', roles: ['GUARDIAN'] }) }
          : apiError(401, 'UNAUTHENTICATED', 'Token expired');
      },
      'POST /auth/refresh': { body: envelope({ accessToken: 'fresh', expiresIn: 900, user: { id: 'u1', roles: ['GUARDIAN'] } }) },
    });

    const me = await http.get<{ id: string }>('/auth/me');

    expect(me.id).toBe('u1');
    expect(meCalls).toBe(2);
    expect(getAccessToken()).toBe('fresh');
    expect(api.calls.map((c) => c.url.replace(/.*\/api\/v1/, ''))).toEqual(['/auth/me', '/auth/refresh', '/auth/me']);
  });

  it('never refreshes on a failed login', async () => {
    const api = mockApi({ 'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect') });
    const result = await loginUser('a@b.test', 'wrong-password-123');
    expect(result.success).toBe(false);
    expect(api.calls).toHaveLength(1);
  });

  it('detects the 2FA challenge by error code, not message text', async () => {
    mockApi({ 'POST /auth/login': apiError(401, 'INVALID_TWO_FACTOR_CODE', 'Code rejected') });
    const result = await loginUser('admin@hifzoon.test', 'Hifzoon!Dev2026');
    expect(result.twoFactorRequired).toBe(true);
  });
});
