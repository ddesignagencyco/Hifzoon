/**
 * Response envelope + pagination shapes (TRD sections 5.1 and 6).
 * Every successful API response is `{ data, meta? }`; every error is
 * `{ statusCode, code, message, details? }`.
 */

export interface ApiMeta {
  requestId?: string;
  timestamp?: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiSuccessResponse<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  timestamp?: string;
}

export interface PageQuery {
  page?: number;
  limit?: number;
}

export interface PageResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/** Locales supported by the API for content and notifications. */
export const Locales = {
  EN: 'en',
  UR: 'ur',
  AR: 'ar',
  FR: 'fr',
} as const;

export type LocaleValue = (typeof Locales)[keyof typeof Locales];
export const SUPPORTED_LOCALES: readonly LocaleValue[] = ['en', 'ur', 'ar', 'fr'];
