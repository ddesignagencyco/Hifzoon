import { apiRequest } from './client';

/**
 * Error thrown by the `http` helpers so TanStack Query surfaces real failures
 * (`isError`, `error.message`) instead of silently resolving to `null`.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined | Array<string | number>>;

/** Builds `?a=1&b=x` from an object, dropping empty values and repeating array keys. */
export function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(key, String(item)));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** A fresh `Idempotency-Key` for payment-style mutations (TRD section 5.1). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface RequestOptions {
  query?: QueryParams;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

async function send<T>(method: string, endpoint: string, body: unknown, options: RequestOptions = {}): Promise<T> {
  return (await sendWithMeta<T>(method, endpoint, body, options)).data;
}

async function sendWithMeta<T>(
  method: string,
  endpoint: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    init.body = body instanceof FormData ? body : JSON.stringify(body);
  }

  const result = await apiRequest<T>(`${endpoint}${buildQuery(options.query)}`, init);
  if (result.status === 0 || result.status >= 400) {
    throw new ApiClientError(
      result.error || 'Request failed',
      result.status,
      result.code,
      result.details,
    );
  }
  return { data: result.data as T, meta: result.meta };
}

/** Normalises the backend's pagination meta (`buildPaginationMeta`) whatever its exact keys. */
function toPageMeta(meta: Record<string, unknown> | undefined, count: number): PageMeta {
  const source = (meta?.pagination as Record<string, unknown> | undefined) ?? meta ?? {};
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const limit = num(source.limit ?? source.pageSize, count || 20);
  const total = num(source.total ?? source.totalItems, count);
  return {
    ...(meta ?? {}),
    page: num(source.page, 1),
    limit,
    total,
    totalPages: num(source.totalPages, Math.max(1, Math.ceil(total / Math.max(1, limit)))),
  };
}

/**
 * Thin typed REST helpers over `apiRequest` (envelope unwrapping, bearer auth,
 * silent refresh). Every domain module in `lib/api/modules` builds on these.
 */
export const http = {
  get: <T>(endpoint: string, options?: RequestOptions) => send<T>('GET', endpoint, undefined, options),
  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    send<T>('POST', endpoint, body ?? {}, options),
  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) => send<T>('PUT', endpoint, body ?? {}, options),
  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    send<T>('PATCH', endpoint, body ?? {}, options),
  delete: <T>(endpoint: string, options?: RequestOptions) => send<T>('DELETE', endpoint, undefined, options),
  /** GET a list endpoint that returns `paginated(...)` — keeps items and pagination meta. */
  getPage: async <T>(endpoint: string, options?: RequestOptions): Promise<Paginated<T>> => {
    const { data, meta } = await sendWithMeta<T[]>('GET', endpoint, undefined, options);
    const items = Array.isArray(data) ? data : [];
    return { items, meta: toPageMeta(meta, items.length) };
  },
};

/** Human-readable message for any thrown value (used by error states and toasts). */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403) return 'You do not have permission to do this.';
    if (error.status === 0) return 'Cannot reach the server. Check your connection and try again.';
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
