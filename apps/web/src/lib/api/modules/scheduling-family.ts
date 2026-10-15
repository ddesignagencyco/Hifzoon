import { http } from '../http';

/** Family timetable, cancellation, rescheduling and booking (apps/api/src/modules/scheduling). */

export type ClassStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED_FAMILY'
  | 'CANCELLED_TEACHER'
  | 'NO_SHOW_STUDENT'
  | 'NO_SHOW_TEACHER';

export type ClassType = 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';

/** Row from `GET /scheduling/families/:familyId/timetable`. */
export interface TimetableEntry {
  id: string;
  type: ClassType;
  status: ClassStatus;
  startsAt: string;
  endsAt: string;
  mushafLayout: string;
  teacher: { user: { name: string } };
  students: Array<{ student: { id: string; displayName: string } }>;
  /** ISO with offset, rendered in `viewerZone`. */
  localStart: string | null;
  localEnd: string | null;
  viewerZone: string;
}

/** Row from `GET /scheduling/open-slots`. */
export interface OpenSlot {
  teacherId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  localTime: string;
  visitorZone: string;
  teacherZone: string;
}

export interface OpenSlotQuery {
  from: string;
  to: string;
  visitorZone: string;
  durationMinutes?: number;
  courseId?: string;
  gender?: 'MALE' | 'FEMALE';
  language?: string;
  limit?: number;
}

/** `POST /scheduling/classes/:classId/cancel` result. */
export interface CancelResult {
  classId: string;
  status: ClassStatus;
  charged: boolean;
  makeUpCredits: number;
  noticeHours: number;
}

export interface BookClassInput {
  teacherId: string;
  courseId: string;
  studentId: string;
  enrolmentId?: string;
  startsAt: string;
  durationMinutes: number;
  type?: ClassType;
}

/**
 * Family cancellations inside this many hours are charged (FR-SCH-04,
 * DEFAULT_CANCELLATION_NOTICE_HOURS in @hifzoon/shared). The cancel response echoes
 * the value actually applied.
 */
export const CANCELLATION_NOTICE_HOURS = 4;

const enc = encodeURIComponent;

export const familySchedulingApi = {
  timetable: (familyId: string, params: { from: string; to: string; tz: string }) =>
    http.get<TimetableEntry[]>(`/scheduling/families/${enc(familyId)}/timetable`, { query: params }),
  /** Always cancels as FAMILY; the notice window is the academy default. */
  cancel: (classId: string, reason: string) =>
    http.post<CancelResult>(`/scheduling/classes/${enc(classId)}/cancel`, { by: 'FAMILY', reason: reason.trim() }),
  reschedule: (classId: string, newStartsAt: string, durationMinutes?: number) =>
    http.post<{ id: string; startsAt: string; endsAt: string }>(`/scheduling/classes/${enc(classId)}/reschedule`, {
      newStartsAt,
      ...(durationMinutes ? { durationMinutes } : {}),
    }),
  openSlots: (query: OpenSlotQuery) =>
    http.get<OpenSlot[]>('/scheduling/open-slots', { query: { ...query } }),
  book: (input: BookClassInput) =>
    http.post<{ id: string; startsAt: string; endsAt: string }>('/scheduling/book', {
      teacherId: input.teacherId,
      courseId: input.courseId,
      studentId: input.studentId,
      ...(input.enrolmentId ? { enrolmentId: input.enrolmentId } : {}),
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      roomType: 'ONE_TO_ONE',
      type: input.type ?? 'REGULAR',
    }),
};

export function classDurationMinutes(entry: { startsAt: string; endsAt: string }): number {
  return Math.round((new Date(entry.endsAt).getTime() - new Date(entry.startsAt).getTime()) / 60_000);
}

/** Hours from `now` until the class starts (negative once it has started). */
export function hoursUntil(startsAt: string, now = Date.now()): number {
  return (new Date(startsAt).getTime() - now) / 3_600_000;
}

/** Whether a family cancellation now would fall inside the charged notice window. */
export function isLateCancellation(startsAt: string, now = Date.now(), noticeHours = CANCELLATION_NOTICE_HOURS): boolean {
  return hoursUntil(startsAt, now) < noticeHours;
}

export function canCancel(entry: Pick<TimetableEntry, 'status' | 'startsAt'>): boolean {
  return entry.status === 'SCHEDULED' || entry.status === 'LIVE';
}

export function canReschedule(entry: Pick<TimetableEntry, 'status' | 'startsAt'>, now = Date.now()): boolean {
  return entry.status === 'SCHEDULED' && new Date(entry.startsAt).getTime() > now;
}

export function isCancelled(status: string): boolean {
  return status === 'CANCELLED_FAMILY' || status === 'CANCELLED_TEACHER';
}

/** Validates CancelClassDto.reason (1–500 chars). */
export function validateCancelReason(reason: string): string | null {
  const r = reason.trim();
  if (!r) return 'Tell the teacher why the class is cancelled.';
  if (r.length > 500) return 'Keep the reason under 500 characters.';
  return null;
}

/**
 * Keeps only slots strictly inside [from, to] — the open-slot search can return slots
 * from the day before the window when teacher and visitor zones differ.
 */
export function slotsInWindow(slots: OpenSlot[], from: Date, to: Date): OpenSlot[] {
  return slots.filter((s) => {
    const t = new Date(s.startsAt).getTime();
    return t >= from.getTime() && t <= to.getTime();
  });
}

/** Groups slots by local calendar day in `zone` (label → slots), preserving order. */
export function groupSlotsByDay(slots: OpenSlot[], zone: string): Array<{ day: string; slots: OpenSlot[] }> {
  const groups = new Map<string, OpenSlot[]>();
  for (const slot of slots) {
    let day: string;
    try {
      day = new Date(slot.startsAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone });
    } catch {
      day = slot.startsAt.slice(0, 10);
    }
    const list = groups.get(day) ?? [];
    list.push(slot);
    groups.set(day, list);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, slots: list }));
}

export function formatSlotTime(iso: string, zone: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: zone });
  } catch {
    return iso;
  }
}
