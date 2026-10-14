/** Key a paginated handler hangs its `PaginationMeta` off (see ResponseInterceptor). */
export const PAGINATION_META = Symbol('pagination-meta');

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
