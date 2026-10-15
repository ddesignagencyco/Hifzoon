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

export const admissionsGuardianApi = {
  requestTeacherChange: (input: TeacherChangeRequestInput) =>
    http.post<TeacherChangeRequest>('/teacher-changes', {
      familyId: input.familyId,
      studentId: input.studentId,
      reason: input.reason.trim(),
    }),
};

/** Mirrors the zod body: reason 10–2000 chars. */
export function validateTeacherChangeReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < 10) return 'Please give at least 10 characters so the academy can help.';
  if (r.length > 2000) return 'Keep the reason under 2000 characters.';
  return null;
}
