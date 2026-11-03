import { z } from 'zod';

import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../constants/pagination-meta';

/**
 * Reusable `page` / `limit` query fields for zod-validated list endpoints.
 *
 * Spread into an endpoint's own query schema so every paginated route coerces and clamps
 * the same way, then pass the parsed query through `toPagination()` and return the rows
 * with `paginated()` (common/utils/pagination.util.ts):
 *
 *   const listQuery = z.object({ ...pageQueryShape, status: z.nativeEnum(Status).optional() });
 *   const params = toPagination(query);
 *   return paginated(items, params, total);
 */
export const pageQueryShape = {
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
};

export const pageQuery = z.object(pageQueryShape);
