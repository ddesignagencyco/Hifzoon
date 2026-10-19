import { http } from '../http';

/**
 * Scheduling operations for admins (SchedulingController) plus the catalogue and
 * enrolment reads they need to pick ids.
 */

export type RoomType = 'ONE_TO_ONE' | 'CIRCLE';

/** `CreateScheduleDto`. */
export interface CreateScheduleInput {
  enrolmentId: string;
  teacherId: string;
  rrule: string;
  /** HH:mm in the family's zone. */
  localStartTime: string;
  familyTimeZone: string;
  durationMinutes: number;
  roomType: RoomType;
  /** YYYY-MM-DD in the family's zone. */
  startsOn: string;
  endsOn?: string;
}

export interface CreatedSchedule {
  scheduleId: string;
  familyTimeZone: string;
  localStartTime: string;
  rrule: string;
  materialisedUntil: string | null;
  sessions: Array<{ id: string; startsAt: string; endsAt: string; localStart: string }>;
  /** Clashes skipped by the materialiser run this request triggered (counts every due schedule, not only this one). */
  skippedConflicts: number;
}

export interface ScheduleDetail {
  id: string;
  rrule: string;
  localStartTime: string;
  familyTimeZone: string;
  durationMinutes: number;
  roomType: RoomType;
  startsOn: string;
  endsOn: string | null;
  status: string;
  materialisedUntil: string | null;
  enrolment: { id: string; student: { displayName: string } };
  teacher: { id: string; user: { name: string } };
  sessions: Array<{ id: string; startsAt: string; endsAt: string; status: string; localStart: string }>;
}

export interface MatchSuggestion {
  teacherId: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  gender: string | null;
  languages: string[];
  subjects: string[];
  ratingAvg: number;
  ratingCount: number;
  timeZone: string;
  /** 0 = Sunday … 6 = Saturday (teacher's zone). */
  availableWeekdays: number[];
  score: number;
  reasons: string[];
}

export interface MatchingResult {
  studentId: string;
  courseId: string;
  suggestions: MatchSuggestion[];
}

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
  ageGroup?: string;
  limit?: number;
}

export interface TimetableEntry {
  id: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  course: { name: string; code: string };
  students: Array<{ student: { id: string; displayName: string } }>;
  localStart: string;
  localEnd: string;
  viewerZone: string;
}

export interface TeacherAvailability {
  teacherId: string;
  timeZone: string;
  slots: Array<{
    weekday: number;
    startTime: string;
    endTime: string;
    timeZone: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }>;
}

/** `GET /courses/enrolments/list` row. */
export interface EnrolmentListItem {
  id: string;
  status: string;
  startedAt: string | null;
  pausedUntil: string | null;
  currentLessonPosition: number | null;
  student: { id: string; displayName: string; birthYear: number };
  course: { id: string; code: string; name: string };
  currentLevel: { id: string; name: string; position: number } | null;
  teacher: { id: string; user: { name: string } } | null;
}

/** `GET /courses` row (CoursesService.catalogue). */
export interface CatalogueCourse {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string;
  levels: Array<{ id: string; name: string; position: number; lessonCount: number }>;
}

const enc = encodeURIComponent;


