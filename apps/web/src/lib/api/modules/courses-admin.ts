import { http } from '../http';

/** Mirrors `CourseType` in packages/shared (academic.enum.ts). */
export const COURSE_TYPES = [
  'QAIDA',
  'NAZRA',
  'TAJWEED',
  'HIFZ',
  'MURAJAAH',
  'IJAZAH',
  'ARABIC',
  'TAFSIR',
  'ISLAMIC_STUDIES',
  'NEW_MUSLIM',
  'INTENSIVE',
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

/** Mirrors `EnrolmentStatus` in packages/shared. */
export const ENROLMENT_STATUSES = ['TRIAL', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

/** Row from `GET /courses` (CoursesService.catalogue — active courses for one locale). */
export interface CatalogueCourse {
  id: string;
  code: string;
  name: string;
  type: CourseType;
  description: string;
  levels: Array<{
    id: string;
    name: string;
    position: number;
    lessonCount: number;
    lessons: Array<{ id: string; title: string; position: number; objectives: unknown }>;
  }>;
}

/** `GET /courses/:id` (CoursesService.findCourse). */
export interface LessonTemplate {
  id: string;
  title: string;
  position: number;
  objectives: unknown;
  materials: unknown;
  teacherNotes: string | null;
}

export interface CourseLevel {
  id: string;
  name: string;
  position: number;
  passMark: number;
  rubric: unknown;
  lessonTemplates: LessonTemplate[];
}

export interface CourseDetail {
  id: string;
  code: string;
  name: string;
  type: CourseType;
  description: string;
  active: boolean;
  levels: CourseLevel[];
}

/** `GET /courses/enrolments/list` row (CoursesService.listEnrolments, max 200). */
export interface EnrolmentRow {
  id: string;
  status: EnrolmentStatus;
  startedAt: string | null;
  pausedUntil: string | null;
  currentLessonPosition: number;
  student: { id: string; displayName: string; birthYear: number | null; family?: { name: string } };
  course: { id: string; code: string; name: string };
  currentLevel: { id: string; name: string; position: number } | null;
  teacher: { id: string; user: { name: string } } | null;
}

/** `GET /courses/enrolments/list` returns at most this many rows (newest first). */
export const ENROLMENT_LIST_CAP = 200;

/** A live enrolment with no teacher yet — typically a family's self-enrolment (TRIAL, no teacher). */
export function isAwaitingTeacher(row: Pick<EnrolmentRow, 'status' | 'teacher'>): boolean {
  return !row.teacher && (row.status === 'TRIAL' || row.status === 'ACTIVE');
}

/**
 * Only a TRIAL row can be given a teacher: `POST /courses/enrolments` with `teacherId` upgrades
 * the student's TRIAL enrolment in place, and answers 409 for any other live enrolment.
 */
export function canAssignTeacher(row: Pick<EnrolmentRow, 'status' | 'teacher'>): boolean {
  return isAwaitingTeacher(row) && row.status === 'TRIAL';
}

/** CreateCourseDto. */
export interface CreateCourseInput {
  code: string;
  name: string;
  type: CourseType;
  description: string;
  locale?: string;
}

/** CreateLevelDto. `rubric` is `{ criterion: weight }`, as seeded (e.g. `{ recitation: 40 }`). */
export interface CreateLevelInput {
  name: string;
  passMark?: number;
  rubric?: Record<string, number>;
}

/** CreateLessonDto. `objectives` is a list of strings; `materials` is `{ label: value }`. */
export interface CreateLessonInput {
  title: string;
  objectives?: string[];
  materials?: Record<string, string>;
  teacherNotes?: string;
}

/** Non-empty trimmed lines. */
export function linesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Parses `label: value` lines into an object. The backend only checks that it is an
 * object (`@IsObject`), so the shape is enforced here.
 */
export function parseKeyValueLines(text: string): { value?: Record<string, string>; error?: string } {
  const value: Record<string, string> = {};
  for (const line of linesOf(text)) {
    const at = line.indexOf(':');
    const key = at > 0 ? line.slice(0, at).trim() : '';
    const val = at > 0 ? line.slice(at + 1).trim() : '';
    if (!key || !val) return { error: `“${line}” should look like “label: value”.` };
    if (key in value) return { error: `“${key}” appears twice.` };
    value[key] = val;
  }
  return { value: Object.keys(value).length ? value : undefined };
}

/** Rubric lines `criterion: weight`; weights are whole numbers that add up to 100. */
export function parseRubric(text: string): { value?: Record<string, number>; error?: string } {
  const parsed = parseKeyValueLines(text);
  if (parsed.error || !parsed.value) return { error: parsed.error };
  const rubric: Record<string, number> = {};
  for (const [key, raw] of Object.entries(parsed.value)) {
    const weight = Number(raw);
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
      return { error: `Weight for “${key}” must be a whole number from 0 to 100.` };
    }
    rubric[key] = weight;
  }
  const total = Object.values(rubric).reduce((a, b) => a + b, 0);
  if (total !== 100) return { error: `Rubric weights add up to ${total}; they must add up to 100.` };
  return { value: rubric };
}

export interface CreateEnrolmentInput {
  studentId: string;
  courseId: string;
  teacherId?: string;
  status?: EnrolmentStatus;
}

export interface UpdateEnrolmentStatusInput {
  status: EnrolmentStatus;
  pausedUntil?: string;
  reason?: string;
}

export interface EnrolmentFilters {
  studentId?: string;
  teacherUserId?: string;
  /** Teacher profile id (what the admin teacher filter holds). */
  teacherId?: string;
  status?: EnrolmentStatus | '';
}

export interface PagedEnrolmentFilters extends EnrolmentFilters {
  /** Only live enrolments with no teacher yet. */
  awaitingTeacher?: boolean;
  page?: number;
  limit?: number;
}

export const coursesAdminApi = {
  list: (locale = 'en') => http.get<CatalogueCourse[]>('/courses', { query: { locale } }),
  /** Always pass the UUID: lookup by code currently 500s (see report). */
  get: (courseId: string) => http.get<CourseDetail>(`/courses/${encodeURIComponent(courseId)}`),
  create: (body: CreateCourseInput) =>
    http.post<{ id: string; code: string; name: string; type: CourseType }>('/courses', body),
  createLevel: (courseId: string, body: CreateLevelInput) =>
    http.post<{ id: string; name: string; position: number }>(
      `/courses/${encodeURIComponent(courseId)}/levels`,
      body,
    ),
  createLesson: (levelId: string, body: CreateLessonInput) =>
    http.post<{ id: string; title: string; position: number }>(
      `/courses/levels/${encodeURIComponent(levelId)}/lessons`,
      body,
    ),
  listEnrolments: (filters: EnrolmentFilters = {}) =>
    http.get<EnrolmentRow[]>('/courses/enrolments/list', {
      query: {
        studentId: filters.studentId?.trim(),
        teacherUserId: filters.teacherUserId?.trim(),
        teacherId: filters.teacherId?.trim(),
        status: filters.status,
      },
    }),
  /** Paginated variant for the admin enrolments table (passing `page` opts into paging). */
  listEnrolmentsPage: (filters: PagedEnrolmentFilters = {}) =>
    http.getPage<EnrolmentRow>('/courses/enrolments/list', {
      query: {
        studentId: filters.studentId?.trim(),
        teacherUserId: filters.teacherUserId?.trim(),
        teacherId: filters.teacherId?.trim(),
        status: filters.status,
        awaitingTeacher: filters.awaitingTeacher ? 'true' : undefined,
        page: filters.page ?? 1,
        limit: filters.limit,
      },
    }),
  createEnrolment: (body: CreateEnrolmentInput) =>
    http.post<{ id: string; status: EnrolmentStatus; course: { id: string; code: string; name: string } }>(
      '/courses/enrolments',
      body,
    ),
  updateEnrolmentStatus: (enrolmentId: string, body: UpdateEnrolmentStatusInput) =>
    http.patch<{ id: string; status: EnrolmentStatus; pausedUntil: string | null }>(
      `/courses/enrolments/${encodeURIComponent(enrolmentId)}/status`,
      body,
    ),
  setLessonPosition: (enrolmentId: string, position: number) =>
    http.patch<{ id: string; currentLessonPosition: number }>(
      `/courses/enrolments/${encodeURIComponent(enrolmentId)}/lesson-position`,
      { position },
    ),
};

// ── Client-side validation mirroring the DTOs ───────────────────────────────

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID_RE.test(value.trim());

export function validateCourse(input: CreateCourseInput): FieldErrors<keyof CreateCourseInput> {
  const errors: FieldErrors<keyof CreateCourseInput> = {};
  const code = input.code.trim();
  if (!code) errors.code = 'Code is required.';
  else if (code.length > 40) errors.code = 'Code must be at most 40 characters.';
  const name = input.name.trim();
  if (name.length < 2) errors.name = 'Name must be at least 2 characters.';
  else if (name.length > 160) errors.name = 'Name must be at most 160 characters.';
  if (!COURSE_TYPES.includes(input.type)) errors.type = 'Choose a course type.';
  if (!input.description.trim()) errors.description = 'Description is required.';
  if (input.locale && input.locale.trim().length > 5) errors.locale = 'Locale must be at most 5 characters.';
  return errors;
}

export function validateLevel(input: { name: string; passMark: string }): FieldErrors<'name' | 'passMark'> {
  const errors: FieldErrors<'name' | 'passMark'> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = 'Name must be at least 2 characters.';
  else if (name.length > 160) errors.name = 'Name must be at most 160 characters.';
  if (input.passMark.trim() !== '') {
    const n = Number(input.passMark);
    if (!Number.isInteger(n) || n < 0) errors.passMark = 'Pass mark must be a whole number of 0 or more.';
  }
  return errors;
}

export function validateLesson(input: { title: string }): FieldErrors<'title'> {
  const title = input.title.trim();
  if (title.length < 2) return { title: 'Title must be at least 2 characters.' };
  if (title.length > 200) return { title: 'Title must be at most 200 characters.' };
  return {};
}

/** Turns stored lesson objectives JSON (array of strings, or anything else) into display lines. */
export function objectivesToLines(objectives: unknown): string[] {
  if (Array.isArray(objectives)) {
    return objectives
      .map((o) => (typeof o === 'string' ? o : o && typeof o === 'object' && 'text' in o ? String((o as { text: unknown }).text) : JSON.stringify(o)))
      .filter((s) => s.trim().length > 0);
  }
  if (typeof objectives === 'string' && objectives.trim()) return [objectives];
  return [];
}
