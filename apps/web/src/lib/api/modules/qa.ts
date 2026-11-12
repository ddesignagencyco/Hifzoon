import { http } from '../http';

/**
 * Quality assurance (apps/api/src/modules/qa/qa.controller.ts):
 *   - `QualityRatingsController` — `GET /quality/teachers/:teacherId/rating` (any signed-in user)
 *   - `QaController` (SUPERVISOR, SUPER_ADMIN) — rubric reviews, monthly sample, scorecard
 * plus the read-only sources a supervisor needs to pick a teacher and a class:
 *   - `GET /teachers/public` (TeachersService.listPublicProfiles)
 *   - `GET /scheduling/teachers/:teacherId/timetable` (SchedulingService.teacherTimetable)
 *
 * Every `teacherId` here is a **TeacherProfile id**, not a user id.
 */

/** `GET /teachers/public` row. `publicRatingAvg` is a Prisma Decimal → string. */
export interface SupervisedTeacher {
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

/** `GET /quality/teachers/:teacherId/rating` (RatingsService.teacherSummary). */
export interface TeacherRatingSummary {
  teacherId: string;
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
}

/** `GET /qa/teachers/:teacherId/scorecard` (QaService.teacherScorecard). */
export interface TeacherScorecard {
  teacherId: string;
  windowMonths: number;
  reviewsCount: number;
  overallAverage: number | null;
  criteria: Array<{ key: string; average: number; count: number; flag: boolean }>;
  awaitingReply: number;
  sampled: number;
}

export type QaSource = 'RANDOM_SAMPLE' | 'MANUAL';

/** `qa_review` row returned by `POST /qa/classes/:classId/review`. */
export interface QaReview {
  id: string;
  classId: string;
  supervisorId: string;
  rubricId: string;
  scores: Record<string, number>;
  feedback: string | null;
  teacherReply: string | null;
  reviewedAt: string;
  source: QaSource;
}

/** `POST /qa/classes/:classId/review` body (zod `reviewBody`). */
export interface SubmitReviewInput {
  rubricId?: string;
  scores: Record<string, number>;
  feedback?: string;
  source?: QaSource;
}

export interface QaSampleRecord {
  id: string;
  teacherId: string;
  classId: string;
  period: string;
  source: QaSource;
  createdAt: string;
}

/** `POST /qa/teachers/:teacherId/sample` (QaService.sampleForPeriod) — SUPER_ADMIN only. */
export interface QaSampleResult {
  period: string;
  sampled: QaSampleRecord[];
  created?: number;
  alreadySampled: boolean;
}

/** `GET /scheduling/teachers/:teacherId/timetable` row. */
export interface TeacherTimetableEntry {
  id: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  roomId: string | null;
  course: { name: string; code: string } | null;
  students: Array<{ student: { id: string; displayName: string } }>;
  localStart: string | null;
  localEnd: string | null;
  viewerZone: string;
}

export interface RubricCriterion {
  key: string;
  label: string;
  weight: number;
}

/**
 * The backend has no endpoint that lists `qa_rubric` rows. When `rubricId` is omitted
 * `QaService.defaultRubricId()` uses the oldest active rubric, which the seed creates as
 * "Standard lesson rubric" (apps/api/prisma/seed.ts `seedQaRubrics`). This mirrors its
 * criteria keys so the form can score every criterion; if the server rubric ever differs
 * the API rejects the review with the missing key and the form shows that error verbatim.
 */
export const STANDARD_RUBRIC: { name: string; items: RubricCriterion[] } = {
  name: 'Standard lesson rubric',
  items: [
    { key: 'opening', label: "Opened with du'a and a check-in on the student", weight: 1 },
    { key: 'portion', label: 'Taught the assigned portion from the plan', weight: 3 },
    { key: 'tajweed', label: 'Corrected Tajweed rules in context, not in the abstract', weight: 2 },
    { key: 'pacing', label: 'Kept pace appropriate to this student', weight: 2 },
    { key: 'closing', label: 'Closed with homework and a clear next portion', weight: 2 },
  ],
};

export const SCORE_MIN = 0;
export const SCORE_MAX = 5;
export const FEEDBACK_MAX = 4000;
export const SCORECARD_MONTHS_MAX = 24;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value.trim());
}

/** Client-side mirror of the zod `reviewBody` + the service's "score every criterion" rule. */
export function validateReview(
  classId: string,
  input: SubmitReviewInput,
  rubric: RubricCriterion[] = STANDARD_RUBRIC.items,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isUuid(classId)) errors.classId = 'Enter a valid class id (UUID).';
  for (const item of rubric) {
    const score = input.scores[item.key];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
      errors[`score.${item.key}`] = `Score "${item.label}" from ${SCORE_MIN} to ${SCORE_MAX}.`;
    }
  }
  if (input.feedback && input.feedback.length > FEEDBACK_MAX) {
    errors.feedback = `Feedback cannot exceed ${FEEDBACK_MAX} characters.`;
  }
  return errors;
}

const enc = encodeURIComponent;