/** Open slots by start time — the API returns truncated results in teacher order (backend B11). */
function byStart<T extends { startsAt: string }>(slots: T[]): T[] {
  return [...slots].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export const schedulingAdminApi = {
  createSchedule: (body: CreateScheduleInput) => http.post<CreatedSchedule>('/scheduling/schedules', body),
  getSchedule: (scheduleId: string) => http.get<ScheduleDetail>(`/scheduling/schedules/${enc(scheduleId)}`),
  matching: (studentId: string, courseId: string) =>
    http.get<MatchingResult>(`/scheduling/matching/${enc(studentId)}`, { query: { courseId } }),
  openSlots: (query: OpenSlotQuery) => http.get<OpenSlot[]>('/scheduling/open-slots', { query: { ...query } }).then(byStart),
  teacherTimetable: (teacherId: string, params: { from: string; to: string; tz: string }) =>
    http.get<TimetableEntry[]>(`/scheduling/teachers/${enc(teacherId)}/timetable`, { query: params }),
  availability: (teacherId: string) =>
    http.get<TeacherAvailability>(`/scheduling/teachers/${enc(teacherId)}/availability`),
  listEnrolments: (params: { studentId?: string; status?: string } = {}) =>
    http.get<EnrolmentListItem[]>('/courses/enrolments/list', { query: params }),
  listCourses: () => http.get<CatalogueCourse[]>('/courses'),
};

// ── RRULE builder (backend supports FREQ=DAILY|WEEKLY, INTERVAL 1..12, BYDAY, COUNT, UNTIL) ──

export type RRuleWeekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';
/** Indexed 0 = Sunday … 6 = Saturday, matching availability/matching weekday numbers. */
export const WEEKDAYS: Array<{ code: RRuleWeekday; short: string; long: string }> = [
  { code: 'SU', short: 'Sun', long: 'Sunday' },
  { code: 'MO', short: 'Mon', long: 'Monday' },
  { code: 'TU', short: 'Tue', long: 'Tuesday' },
  { code: 'WE', short: 'Wed', long: 'Wednesday' },
  { code: 'TH', short: 'Thu', long: 'Thursday' },
  { code: 'FR', short: 'Fri', long: 'Friday' },
  { code: 'SA', short: 'Sat', long: 'Saturday' },
];

export interface RecurrenceSpec {
  freq: 'WEEKLY' | 'DAILY';
  interval: number;
  byDay: RRuleWeekday[];
  end: { kind: 'never' } | { kind: 'count'; count: number } | { kind: 'until'; date: string };
}

/** Serialises a recurrence to the RRULE text the backend parser accepts. */
export function buildRRule(spec: RecurrenceSpec): string {
  const parts = [`FREQ=${spec.freq}`];
  if (spec.interval !== 1) parts.push(`INTERVAL=${spec.interval}`);
  if (spec.freq === 'WEEKLY' && spec.byDay.length > 0) {
    const ordered = WEEKDAYS.map((d) => d.code).filter((c) => spec.byDay.includes(c));
    // RFC 5545 week starts Monday; keep Sunday last for readability.
    const mondayFirst = [...ordered.filter((c) => c !== 'SU'), ...ordered.filter((c) => c === 'SU')];
    parts.push(`BYDAY=${mondayFirst.join(',')}`);
  }
  if (spec.end.kind === 'count') parts.push(`COUNT=${spec.end.count}`);
  // Floating local end-of-day so a class on the end date itself is still included.
  if (spec.end.kind === 'until') parts.push(`UNTIL=${spec.end.date.replace(/-/g, '')}T235959`);
  return parts.join(';');
}

/** Validates a recurrence against the backend parser's rules. */
export function validateRecurrence(spec: RecurrenceSpec, startsOn?: string): string | null {
  if (!Number.isInteger(spec.interval) || spec.interval < 1 || spec.interval > 12)
    return 'Repeat interval must be a whole number from 1 to 12.';
  if (spec.freq === 'WEEKLY' && spec.byDay.length === 0) return 'Pick at least one weekday.';
  if (spec.end.kind === 'count' && (!Number.isInteger(spec.end.count) || spec.end.count < 1))
    return 'Number of classes must be a positive whole number.';
  if (spec.end.kind === 'until') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.end.date)) return 'Choose an end date.';
    if (startsOn && spec.end.date < startsOn) return 'The end date must be on or after the start date.';
  }
  return null;
}

/** Human summary of an RRULE string (best effort; falls back to the raw text). */
export function describeRRule(rrule: string): string {
  const map = new Map(
    rrule
      .replace(/^RRULE:/i, '')
      .split(';')
      .filter(Boolean)
      .map((p) => {
        const [k, v] = p.split('=');
        return [k?.toUpperCase(), v] as const;
      }),
  );
  const freq = map.get('FREQ')?.toUpperCase();
  if (freq !== 'WEEKLY' && freq !== 'DAILY') return rrule;
  const interval = Number(map.get('INTERVAL') ?? 1);
  const unit = freq === 'WEEKLY' ? 'week' : 'day';
  let text = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
  const byDay = map.get('BYDAY');
  if (byDay) {
    const names = byDay.split(',').map((c) => WEEKDAYS.find((d) => d.code === c.trim().toUpperCase())?.short ?? c);
    text += ` on ${names.join(', ')}`;
  }
  if (map.get('COUNT')) text += `, ${map.get('COUNT')} classes`;
  const until = map.get('UNTIL');
  if (until && /^\d{8}/.test(until)) text += `, until ${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`;
  return text;
}

export const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ScheduleFormErrors {
  enrolmentId?: string;
  teacherId?: string;
  localStartTime?: string;
  familyTimeZone?: string;
  durationMinutes?: string;
  startsOn?: string;
  endsOn?: string;
  recurrence?: string;
}

/** Mirrors `CreateScheduleDto` + rrule parser rules. */
export function validateScheduleInput(
  input: Omit<CreateScheduleInput, 'rrule'>,
  recurrence: RecurrenceSpec,
): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {};
  if (!input.enrolmentId.trim()) errors.enrolmentId = 'Choose an enrolment.';
  if (!input.teacherId.trim()) errors.teacherId = 'Choose a teacher.';
  if (!HHMM_RE.test(input.localStartTime)) errors.localStartTime = 'Start time must be HH:mm.';
  if (!input.familyTimeZone || input.familyTimeZone.length > 64 || !isValidTimeZone(input.familyTimeZone))
    errors.familyTimeZone = 'Choose a valid IANA time zone.';
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 480)
    errors.durationMinutes = 'Duration must be 5–480 minutes.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) errors.startsOn = 'Choose a start date.';
  if (input.endsOn && input.endsOn < input.startsOn) errors.endsOn = 'End date must be after the start date.';
  const rec = validateRecurrence(recurrence, input.startsOn);
  if (rec) errors.recurrence = rec;
  return errors;
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** IANA zones known to the browser, with a short fallback list. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const zones = intl.supportedValuesOf?.('timeZone');
    if (zones && zones.length > 0) return zones.includes('UTC') ? zones : ['UTC', ...zones];
  } catch {
    /* fall through */
  }
  return ['UTC', 'Europe/London', 'America/New_York', 'America/Toronto', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Riyadh', 'Australia/Sydney'];
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
