import type { ApiMeta } from '@hifzoon/shared';
import { buildPaginationMeta } from '@hifzoon/shared';

import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../constants/pagination-meta';
import { markEnveloped } from '../interceptors/response.interceptor';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

/** Normalises `page`/`limit` query values, clamping to MAX_LIMIT. */
export function toPagination(query: { page?: unknown; limit?: unknown } = {}): PaginationParams {
  const page = Math.max(1, toInt(query.page, DEFAULT_PAGE));
  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(query.limit, DEFAULT_LIMIT)));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/** Builds the `{ data, meta }` envelope for list endpoints. */
export function paginated<T>(
  items: T[],
  params: PaginationParams,
  total: number,
  extra: Record<string, unknown> = {},
) {
  return markEnveloped({
    data: items,
    meta: { ...buildPaginationMeta(params.page, params.limit, total), ...extra } as ApiMeta,
  });
}

function toInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}
