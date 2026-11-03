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

export interface TrainingSession {
  applicantName: string;
  status: 'SENT' | 'IN_PROGRESS' | 'PASSED' | 'LOCKED';
  courseVersion: string;
  modules: TrainingModule[];
  termsVersion: string;
  termsAcceptedAt: string | null;
}

export const applicantTrainingApi = {
  session: (token: string) => http.post<TrainingSession>('/applicant-training/session', { token }),
  acknowledge: (token: string, moduleId: string) =>
    http.post<{ moduleId: string; acknowledgedAt: string }>('/applicant-training/acknowledge', { token, moduleId }),
  /** Accepting the terms after the last module completes the training. */
  acceptTerms: (token: string) =>
    http.post<{ termsVersion: string; termsAcceptedAt: string; status: TrainingSession['status']; passedAt: string }>(
      '/applicant-training/terms',
      { token },
    ),
};
