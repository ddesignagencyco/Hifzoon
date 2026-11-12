import { http } from '../http';

/** Level assessments (apps/api/src/modules/courses/assessments.service.ts). */

export type AssessmentType = 'LEVEL' | 'MILESTONE_JUZ' | 'IJAZAH';
export type AssessmentResult = 'PASS' | 'FAIL' | 'PENDING';

export interface AssessmentRecord {
  id: string;
  type: AssessmentType;
  result: AssessmentResult;
  score: number | null;
  rubricScores: Record<string, number> | null;
  notes: string | null;
  takenAt: string | null;
  createdAt: string;
  examinerId: string;
  level: { id: string; name: string; position: number; passMark: number };
}

/** `GET /courses/enrolments/:id/assessments`. */
export interface AssessmentOverview {
  currentLevel: {
    id: string;
    name: string;
    position: number;
    passMark: number;
    /** `{ criterion: weight }`; a level with no rubric comes back as `{ Overall: 100 }`. */
    rubric: Record<string, number>;
    lessonCount: number;
  } | null;
  currentLessonPosition: number;
  assessments: AssessmentRecord[];
}

/** `POST /courses/enrolments/:id/assessments`. */
export interface AssessmentOutcome {
  assessment: AssessmentRecord;
  advancedTo: { id: string; name: string; position: number } | null;
  finalLevel: boolean;
}

/**
 * The same weighted score the server computes, for the live preview in the dialog. Null
 * until every criterion has a valid 0–100 score. The server's figure is the one recorded.
 */
export function previewScore(
  rubric: Record<string, number>,
  scores: Record<string, string>,
): number | null {
  const keys = Object.keys(rubric);
  if (keys.length === 0) return null;
  const values: number[] = [];
  for (const key of keys) {
    const raw = scores[key];
    if (raw === undefined || raw.trim() === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    values.push(n);
  }
  const total = keys.reduce((sum, k) => sum + rubric[k], 0);
  const score =
    total > 0
      ? keys.reduce((sum, k, i) => sum + values[i] * rubric[k], 0) / total
      : values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(score * 10) / 10;
}

const enc = encodeURIComponent;

export const assessmentsApi = {
  list: (enrolmentId: string) =>
    http.get<AssessmentOverview>(`/courses/enrolments/${enc(enrolmentId)}/assessments`),
  create: (
    enrolmentId: string,
    body: { rubricScores: Record<string, number>; notes?: string; type?: AssessmentType },
  ) => http.post<AssessmentOutcome>(`/courses/enrolments/${enc(enrolmentId)}/assessments`, body),
};
