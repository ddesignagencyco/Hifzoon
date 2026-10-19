import { http } from '../http';

/** Row from `GET /admin/audit` (AuditService.list `select`). */
export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  at: string;
  actor: { id: string; name: string; email: string } | null;
}

/** The audit endpoint returns its own `{ items, total, failedWrites }` shape (not the paginated envelope). */
export interface AuditPage {
  items: AuditEntry[];
  total: number;
  /** In-process count of audit writes that failed since the API last started. */
  failedWrites: number;
}

/** Zod `listQuery` of AuditController. */
export interface AuditFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  /** ISO date-time. */
  from?: string;
  /** ISO date-time. */
  to?: string;
  page?: number;
  limit?: number;
}

export const auditApi = {
  list: (filters: AuditFilters = {}) =>
    http.get<AuditPage>('/admin/audit', {
      query: {
        actorId: filters.actorId?.trim(),
        action: filters.action?.trim(),
        targetType: filters.targetType?.trim(),
        targetId: filters.targetId?.trim(),
        from: filters.from,
        to: filters.to,
        page: filters.page ?? 1,
        limit: filters.limit ?? 50,
      },
    }),
};

export function totalPages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the filter form against the Zod query (uuid actor, length caps, from ≤ to). */
export function validateAuditFilters(f: AuditFilters): Partial<Record<keyof AuditFilters, string>> {
  const errors: Partial<Record<keyof AuditFilters, string>> = {};
  if (f.actorId && f.actorId.trim() && !UUID_RE.test(f.actorId.trim())) errors.actorId = 'Actor ID must be a UUID.';
  if (f.action && f.action.length > 120) errors.action = 'At most 120 characters.';
  if (f.targetType && f.targetType.length > 80) errors.targetType = 'At most 80 characters.';
  if (f.targetId && f.targetId.length > 80) errors.targetId = 'At most 80 characters.';
  if (f.from && f.to && new Date(f.from) > new Date(f.to)) errors.to = '"To" must be after "From".';
  return errors;
}
