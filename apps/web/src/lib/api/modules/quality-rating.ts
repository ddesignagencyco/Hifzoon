import { http } from '../http';

/** Family class ratings (apps/api/src/modules/qa — QualityRatingsController, FR-QA-01/02). */

export interface RateClassInput {
  stars: number;
  studentId?: string;
  lessonCardId?: string;
  comment?: string;
}

/** Raw `class_review` row. */
export interface ClassReviewRecord {
  id: string;
  classId: string;
  lessonCardId: string | null;
  familyUserId: string;
  studentId: string | null;
  stars: number;
  comment: string | null;
  createdAt: string;
}

/** `GET /quality/teachers/:teacherId/rating` — `teacherId` is the teacher-profile id. */
export interface TeacherRatingSummary {
  teacherId: string;
  average: number | null;
  count: number;
  distribution: Array<{ stars: number; count: number }>;
}

const enc = encodeURIComponent;

export const qualityRatingApi = {
  rateClass: (classId: string, input: RateClassInput) =>
    http.post<ClassReviewRecord>(`/quality/classes/${enc(classId)}/rating`, {
      stars: input.stars,
      ...(input.studentId ? { studentId: input.studentId } : {}),
      ...(input.lessonCardId ? { lessonCardId: input.lessonCardId } : {}),
      ...(input.comment?.trim() ? { comment: input.comment.trim() } : {}),
    }),
  teacherRating: (teacherId: string) =>
    http.get<TeacherRatingSummary>(`/quality/teachers/${enc(teacherId)}/rating`),
};

/** Mirrors the zod body: integer stars 1–5, comment ≤ 2000. */
export function validateRating(input: { stars: number; comment?: string }): { stars?: string; comment?: string } {
  const errors: { stars?: string; comment?: string } = {};
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) errors.stars = 'Choose 1 to 5 stars.';
  if (input.comment && input.comment.trim().length > 2000) errors.comment = 'Keep the comment under 2000 characters.';
  return errors;
}
