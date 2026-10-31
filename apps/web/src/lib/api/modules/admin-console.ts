import { http } from '../http';

/**
 * Admin console (`/admin/console/*`, AdminConsoleController) — SUPER_ADMIN only.
 * Types mirror AdminConsoleService return shapes exactly.
 */

export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';
export const USER_STATUSES: UserStatus[] = ['ACTIVE', 'LOCKED', 'DISABLED'];

export type StaffRole =
  | 'CHILD_STUDENT'
  | 'STUDENT'
  | 'GUARDIAN'
  | 'TEACHER'
  | 'EXAMINER'
  | 'SUPERVISOR'
  | 'ADMIN'
  | 'SUPER_ADMIN'
  | 'SAFEGUARDING_LEAD';

export const ALL_ROLES: StaffRole[] = [
  'GUARDIAN',
  'STUDENT',
  'CHILD_STUDENT',
  'TEACHER',
  'EXAMINER',
  'SUPERVISOR',
  'SAFEGUARDING_LEAD',
  'ADMIN',
  'SUPER_ADMIN',
];

/** `GET /admin/console/overview` (AdminConsoleService.overview). */
export interface AdminOverview {
  students: number;
  families: number;
  /** Teacher profiles with hiringStatus APPROVED. */
  teachers: number;
  /** Classes SCHEDULED or LIVE. */
  activeClasses: number;
  /** Cases OPEN or INVESTIGATING. */
  openCases: number;
  /** CRM tasks OPEN and past due. */
  overdueTasks: number;
}

export type SearchEntity = 'students' | 'families' | 'teachers' | 'classes';
export const SEARCH_ENTITIES: SearchEntity[] = ['students', 'families', 'teachers', 'classes'];

interface UserRef {
  id: string;
  email: string | null;
  name: string;
}

export interface StudentSearchHit {
  id: string;
  familyId: string;
  userId: string | null;
  displayName: string;
  birthYear: number;
  gender: string | null;
  language: string;
  timeZone: string;
  kidsMode: boolean;
  createdAt: string;
  family: { id: string; name: string; members: Array<{ user: UserRef }> };
  enrolments: Array<{
    id: string;
    status: string;
    teacher: { user: { id: string; name: string } } | null;
    course: { id: string; name: string };
  }>;
}

export interface FamilySearchHit {
  id: string;
  name: string;
  country: string | null;
  currency: string | null;
  timeZone: string | null;
  createdAt: string;
  members: Array<{
    relationship: string;
    user: UserRef & { phone: string | null; status: UserStatus };
  }>;
  students: Array<{ id: string; displayName: string; birthYear: number }>;
}

export interface TeacherSearchHit {
  id: string;
  userId: string;
  hiringStatus: string;
  readyToMatch: boolean;
  languages: string[];
  subjects: string[];
  createdAt: string;
  user: UserRef & { phone: string | null; status: UserStatus };
  _count: { enrolments: number; classes: number };
}

export interface ClassSearchHit {
  id: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  course: { id: string; name: string };
  teacher: { id: string; user: { id: string; name: string } };
  _count: { participants: number; students: number };
}

export interface SearchResultMap {
  students: StudentSearchHit;
  families: FamilySearchHit;
  teachers: TeacherSearchHit;
  classes: ClassSearchHit;
}

export interface SearchResult<E extends SearchEntity = SearchEntity> {
  entity: E;
  items: Array<SearchResultMap[E]>;
  total: number;
  tookAt: string;
}

/** `PATCH users/:id/status` echo (select id, status, email, name). */
export interface UserStatusResult {
  id: string;
  status: UserStatus;
  email: string | null;
  name: string;
}

/** `PATCH users/:id/roles` echo — `roles` are UserRole rows. */
export interface UserRolesResult extends UserStatusResult {
  roles: Array<{ role: StaffRole; [key: string]: unknown }>;
}

