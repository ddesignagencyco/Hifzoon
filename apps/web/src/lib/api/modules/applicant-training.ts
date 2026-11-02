import { http } from '../http';

/**
 * The applicant's training course (the TRAINING hiring step). Every call carries the
 * emailed token in the body; it is the applicant's only credential.
 */
export interface TrainingModule {
  id: string;
  title: string;
  sections: Array<{ heading?: string; paragraphs?: string[]; bullets?: string[] }>;
  acknowledgement: string;
  acknowledgedAt: string | null;
}

export interface QuizAttempt {
  attemptId: string;
  expiresAt: string;
  questions: Array<{ id: string; prompt: string; options: Array<{ id: string; text: string }> }>;
}

export interface TrainingSession {
  applicantName: string;
  status: 'SENT' | 'IN_PROGRESS' | 'PASSED' | 'LOCKED';
  courseVersion: string;
  modules: TrainingModule[];
  termsVersion: string;
  termsAcceptedAt: string | null;
  rules: { questionsPerAttempt: number; passPercent: number; maxAttempts: number; cooldownHours: number; attemptMinutes: number };
  attemptsUsed: number;
  lastResult: { score: number | null; total: number; passed: boolean | null; submittedAt: string | null } | null;
  nextAttemptAt: string | null;
  openAttempt: QuizAttempt | null;
}

export interface QuizResult {
  score: number;
  total: number;
  percent: number;
  passed: boolean;
  attemptsLeft: number;
  nextAttemptAt: string | null;
}

export const applicantTrainingApi = {
  session: (token: string) => http.post<TrainingSession>('/applicant-training/session', { token }),
  acknowledge: (token: string, moduleId: string) =>
    http.post<{ moduleId: string; acknowledgedAt: string }>('/applicant-training/acknowledge', { token, moduleId }),
  acceptTerms: (token: string) =>
    http.post<{ termsVersion: string; termsAcceptedAt: string }>('/applicant-training/terms', { token }),
  startQuiz: (token: string) => http.post<QuizAttempt>('/applicant-training/quiz/start', { token }),
  submitQuiz: (token: string, attemptId: string, answers: Record<string, string>) =>
    http.post<QuizResult>('/applicant-training/quiz/submit', { token, attemptId, answers }),
};
