import { http } from '../http';
import type { DataRequestStatus, DataRequestType } from './consent';

/**
 * The academy's queue of family export and deletion requests (CR-05,
 * apps/api/src/modules/consent/data-requests-admin.controller.ts). Exports and deletions run
 * on their own; the only manual action is refusing one, with the reason the family is told.
 */

/** `GET /admin/data-requests` row. */
export interface AdminDataRequest {
  id: string;
  /** The short reference the family's notices quote. */
  reference: string;
  type: DataRequestType;
  status: DataRequestStatus;
  requestedAt: string;
  dueAt: string;
  completedAt: string | null;
  rejectionReason: string | null;
  /** Open and past `dueAt`. */
  overdue: boolean;
  family: { id: string; name: string };
  student: { id: string; displayName: string } | null;
}

export const dataRequestsAdminApi = {
  list: (filter: { openOnly?: boolean; q?: string; page?: number; limit?: number } = {}) =>
    http.get<AdminDataRequest[]>('/admin/data-requests', {
      query: {
        ...(filter.openOnly ? { openOnly: true } : {}),
        q: filter.q?.trim() || undefined,
        page: filter.page,
        limit: filter.limit,
      },
    }),
  reject: (dataRequestId: string, reason: string) =>
    http.post<{ id: string; status: 'REJECTED'; rejectionReason: string }>(
      `/admin/data-requests/${encodeURIComponent(dataRequestId)}/reject`,
      { reason: reason.trim() },
    ),
};

/** Same bounds as RejectDataRequestDto. */
export function validateRejectionReason(reason: string): string | null {
  const value = reason.trim();
  if (value.length < 3) return 'Tell the family why, in a few words at least.';
  if (value.length > 1000) return 'Keep the reason under 1000 characters.';
  return null;
}

/** Days until the deadline, negative once it has passed. */
export function daysUntilDue(dueAt: string, now = Date.now()): number {
  return Math.ceil((Date.parse(dueAt) - now) / 86_400_000);
}
