import { http } from '../http';

/**
 * Enrolments and lesson-card reads a teacher needs
 * (apps/api/src/modules/courses/courses.controller.ts, modules/lessons/lessons.controller.ts).
 */

export type EnrolmentStatus = 'TRIAL' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

/** Row of `GET /courses/enrolments/list` (CoursesService.listEnrolments). */
export interface TeacherEnrolment {
  id: string;
  status: EnrolmentStatus;
  startedAt: string | null;
  pausedUntil: string | null;
  currentLessonPosition: number;
  student: { id: string; displayName: string; birthYear: number | null };
  course: { id: string; code: string; name: string };
  currentLevel: { id: string; name: string; position: number } | null;
  /** `teacher.id` is the teacher **profile** id. */
  teacher: { id: string; user: { name: string } } | null;
}

/** `GET /courses/enrolments/:id/next-lesson` (CoursesService.nextLesson). */
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
    materials: unknown;
    teacherNotes: string | null;
  } | null;
  suggestedAdvance: number | null;
  courseType?: string;
}

export interface LessonPositionResult {
  id: string;
  currentLessonPosition: number;
}

export interface LessonPortion {
  id?: string;
  kind: 'SABAQ' | 'SABQI' | 'MANZIL' | string;
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  grade: string | null;
}

/** Row of `GET /students/:studentId/lesson-cards` (LessonCardsService.listForStudent). */
export interface LessonCardSummary {
  id: string;
  submittedAt: string | null;
  sharedAt: string | null;
  lockedAt: string | null;
  homework: string | null;
  student: { displayName: string };
  teacher: { name: string };
  portions: LessonPortion[];
}

/** `GET /lesson-cards/:id` (LessonCardsService.get). */
export interface LessonCardDetail {
  id: string;
  classId: string;
  studentId: string;
  homework: string | null;
  parentNote: string | null;
  aiSummaryDraft: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  sharedAt: string | null;
  lockedAt: string | null;
  locked: boolean;
  student: { id: string; displayName: string };
  teacher: { id: string; name: string };
  portions: LessonPortion[];
  mistakes: Array<{
    id: string;
    surah: number;
    ayah: number;
    wordIndex: number | null;
    type: string;
    tajweedRule: string | null;
  }>;
  class: {
    id: string;
    startsAt: string;
    endsAt: string;
    mushafLayout: string | null;
    tajweedColours: boolean | null;
    recording: { id: string; storageKey: string | null; status: string } | null;
  } | null;
}

const enc = encodeURIComponent;

export const teacherEnrolmentsApi = {
  /** The teacher's own enrolments — filtered by their *user* id. */
  list: (params: { teacherUserId: string; studentId?: string; status?: EnrolmentStatus }) =>
    http.get<TeacherEnrolment[]>('/courses/enrolments/list', { query: params }),
  nextLesson: (enrolmentId: string) =>
    http.get<NextLesson>(`/courses/enrolments/${enc(enrolmentId)}/next-lesson`),
  setLessonPosition: (enrolmentId: string, position: number) =>
    http.patch<LessonPositionResult>(`/courses/enrolments/${enc(enrolmentId)}/lesson-position`, { position }),
  lessonCards: (studentId: string) =>
    http.get<LessonCardSummary[]>(`/students/${enc(studentId)}/lesson-cards`),
  lessonCard: (lessonCardId: string) => http.get<LessonCardDetail>(`/lesson-cards/${enc(lessonCardId)}`),
};

/** `2:255 → 2:260` style range for a portion. */
export function formatPortionRange(p: Pick<LessonPortion, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'>): string {
  const from = p.fromSurah ? `${p.fromSurah}${p.fromAyah ? `:${p.fromAyah}` : ''}` : '';
  const to = p.toSurah ? `${p.toSurah}${p.toAyah ? `:${p.toAyah}` : ''}` : '';
  if (from && to && from !== to) return `${from} → ${to}`;
  return from || to || '—';
}

/** Groups enrolments by student, keeping first-seen order. */
export function groupEnrolmentsByStudent(
  enrolments: TeacherEnrolment[],
): Array<{ student: TeacherEnrolment['student']; enrolments: TeacherEnrolment[] }> {
  const map = new Map<string, { student: TeacherEnrolment['student']; enrolments: TeacherEnrolment[] }>();
  for (const e of enrolments) {
    const entry = map.get(e.student.id) ?? { student: e.student, enrolments: [] };
    entry.enrolments.push(e);
    map.set(e.student.id, entry);
  }
  return [...map.values()];
}