/** `GET teachers/:teacherId/readiness`. */
export interface TeacherReadiness {
  teacherId: string;
  readyToMatch: boolean;
  hiringStatus: string;
  /** R2 — the teacher's tier, also for teachers not yet in the public directory. */
  tier?: { id: string; code: string; name: string; badgeIcon: string | null } | null;
  safeguardingTrainingCompleted: boolean;
  outstandingSteps: string[];
  blockers: string[];
}

/** Body of `POST /admin/console/teachers` (provisionTeacherBody zod schema). */
export interface ProvisionTeacherInput {
  email: string;
  name: string;
  phone?: string;
  password: string;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  gender?: 'MALE' | 'FEMALE';
  bio?: string;
}

/**
 * Teacher profile row. A brand-new account also carries `applicationId`; re-inviting an
 * existing teacher email only updates the profile and returns it without one.
 */
export interface ProvisionedTeacher {
  id: string;
  userId: string;
  hiringStatus: string;
  readyToMatch: boolean;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  applicationId?: string;
  [key: string]: unknown;
}

const enc = encodeURIComponent;

export const adminConsoleApi = {
  overview: () => http.get<AdminOverview>('/admin/console/overview'),
  search: <E extends SearchEntity>(params: { q: string; entity: E; limit?: number }) =>
    http.get<SearchResult<E>>('/admin/console/search', { query: params }),
  setUserStatus: (userId: string, status: UserStatus) =>
    http.patch<UserStatusResult>(`/admin/console/users/${enc(userId)}/status`, { status }),
  setUserRoles: (userId: string, roles: StaffRole[]) =>
    http.patch<UserRolesResult>(`/admin/console/users/${enc(userId)}/roles`, { roles }),
  teacherReadiness: (teacherId: string) =>
    http.get<TeacherReadiness>(`/admin/console/teachers/${enc(teacherId)}/readiness`),
  provisionTeacher: (body: ProvisionTeacherInput) =>
    http.post<ProvisionedTeacher>('/admin/console/teachers', body),
};

// ── Client-side validation mirroring the zod schemas ─────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors `searchQuery` (q 2..120). */
export function validateSearchTerm(q: string): string | null {
  const term = q.trim();
  if (term.length < 2) return 'Enter at least 2 characters.';
  if (term.length > 120) return 'Search terms are limited to 120 characters.';
  return null;
}

/** Splits a comma/space separated list into trimmed, de-duplicated values. */
export function splitList(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean))];
}

export type ProvisionErrors = Partial<Record<keyof ProvisionTeacherInput, string>>;

/** Mirrors `provisionTeacherBody`. */
export function validateProvisionTeacher(input: ProvisionTeacherInput): ProvisionErrors {
  const errors: ProvisionErrors = {};
  if (!EMAIL_RE.test(input.email) || input.email.length > 320) errors.email = 'Enter a valid email address.';
  if (input.name.trim().length < 2 || input.name.length > 160) errors.name = 'Name must be 2–160 characters.';
  if (input.phone !== undefined && (input.phone.length < 5 || input.phone.length > 32))
    errors.phone = 'Phone must be 5–32 characters.';
  if (input.password.length < 12 || input.password.length > 200)
    errors.password = 'Password must be at least 12 characters.';
  if (input.languages.length < 1) errors.languages = 'Add at least one language code.';
  else if (input.languages.some((l) => l.length < 2 || l.length > 5))
    errors.languages = 'Language codes are 2–5 characters (e.g. en, ur, ar).';
  if (input.subjects.length < 1) errors.subjects = 'Add at least one subject.';
  else if (input.subjects.some((s) => s.length > 60)) errors.subjects = 'Subjects are limited to 60 characters.';
  if (input.ageGroups.length < 1) errors.ageGroups = 'Pick at least one age group.';
  if (input.bio && input.bio.length > 4000) errors.bio = 'Bio is limited to 4000 characters.';
  return errors;
}
