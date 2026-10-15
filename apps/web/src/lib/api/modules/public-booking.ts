import { http } from '../http';

/**
 * Public trial booking. There is no public "book a trial" endpoint (`POST /trials` is
 * ADMIN-only), so the real flow is:
 *
 *   GET  /scheduling/open-slots          (public)   — pick a slot in the visitor's zone
 *   sign in / register as GUARDIAN
 *   GET  /families  → POST /families      (GUARDIAN) — make sure a family exists
 *   GET  /families/:id/students → POST /families/:id/students
 *   GET  /consent/students/:id → POST /consent/students/:id/grant  (DATA_COLLECTION)
 *   POST /scheduling/book { type: 'TRIAL' } (GUARDIAN)
 *
 * Shapes mirror apps/api/src/modules/{scheduling,families,consent,teachers}.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** `GET /scheduling/open-slots` row (SchedulingService.findOpenSlots). */
export interface OpenSlot {
  teacherId: string;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  /** Pre-formatted `ccc dd LLL, HH:mm` in `visitorZone`. */
  localTime: string;
  visitorZone: string;
  teacherZone: string;
}

export interface OpenSlotsQuery {
  from: string;
  to: string;
  visitorZone: string;
  durationMinutes?: number;
  gender?: 'MALE' | 'FEMALE';
  language?: string;
  ageGroup?: string;
  limit?: number;
}

/** `GET /teachers/public` row (used to match a course to teachers who list it as a subject). */
export interface BookableTeacher {
  id: string;
  bio: string | null;
  photoUrl: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  publicRatingAvg: string | null;
  user: { name: string };
}

/** `GET /families` row (FamiliesService.listForUser). */
export interface GuardianFamily {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  createdAt: string;
  members: Array<{ isPrimary: boolean; verifiedAt: string | null; relationship: string }>;
}

/** `POST /families` body (CreateFamilyDto). */
export interface CreateFamilyInput {
  name: string;
  country?: string;
  currency?: 'USD' | 'GBP' | 'CAD' | 'AUD' | 'AED' | 'PKR';
  timeZone?: string;
}

/** `GET /families/:id/students` row (FamiliesService.listStudents). */
export interface FamilyStudent {
  id: string;
  displayName: string;
  birthYear: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  language: string;
  timeZone: string;
  kidsMode: boolean;
  userId: string | null;
  createdAt: string;
}

/** `POST /families/:id/students` body (AddStudentDto). */
export interface AddChildInput {
  displayName: string;
  birthYear: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  language?: string;
  timeZone?: string;
}

export interface AddedChild extends Omit<FamilyStudent, 'userId' | 'createdAt'> {
  requiresConsent: boolean;
  nextStep: 'GRANT_DATA_COLLECTION_CONSENT' | null;
}

/** `GET /consent/students/:id` (ConsentService.getForStudent). */
export interface StudentConsentState {
  studentId: string;
  purposes: Array<{
    purpose: string;
    status: 'GRANTED' | 'WITHDRAWN' | string;
    grantedAt: string | null;
    withdrawnAt: string | null;
    policyVersion: string | null;
  }>;
}

/** `POST /scheduling/book` body (BookSlotDto). */
export interface BookSlotInput {
  teacherId: string;
  courseId: string;
  studentId: string;
  enrolmentId?: string;
  startsAt: string;
  durationMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  type: 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';
}

/** `POST /scheduling/book` response (the created `class_session`). */
export interface BookedClass {
  id: string;
  startsAt: string;
  endsAt: string;
}

// ── Constants & validation (mirror the backend DTOs) ─────────────────────────

export const TRIAL_DURATION_MINUTES = 30;
export const SLOT_SEARCH_DAYS = 14;
/** The API refuses windows wider than 62 days. */
export const MAX_SEARCH_DAYS = 62;
export const CONSENT_POLICY_VERSION = '1.0';
export const MIN_LEARNER_AGE = 3;
export const MAX_LEARNER_AGE = 25;

export function validateFamily(input: CreateFamilyInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = 'Family name needs at least 2 characters.';
  if (name.length > 160) errors.name = 'Family name cannot exceed 160 characters.';
  if (input.country && !/^[A-Z]{2}$/.test(input.country)) errors.country = 'Choose a country.';
  return errors;
}

/** AddStudentDto + the service's "age 3–25" sanity check. */
export function validateChild(input: AddChildInput, currentYear = new Date().getUTCFullYear()): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.displayName.trim();
  if (name.length < 1) errors.displayName = "Enter the learner's first name.";
  if (name.length > 120) errors.displayName = 'Name cannot exceed 120 characters.';
  if (!Number.isInteger(input.birthYear) || input.birthYear < 1990 || input.birthYear > currentYear) {
    errors.birthYear = `Birth year must be between 1990 and ${currentYear}.`;
  } else {
    const age = currentYear - input.birthYear;
    if (age < MIN_LEARNER_AGE || age > MAX_LEARNER_AGE) {
      errors.birthYear = `Learners must be between ${MIN_LEARNER_AGE} and ${MAX_LEARNER_AGE} years old.`;
    }
  }
  if (!['MALE', 'FEMALE', 'OTHER'].includes(input.gender)) errors.gender = 'Choose an option.';
  return errors;
}

