import { http } from '../http';

/**
 * Teacher-side scheduling (apps/api/src/modules/scheduling/scheduling.controller.ts).
 *
 * Every `:teacherId` here is the **teacher profile id** (`teacher_profile.id`), not the
 * user id. See `resolveTeacherProfileId` in `./teacher.ts` for how the web learns it.
 */

export type ClassSessionType = 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';
export type ClassSessionStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED_FAMILY'
  | 'CANCELLED_TEACHER'
  | 'NO_SHOW_TEACHER'
  | 'NO_SHOW_STUDENT'
  | string;

/** Row of `GET /scheduling/teachers/:teacherId/timetable` (SchedulingService.teacherTimetable). */
export interface TimetableClass {
  id: string;
  type: ClassSessionType;
  status: ClassSessionStatus;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  course: { name: string; code: string } | null;
  students: Array<{ student: { id: string; displayName: string } }>;
  /** M68 — the class's lesson card, if one has been started. */
  lessonCard?: { id: string; state: 'DRAFT' | 'SUBMITTED' | 'SHARED' } | null;
  /** ISO with offset, rendered in `viewerZone`. */
  localStart: string | null;
  localEnd: string | null;
  viewerZone: string;
}

/** One stored slot of `GET /scheduling/teachers/:teacherId/availability`. */
export interface AvailabilitySlotRecord {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** `HH:mm` local to `timeZone`. */
  startTime: string;
  endTime: string;
  timeZone: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface TeacherAvailability {
  teacherId: string;
  /** The teacher's account zone — the zone a PUT is stored in. */
  timeZone: string;
  slots: AvailabilitySlotRecord[];
}

/** `AvailabilitySlotDto`: weekday 0–6, `HH:mm` (00:00–23:59). */
export interface AvailabilitySlotInput {
  weekday: number;
  startTime: string;
  endTime: string;
}

/** `SetAvailabilityDto` — at least one slot. */
export interface SetAvailabilityInput {
  slots: AvailabilitySlotInput[];
  effectiveFrom?: string;
  effectiveTo?: string;
}

/** `CancelClassDto` — `{ reason }` only; the API derives who cancelled and the notice window (S7). */
export interface CancelClassInput {
  reason: string;
}

export interface CancelClassResult {
  classId: string;
  status: ClassSessionStatus;
  charged: boolean;
  makeUpCredits: number;
  noticeHours: number;
}

/** `RescheduleDto`. */
export interface RescheduleInput {
  newStartsAt: string;
  durationMinutes?: number;
}

export interface RescheduleResult {
  id: string;
  startsAt: string;
  endsAt: string;
}

export const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const CANCEL_REASON_MAX = 500;
export const DURATION_MIN = 15;
export const DURATION_MAX = 240;

const enc = encodeURIComponent;

export const teacherScheduleApi = {
  timetable: (teacherId: string, params: { from: string; to: string; tz: string }) =>
    http.get<TimetableClass[]>(`/scheduling/teachers/${enc(teacherId)}/timetable`, { query: params }),
  availability: (teacherId: string) =>
    http.get<TeacherAvailability>(`/scheduling/teachers/${enc(teacherId)}/availability`),
  setAvailability: (teacherId: string, body: SetAvailabilityInput) =>
    http.put<TeacherAvailability>(`/scheduling/teachers/${enc(teacherId)}/availability`, body),
  cancelClass: (classId: string, body: CancelClassInput) =>
    http.post<CancelClassResult>(`/scheduling/classes/${enc(classId)}/cancel`, { reason: body.reason }),
  reschedule: (classId: string, body: RescheduleInput) =>
    http.post<RescheduleResult>(`/scheduling/classes/${enc(classId)}/reschedule`, body),
};

/** Students in a class as a readable list (`Maryam, Yusuf`). */
export function classStudentNames(cls: Pick<TimetableClass, 'students'>): string {
  return cls.students.map((s) => s.student.displayName).join(', ');
}

/**
 * Classes that took place (COMPLETED) before `now`, newest first — the ones that may still
 * need a lesson card. The timetable has no lesson-card state yet (backend M68), so the card
 * screen itself says whether one was already sent.
 */
export function recentCompletedClasses<T extends Pick<TimetableClass, 'status' | 'startsAt'>>(classes: readonly T[], now: number): T[] {
  return classes
    .filter((c) => c.status === 'COMPLETED' && new Date(c.startsAt).getTime() < now)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

/** The teacher's lesson-card composer for a class. */
export function lessonCardHref(classId: string): string {
  return `/teacher/classroom/${encodeURIComponent(classId)}/lesson-card`;
}
