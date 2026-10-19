import { http } from '../http';

/** Course enrolments for a guardian's children (apps/api/src/modules/courses — FR-CRS-02, FR-PAR-05). */

export type EnrolmentStatus = 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

/** Row from `GET /courses/enrolments/list`. */
export interface EnrolmentRecord {
  id: string;
  status: EnrolmentStatus;
  startedAt: string | null;
  pausedUntil: string | null;
  currentLessonPosition: number;
  student: { id: string; displayName: string; birthYear: number };
  course: { id: string; code: string; name: string };
  currentLevel: { id: string; name: string; position: number } | null;
  /** `teacher.id` is the teacher-profile id (used by booking and ratings). */
  teacher: { id: string; user: { name: string } } | null;
}

/** `GET /courses/enrolments/:enrolmentId/next-lesson`. */
export interface NextLesson {
  enrolmentId: string;
  student: { id: string; displayName: string };
  course: { id: string; name: string; code: string };
  level: { id: string; name: string; position: number } | null;
  lesson: {
    id: string;
    title: string;
    position: number;
    objectives: unknown;
    materials: Record<string, unknown> | null;
    teacherNotes: string | null;
  } | null;
  suggestedAdvance: number | null;
  courseType?: string;
}

/** Statuses a guardian may set (COMPLETED is staff-only). */
export type GuardianEnrolmentStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface UpdateEnrolmentStatusInput {
  status: GuardianEnrolmentStatus;
  /** ISO date; only meaningful with PAUSED. */
  pausedUntil?: string;
  reason?: string;
}

export interface CreateEnrolmentInput {
  studentId: string;
  courseId: string;
}

/** Course row from the public catalogue `GET /courses` (only the fields this portal uses). */
export interface CatalogueCourse {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
}

const enc = encodeURIComponent;

export const enrolmentsApi = {
  list: (params: { studentId?: string; status?: EnrolmentStatus } = {}) =>
    http.get<EnrolmentRecord[]>('/courses/enrolments/list', { query: params }),
  nextLesson: (enrolmentId: string) =>
    http.get<NextLesson>(`/courses/enrolments/${enc(enrolmentId)}/next-lesson`),
  updateStatus: (enrolmentId: string, input: UpdateEnrolmentStatusInput) =>
    http.patch<{ id: string; status: EnrolmentStatus; pausedUntil: string | null }>(
      `/courses/enrolments/${enc(enrolmentId)}/status`,
      {
        status: input.status,
        ...(input.pausedUntil ? { pausedUntil: input.pausedUntil } : {}),
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      },
    ),
  create: (input: CreateEnrolmentInput) =>
    http.post<{ id: string; status: EnrolmentStatus; course: { id: string; code: string; name: string } }>(
      '/courses/enrolments',
      { studentId: input.studentId, courseId: input.courseId },
    ),
  catalogue: async (): Promise<CatalogueCourse[]> => {
    const rows = await http.get<CatalogueCourse[]>('/courses', { query: { locale: 'en' } });
    return (Array.isArray(rows) ? rows : []).map(({ id, code, name, type, description }) => ({
      id,
      code,
      name,
      type,
      description,
    }));
  },
};

/** Enrolments that are still "live" for the family. */
export function isLiveEnrolment(status: string): boolean {
  return status === 'TRIAL' || status === 'ACTIVE' || status === 'PAUSED';
}

/** Lesson objectives come back as JSON; show them only when they are a list of strings. */
export function objectivesList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}
