import { http } from '../http';

/** Guardian-side admissions actions (apps/api/src/modules/admissions — FR-ADM-05). */

export interface TeacherChangeRequestInput {
  familyId: string;
  studentId: string;
  reason: string;
}

/** Raw `teacher_change_request` row returned by `POST /teacher-changes`. */
export interface TeacherChangeRequest {
  id: string;
  familyId: string;
  studentId: string;
  enrolmentId: string;
  reason: string;
  status: 'OPEN' | 'APPROVED' | 'DECLINED' | 'CANCELLED';
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /teacher-changes` for a guardian — only their own families' requests (backend M15). */
export interface MyTeacherChange extends TeacherChangeRequest {
  studentName: string | null;
  family: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
}

export const admissionsGuardianApi = {
  myTeacherChanges: () => http.get<MyTeacherChange[]>('/teacher-changes'),
  requestTeacherChange: (input: TeacherChangeRequestInput) =>
    http.post<TeacherChangeRequest>('/teacher-changes', {
      familyId: input.familyId,
      studentId: input.studentId,
      reason: input.reason.trim(),
    }),
};

/** The newest request raised against an enrolment (the API stores the enrolment per request). */
export function latestTeacherChangeFor<T extends Pick<TeacherChangeRequest, 'enrolmentId' | 'createdAt'>>(
  requests: readonly T[] | undefined,
  enrolmentId: string,
): T | undefined {
  return (requests ?? [])
    .filter((r) => r.enrolmentId === enrolmentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** Deep link to a child's Courses tab with the teacher-change dialog open for one enrolment. */
export function teacherChangeHref(studentId: string, enrolmentId: string): string {
  return `/parent/children/${encodeURIComponent(studentId)}?tab=courses&change=${encodeURIComponent(enrolmentId)}`;
}

/** Mirrors the zod body: reason 10–2000 chars. */
export function validateTeacherChangeReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 10) return 'Please give at least 10 characters so the academy can help.';
  if (r.length > 2000) return 'Keep the reason under 2000 characters.';
  return null;
}
