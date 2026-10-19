import { vi } from 'vitest';

export interface MockCall {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}

type Responder = { status?: number; body?: unknown } | ((call: MockCall) => { status?: number; body?: unknown });

/**
 * Route-table fetch mock for API-module unit tests.
 *
 *   const api = mockApi({ 'GET /families': { body: { data: [] } } });
 *   ...
 *   expect(api.calls[0].url).toContain('/families');
 *
 * Keys are `METHOD /path` matched against the path after `/api/v1` (query string ignored
 * unless the key contains `?`). Unmatched requests return 404 so a typo fails loudly.
 */
export function mockApi(routes: Record<string, Responder>) {
  const calls: MockCall[] = [];

  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    let body: unknown = undefined;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: MockCall = { url, method, body, headers };
    calls.push(call);

    const path = url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1/, '');
    const pathNoQuery = path.split('?')[0];
    const responder = routes[`${method} ${path}`] ?? routes[`${method} ${pathNoQuery}`];
    const resolved = responder === undefined
      ? { status: 404, body: { statusCode: 404, code: 'NOT_FOUND', message: `No mock for ${method} ${path}` } }
      : typeof responder === 'function'
        ? responder(call)
        : responder;
    const status = resolved.status ?? 200;

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => resolved.body,
    } as Response;
  });

  return { calls, spy };
}

/** `{ data, meta }` success envelope as produced by the backend ResponseInterceptor. */
export function envelope<T>(data: T, meta: Record<string, unknown> = { requestId: 'test-request' }) {
  return { data, meta };
}

/** Backend AllExceptionsFilter error shape. */
export function apiError(status: number, code: string, message: string, details?: unknown) {
  return { status, body: { statusCode: status, code, message, details, requestId: 'test-request' } };
}