export function learnerAge(birthYear: number, currentYear = new Date().getUTCFullYear()): number {
  return currentYear - birthYear;
}

export function hasDataCollectionConsent(state: StudentConsentState | undefined | null): boolean {
  return !!state?.purposes.some((p) => p.purpose === 'DATA_COLLECTION' && p.status === 'GRANTED');
}

// ── Time-zone & slot helpers ──────────────────────────────────────────────────

export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's IANA zone, or UTC when it cannot be detected. */
export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** `YYYY-MM-DD` of an instant as seen in `timeZone`. */
export function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatSlotTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { timeZone, hour: '2-digit', minute: '2-digit' });
}

export function formatSlotDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString(undefined, { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatSlotFull(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString(undefined, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface SlotDay {
  key: string;
  label: string;
  slots: OpenSlot[];
}

/** Groups slots by calendar day in the visitor's zone, chronologically. */
export function groupSlotsByDay(slots: OpenSlot[], timeZone: string): SlotDay[] {
  const sorted = [...slots].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const days = new Map<string, SlotDay>();
  for (const slot of sorted) {
    const key = dayKey(slot.startsAt, timeZone);
    if (!days.has(key)) days.set(key, { key, label: formatSlotDay(slot.startsAt, timeZone), slots: [] });
    days.get(key)!.slots.push(slot);
  }
  return [...days.values()];
}

/** Search window `[today, today + days]` as ISO dates. */
export function searchWindow(days = SLOT_SEARCH_DAYS, now = new Date()): { from: string; to: string } {
  const span = Math.min(Math.max(days, 1), MAX_SEARCH_DAYS);
  const to = new Date(now.getTime() + span * 86_400_000);
  return { from: now.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── Calendar file ─────────────────────────────────────────────────────────────

function icsStamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 calendar file for one booked class (UTC times, CRLF line endings). */
export function buildIcs(event: {
  classId: string;
  startsAt: string;
  endsAt: string;
  summary: string;
  description?: string;
  url?: string;
  now?: Date;
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hifzoon//Trial booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.classId}@hifzoon`,
    `DTSTAMP:${icsStamp((event.now ?? new Date()).toISOString())}`,
    `DTSTART:${icsStamp(event.startsAt)}`,
    `DTEND:${icsStamp(event.endsAt)}`,
    `SUMMARY:${icsEscape(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${icsEscape(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

// ── Booking selection carried through sign-in / registration ─────────────────

export interface BookingSelection {
  course?: string;
  teacher?: string;
  gender?: 'MALE' | 'FEMALE';
  language?: string;
  tz?: string;
  slotTeacher?: string;
  slotTeacherName?: string;
  slotStart?: string;
  slotEnd?: string;
}

const SELECTION_KEYS: Array<keyof BookingSelection> = [
  'course', 'teacher', 'gender', 'language', 'tz', 'slotTeacher', 'slotTeacherName', 'slotStart', 'slotEnd',
];

/** `/book-trial?course=HIFZ&slotStart=...` — safe to pass as `?redirect=` to /login and /register. */
export function bookingPath(selection: BookingSelection): string {
  const params = new URLSearchParams();
  for (const key of SELECTION_KEYS) {
    const value = selection[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `/book-trial?${qs}` : '/book-trial';
}

export function parseBookingSelection(params: { get: (key: string) => string | null }): BookingSelection {
  const out: BookingSelection = {};
  for (const key of SELECTION_KEYS) {
    const value = params.get(key);
    if (value) (out as Record<string, string>)[key] = value.slice(0, 200);
  }
  if (out.gender && out.gender !== 'MALE' && out.gender !== 'FEMALE') delete out.gender;
  if (out.tz && !isValidTimeZone(out.tz)) delete out.tz;
  for (const key of ['slotStart', 'slotEnd'] as const) {
    if (out[key] && Number.isNaN(new Date(out[key]!).getTime())) delete out[key];
  }
  return out;
}

// ── API ───────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent;

export const bookingApi = {
  openSlots: (q: OpenSlotsQuery) => http.get<OpenSlot[]>('/scheduling/open-slots', { query: { ...q } }),
  teachers: (filter: { subject?: string; language?: string } = {}) =>
    http.get<BookableTeacher[]>('/teachers/public', { query: filter }),
  myFamilies: () => http.get<GuardianFamily[]>('/families'),
  createFamily: (body: CreateFamilyInput) => http.post<GuardianFamily>('/families', body),
  students: (familyId: string) => http.get<FamilyStudent[]>(`/families/${enc(familyId)}/students`),
  addChild: (familyId: string, body: AddChildInput) =>
    http.post<AddedChild>(`/families/${enc(familyId)}/students`, body),
  consent: (studentId: string) => http.get<StudentConsentState>(`/consent/students/${enc(studentId)}`),
  grantDataCollection: (studentId: string) =>
    http.post<unknown[]>(`/consent/students/${enc(studentId)}/grant`, {
      purposes: ['DATA_COLLECTION'],
      method: 'SIGNED_FORM',
      policyVersion: CONSENT_POLICY_VERSION,
    }),
  book: (body: BookSlotInput) => http.post<BookedClass>('/scheduling/book', body),
};
