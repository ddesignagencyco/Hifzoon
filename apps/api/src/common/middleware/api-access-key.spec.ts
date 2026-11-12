import { apiAccessKeyMiddleware, isExemptPath } from './api-access-key';

const KEY = 'k'.repeat(32);

function run(
  expected: string | undefined,
  req: { method?: string; path: string; headers?: Record<string, string> },
) {
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  apiAccessKeyMiddleware(expected, 'api/v1')(
    { method: 'GET', headers: {}, ...req } as never,
    res as never,
    next,
  );
  return { res, next };
}

describe('apiAccessKeyMiddleware', () => {
  it('is off when no key is configured', () => {
    expect(run(undefined, { path: '/api/v1/x' }).next).toHaveBeenCalled();
  });
  it('rejects a missing key with 401', () => {
    const { res, next } = run(KEY, { path: '/api/v1/x' });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.setHeader).not.toHaveBeenCalledWith('WWW-Authenticate', expect.anything());
  });
  it('rejects a wrong key', () => {
    const { next } = run(KEY, { path: '/api/v1/x', headers: { 'x-api-key': 'nope' } });
    expect(next).not.toHaveBeenCalled();
  });
  it('accepts x-api-key', () => {
    expect(run(KEY, { path: '/api/v1/x', headers: { 'x-api-key': KEY } }).next).toHaveBeenCalled();
  });
  it('accepts Basic Auth with the key as password', () => {
    const authorization = `Basic ${Buffer.from(`user:${KEY}`).toString('base64')}`;
    expect(run(KEY, { path: '/', headers: { authorization } }).next).toHaveBeenCalled();
  });
  it('lets health probes and preflight through', () => {
    expect(run(KEY, { path: '/api/v1/health/ready' }).next).toHaveBeenCalled();
    expect(run(KEY, { method: 'OPTIONS', path: '/api/v1/x' }).next).toHaveBeenCalled();
    expect(isExemptPath('/api/v1/healthy', 'api/v1')).toBe(false);
  });
});
