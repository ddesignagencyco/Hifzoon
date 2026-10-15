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
  gender: 'MALE' | 'FEMALE' | null;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  publicRatingAvg: string | number | null;
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
 * Fields an admin approval actually applies (TeachersService.reviewProfileChange allow-list).
 * Anything else a teacher proposes is dropped on approval, so the form does not offer it.
 */
export const PROFILE_CHANGE_FIELDS = ['bio', 'photoUrl', 'introVideoUrl', 'recitationSampleUrl'] as const;
export type ProfileChangeField = (typeof PROFILE_CHANGE_FIELDS)[number];
export type ProfileChanges = Partial<Record<ProfileChangeField, string>>;

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
 * The scheduling/rating endpoints take the teacher **profile** id, but `/auth/me` only
 * returns the user id and there is no `GET /teachers/me`. The one teacher-readable
 * response that carries the profile id is the enrolment list filtered by the teacher's
 * user id (`enrolment.teacher.id`). Returns `null` when the teacher has no enrolments.
 */
export function resolveTeacherProfileId(enrolments: TeacherEnrolment[]): string | null {
  for (const e of enrolments) {
    if (e.teacher?.id) return e.teacher.id;
  }
  return null;
}

/** Profile URL fields must be absolute http(s) URLs; bio is free text up to a sane length. */
export const BIO_MAX = 2000;
export function validateProfileChanges(changes: ProfileChanges): Partial<Record<ProfileChangeField, string>> {
  const errors: Partial<Record<ProfileChangeField, string>> = {};
  if (changes.bio !== undefined) {
    if (changes.bio.trim().length === 0) errors.bio = 'Bio cannot be empty.';
    else if (changes.bio.length > BIO_MAX) errors.bio = `Bio must be at most ${BIO_MAX} characters.`;
  }
  for (const key of ['photoUrl', 'introVideoUrl', 'recitationSampleUrl'] as const) {
    const value = changes[key];
    if (value === undefined || value === '') continue;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') errors[key] = 'Use an http(s) link.';
    } catch {
      errors[key] = 'Enter a full link, starting with https://';
    }
  }
  return errors;
}
