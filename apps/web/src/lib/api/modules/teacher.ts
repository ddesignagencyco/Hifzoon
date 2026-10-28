import { http } from '../http';
import type { LessonPortion, TeacherEnrolment } from './enrolments-teacher';

/**
 * Teacher self-service (apps/api/src/modules/teachers/teachers.controller.ts),
 * public rating (modules/qa QualityRatingsController) and QA reply (QaController).
 */

/** `GET /teachers/me/classes/:classId/brief` (TeachersService.preClassBrief). */
export interface BriefLessonCard {
  id: string;
  studentId: string;
  submittedAt: string | null;
  homework: string | null;
  portions: Array<Omit<LessonPortion, 'id'>>;
}

export interface BriefStudent {
  id: string;
  displayName: string;
  enrolments: Array<{ id: string; currentLessonPosition: number; currentLevel: { name: string } | null }>;
  lastLessonCard: BriefLessonCard | null;
  nextLessonPosition: number | null;
  currentLevel: string | null;
}

export interface RecurringMistake {
  studentId: string;
  type: string;
  surah: number;
  ayah: number;
  occurrences: number;
}

export interface PreClassBrief {
  classId: string;
  startsAt: string;
  course: { id: string; name: string; code: string } | null;
  students: BriefStudent[];
  recurringMistakes: RecurringMistake[];
  recentLessonCards: BriefLessonCard[];
}

/** `GET /teachers/public/:userId` (TeachersService.publicProfile). Decimal columns arrive as strings. */
export interface PublicTeacherProfile {
  id: string;
  bio: string | null;
  photoUrl: string | null;
  introVideoUrl: string | null;
  /** §7.4 — any absolute URL the teacher proposed and an admin approved; render only http(s). */
  recitationSampleUrl: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  publicRatingAvg: string | number | null;
  /** Verified-only — the API never includes a credential still awaiting admin approval. */
  qualifications: TeacherCredential[];
  user: { name: string; timeZone: string };
}

/** `GET /quality/teachers/:teacherId/rating` (RatingsService.teacherSummary). */
export interface TeacherRatingSummary {
  teacherId: string;
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
}

/**
 * Fields `PATCH /teachers/me/profile` accepts and approval applies — the backend's
 * `PROFILE_CHANGE_SCHEMA` (TeachersService). Any other key is a 400 naming it.
 */
export const PROFILE_TEXT_FIELDS = ['bio', 'photoUrl', 'introVideoUrl', 'recitationSampleUrl'] as const;
export const PROFILE_LIST_FIELDS = ['languages', 'subjects', 'ageGroups'] as const;
export const PROFILE_CHANGE_FIELDS = [...PROFILE_TEXT_FIELDS, ...PROFILE_LIST_FIELDS, 'qualifications'] as const;
export type ProfileTextField = (typeof PROFILE_TEXT_FIELDS)[number];
export type ProfileListField = (typeof PROFILE_LIST_FIELDS)[number];
export type ProfileChangeField = (typeof PROFILE_CHANGE_FIELDS)[number];

/**
 * A certificate, association membership or other credential a teacher submits (FR-TCH-09).
 * `verified` is only ever set by an admin approving the staged change — never by the
 * teacher's own submission, no matter what this client sends.
 */
export const TEACHER_CREDENTIAL_TYPES = ['CERTIFICATE', 'ASSOCIATION', 'OTHER'] as const;
export type TeacherCredentialType = (typeof TEACHER_CREDENTIAL_TYPES)[number];
export interface TeacherCredential {
  type: TeacherCredentialType;
  title: string;
  issuer: string;
  documentUrl: string;
  verified: boolean;
  verifiedById?: string;
  verifiedAt?: string;
}
export const QUALIFICATIONS_MAX = 20;

/** URL fields are cleared with `null` (the API refuses an empty string as "not an absolute URL"). */
export type ProfileChanges = Partial<
  Record<ProfileTextField, string | null> & Record<ProfileListField, string[]> & { qualifications: TeacherCredential[] }
>;

/** Backend `stringArray` limits: at most `max` entries of at most `maxLength` characters. */
export const PROFILE_LIST_LIMITS: Record<ProfileListField, { max: number; maxLength: number }> = {
  languages: { max: 10, maxLength: 16 },
  subjects: { max: 20, maxLength: 32 },
  ageGroups: { max: 10, maxLength: 32 },
};

/** `PATCH /teachers/me/profile` result. */
export interface ProfileChangeResult {
  id: string;
  pendingProfileChanges: Record<string, unknown> | null;
}