export const qaApi = {
  /** Approved, ready-to-match teachers (the only teacher list a supervisor can read). */
  teachers: (filter: { subject?: string; language?: string } = {}) =>
    http.get<SupervisedTeacher[]>('/teachers/public', { query: filter }),
  teacherRating: (teacherId: string) =>
    http.get<TeacherRatingSummary>(`/quality/teachers/${enc(teacherId)}/rating`),
  scorecard: (teacherId: string, months = 3) =>
    http.get<TeacherScorecard>(`/qa/teachers/${enc(teacherId)}/scorecard`, { query: { months } }),
  submitReview: (classId: string, body: SubmitReviewInput) =>
    http.post<QaReview>(`/qa/classes/${enc(classId)}/review`, body),
  drawSample: (teacherId: string) => http.post<QaSampleResult>(`/qa/teachers/${enc(teacherId)}/sample`),
  teacherTimetable: (teacherId: string, range: { from: string; to: string; tz: string }) =>
    http.get<TeacherTimetableEntry[]>(`/scheduling/teachers/${enc(teacherId)}/timetable`, { query: range }),
};

/** Classes a supervisor can meaningfully review: already taught or in progress. */
export function reviewableClasses(entries: TeacherTimetableEntry[], now = Date.now()): TeacherTimetableEntry[] {
  return entries
    .filter((e) => e.status === 'COMPLETED' || e.status === 'LIVE' || new Date(e.startsAt).getTime() <= now)
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
}

/** Average rating to one decimal, or null when there are no ratings. */
export function parseRating(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

// ── Review queue, past reviews, rubrics, metrics, caseloads (Nov 2026) ──────

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface QueueItem {
  sampleId: string;
  period: string;
  source: QaSource;
  sampledAt: string;
  waitingDays: number;
  teacher: { id: string; name: string };
  class: { id: string; startsAt: string; course: string; type: string; status: string; hasRecording: boolean };
}

export interface ReviewSummary {
  id: string;
  reviewedAt: string;
  source: QaSource;
  average: number | null;
  feedback: string | null;
  teacherReply: string | null;
  hasReply: boolean;
  supervisor: unknown;
  teacher: { id: string; name: string };
  class: { id: string; startsAt: string; course: string };
}

export interface ReviewDetail extends ReviewSummary {
  rubric: { id: string; name: string };
  criteria: Array<RubricCriterion & { score: number | null }>;
}

export interface Rubric {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  reviewCount: number;
  criteria: RubricCriterion[];
  /** False once any review used it: create a new version instead. */
  editable: boolean;
}

export interface Rate {
  rate: number | null;
}
export interface TeacherMetrics {
  teacherId: string;
  name: string;
  windowMonths: number;
  attendance: Rate & { completed: number; teacherNoShow: number; teacherCancelled: number; studentNoShow: number; familyCancelled: number };
  punctuality: Rate & { classes: number; onTime: number; withinMinutes: number; averageLateMinutes: number | null };
  lessonCards: Rate & { completedClasses: number; withSubmittedCard: number };
  retention: Rate & { enrolmentsBeforeWindow: number; stillEnrolled: number };
  progress: { gradedPortions: number; goodOrBetter: number; goodShare: number | null };
}

export interface CaseloadTeacher {
  teacherId: string;
  teacherUserId: string;
  name: string;
  assignedAt: string;
}

export interface RubricInput {
  name: string;
  criteria: RubricCriterion[];
  activate?: boolean;
}

/** Mirrors the API's criteria rules: key a-z/0-9/_ (2–31), label 3–120, weight 1–5, 1–20 criteria. */
export function validateRubric(name: string, criteria: RubricCriterion[]): string | null {
  if (name.trim().length < 3) return 'Give the rubric a name (at least 3 characters).';
  if (criteria.length < 1 || criteria.length > 20) return 'A rubric needs 1 to 20 criteria.';
  const keys = new Set<string>();
  for (const c of criteria) {
    if (!/^[a-z0-9_]{2,31}$/.test(c.key)) return `Key “${c.key}” must be 2–31 lowercase letters, digits or _.`;
    if (keys.has(c.key)) return `Key “${c.key}” is used twice.`;
    keys.add(c.key);
    if (c.label.trim().length < 3) return `Give “${c.key}” a label (at least 3 characters).`;
    if (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 5) return `Weight for “${c.key}” must be 1 to 5.`;
  }
  return null;
}

export const qaInsightsApi = {
  queue: (q: { period?: string; teacherId?: string; page?: number; limit?: number }) =>
    http.get<Paged<QueueItem>>('/qa/queue', { query: q }),
  reviews: (q: { teacherId?: string; replied?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    http.get<Paged<ReviewSummary>>('/qa/reviews', { query: q }),
  review: (id: string) => http.get<ReviewDetail>(`/qa/reviews/${enc(id)}`),
  rubrics: () => http.get<Rubric[]>('/qa/rubrics'),
  createRubric: (body: RubricInput) => http.post<unknown>('/qa/rubrics', body),
  updateRubric: (id: string, body: Partial<RubricInput>) => http.patch<unknown>(`/qa/rubrics/${enc(id)}`, body),
  activateRubric: (id: string) => http.post<unknown>(`/qa/rubrics/${enc(id)}/activate`),
  metrics: (teacherId: string, months = 3) =>
    http.get<TeacherMetrics>(`/qa/teachers/${enc(teacherId)}/metrics`, { query: { months } }),
  myCaseload: () => http.get<CaseloadTeacher[]>('/supervision/me/teachers'),
  caseload: (supervisorId: string) => http.get<CaseloadTeacher[]>(`/supervision/supervisors/${enc(supervisorId)}/teachers`),
  assign: (supervisorId: string, teacherId: string) =>
    http.put<CaseloadTeacher[]>(`/supervision/supervisors/${enc(supervisorId)}/teachers/${enc(teacherId)}`),
  unassign: (supervisorId: string, teacherId: string) =>
    http.delete<CaseloadTeacher[]>(`/supervision/supervisors/${enc(supervisorId)}/teachers/${enc(teacherId)}`),
};
