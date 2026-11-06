import { http } from '../http';

/**
 * A family's question about a shared lesson card
 * (apps/api/src/modules/lessons/revision-requests.controller.ts). Creating one posts it into
 * the family–teacher conversation, where the teacher replies; the web app no longer has a
 * separate reply/close queue (the respond/close endpoints remain on the API, unused).
 */

export type RevisionReason = 'REVISIT_PORTION' | 'MISTAKE_QUESTION' | 'EXTRA_CLASS' | 'OTHER';
export type RevisionStatus = 'OPEN' | 'ANSWERED' | 'CLOSED';
/** `family`: the guardian's own; `teacher`: cards the caller wrote; `all`: staff. */
export type RevisionScope = 'family' | 'teacher' | 'all';

export const REVISION_MESSAGE_MAX = 1000;

export const REVISION_REASONS: Array<{ value: RevisionReason; label: string }> = [
  { value: 'REVISIT_PORTION', label: 'Revisit a portion' },
  { value: 'MISTAKE_QUESTION', label: 'Question about a mistake' },
  { value: 'EXTRA_CLASS', label: 'Extra class' },
  { value: 'OTHER', label: 'Other' },
];

export function revisionReasonLabel(reason: string): string {
  return REVISION_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export interface RevisionRequest {
  id: string;
  lessonCardId: string;
  studentId: string;
  familyId: string;
  reason: RevisionReason;
  message: string;
  status: RevisionStatus;
  response: string | null;
  respondedAt: string | null;
  closedAt: string | null;
  /** The family-teacher message thread the request was posted into. */
  threadId?: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string };
  respondedBy: { id: string; name: string } | null;
  student: { id: string; displayName: string };
  lessonCard: { id: string; teacher: { id: string; name: string }; class: { startsAt: string } };
}

export interface RevisionListParams {
  scope?: RevisionScope;
  lessonCardId?: string;
  status?: RevisionStatus;
}

/** Same rules as the API: trimmed, 1 to `max` characters. Returns the problem, or null. */
export function validateRevisionText(text: string, max: number, what = 'message'): string | null {
  const trimmed = text.trim();
  if (!trimmed) return `Write a ${what}.`;
  if (trimmed.length > max) return `Keep the ${what} to ${max} characters or fewer.`;
  return null;
}

const enc = encodeURIComponent;

export const revisionRequestsApi = {
  create: (lessonCardId: string, body: { reason: RevisionReason; message: string }) =>
    http.post<RevisionRequest>(`/lesson-cards/${enc(lessonCardId)}/revision-requests`, {
      reason: body.reason,
      message: body.message.trim(),
    }),
  list: (params: RevisionListParams) =>
    http.get<RevisionRequest[]>('/revision-requests', { query: { ...params } }),
};