/** `POST /qa/reviews/:id/reply` result (the updated `qa_review` row). */
export interface QaReviewReplyResult {
  id: string;
  classId: string;
  teacherReply: string | null;
  feedback: string | null;
  scores: Record<string, number>;
  reviewedAt: string;
}

export const QA_REPLY_MAX = 4000;
const enc = encodeURIComponent;

export const teacherApi = {
  brief: (classId: string) => http.get<PreClassBrief>(`/teachers/me/classes/${enc(classId)}/brief`),
  requestProfileChange: (changes: ProfileChanges) =>
    http.patch<ProfileChangeResult>('/teachers/me/profile', { changes }),
  publicProfile: (userId: string) => http.get<PublicTeacherProfile>(`/teachers/public/${enc(userId)}`),
  rating: (teacherId: string) => http.get<TeacherRatingSummary>(`/quality/teachers/${enc(teacherId)}/rating`),
  replyToReview: (reviewId: string, teacherReply: string) =>
    http.post<QaReviewReplyResult>(`/qa/reviews/${enc(reviewId)}/reply`, { teacherReply }),
};

/**
 * Fallback for resolving the teacher **profile** id from the enrolment list
 * (`enrolment.teacher.id`) when `GET /teachers/me` is unavailable. Returns `null` when
 * the teacher has no enrolments.
 */
export function resolveTeacherProfileId(enrolments: TeacherEnrolment[]): string | null {
  for (const e of enrolments) {
    if (e.teacher?.id) return e.teacher.id;
  }
  return null;
}

/** True for an absolute http(s) URL — the only links the site will play or open. */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

const LIST_LABELS: Record<ProfileListField, string> = {
  languages: 'languages',
  subjects: 'subjects',
  ageGroups: 'age groups',
};

/**
 * Same rules as the backend `PROFILE_CHANGE_SCHEMA`, plus http(s) only for links (the API
 * accepts any absolute URL, but the site only plays or opens http(s)). Bio is free text.
 */
export const BIO_MAX = 2000;
export function validateProfileChanges(changes: ProfileChanges): Partial<Record<ProfileChangeField, string>> {
  const errors: Partial<Record<ProfileChangeField, string>> = {};
  if (changes.bio != null) {
    if (changes.bio.trim().length === 0) errors.bio = 'Bio cannot be empty.';
    else if (changes.bio.length > BIO_MAX) errors.bio = `Bio must be at most ${BIO_MAX} characters.`;
  }
  for (const key of ['photoUrl', 'introVideoUrl', 'recitationSampleUrl'] as const) {
    const value = changes[key];
    if (value == null || value === '') continue;
    try {
      const url = new URL(value);
      // The API accepts http only outside production (S21); mirror that here.
      const httpAllowed = process.env.NODE_ENV !== 'production';
      if (url.protocol !== 'https:' && !(httpAllowed && url.protocol === 'http:')) {
        errors[key] = httpAllowed ? 'Use an http(s) link.' : 'Use a secure link starting with https://';
      }
    } catch {
      errors[key] = 'Enter a full link, starting with https://';
    }
  }
  for (const key of PROFILE_LIST_FIELDS) {
    const value = changes[key];
    if (value === undefined) continue;
    const { max, maxLength } = PROFILE_LIST_LIMITS[key];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.trim() === '')) {
      errors[key] = `Choose ${LIST_LABELS[key]} from the list.`;
    } else if (value.length > max) {
      errors[key] = `Choose at most ${max} ${LIST_LABELS[key]}.`;
    } else if (value.some((v) => v.length > maxLength)) {
      errors[key] = `Each of your ${LIST_LABELS[key]} must be at most ${maxLength} characters.`;
    }
  }
  if (changes.qualifications !== undefined) {
    const value = changes.qualifications;
    if (!Array.isArray(value) || value.length > QUALIFICATIONS_MAX) {
      errors.qualifications = `Add at most ${QUALIFICATIONS_MAX} credentials.`;
    } else if (
      value.some(
        (c) =>
          !TEACHER_CREDENTIAL_TYPES.includes(c.type) ||
          c.title.trim() === '' ||
          c.title.length > 160 ||
          c.issuer.trim() === '' ||
          c.issuer.length > 160 ||
          !isHttpUrl(c.documentUrl),
      )
    ) {
      errors.qualifications = 'Each credential needs a type, title, issuer and a link (https://) to the document.';
    }
  }
  return errors;
}
