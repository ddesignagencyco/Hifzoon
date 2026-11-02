import { http } from '../http';

/**
 * Teacher hiring pipeline (TeachersController `/teachers/applications/*`, `/teachers/profiles/*`).
 * List/get/steps/training: ADMIN, SUPER_ADMIN, SUPERVISOR. Profile review: ADMIN, SUPER_ADMIN.
 */

export type HiringStage =
  | 'SUBMITTED'
  | 'RECITATION_REVIEW'
  | 'DEMO_CLASS'
  | 'ID_CHECK'
  | 'REFERENCE_CHECK'
  | 'TRAINING'
  | 'APPROVED'
  | 'REJECTED';

/** Shared `HIRING_PIPELINE` order. REJECTED is an outcome, never a step row. */
export const HIRING_PIPELINE: HiringStage[] = [
  'SUBMITTED',
  'RECITATION_REVIEW',
  'DEMO_CLASS',
  'ID_CHECK',
  'REFERENCE_CHECK',
  'TRAINING',
  'APPROVED',
];
export const HIRING_STAGES: HiringStage[] = [...HIRING_PIPELINE, 'REJECTED'];

export type HiringStepStatus = 'PENDING' | 'PASSED' | 'FAILED';
export const HIRING_STEP_STATUSES: HiringStepStatus[] = ['PASSED', 'FAILED', 'PENDING'];

export interface ApplicationDocument {
  id: string;
  type: string;
  fileUrl: string;
  /** Short-lived signed link for a stored file (backend B31); null for legacy values. */
  downloadUrl?: string | null;
  verified: boolean;
  /** Reviewed and refused; `reviewNote` says why. */
  rejected?: boolean;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  reviewedByName?: string | null;
  approvedById?: string | null;
}

export type ReferenceOutcome = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'UNREACHABLE';

export interface HiringReference {
  id: string;
  name: string;
  relationship: string;
  email: string | null;
  phone: string | null;
  outcome: ReferenceOutcome;
  notes: string | null;
  checkedAt: string | null;
  checkedByName?: string | null;
}

/** The applicant's training course, as the admin page sees it (TRAINING step evidence). */
export interface ApplicantTrainingSummary {
  status: 'SENT' | 'IN_PROGRESS' | 'PASSED' | 'LOCKED';
  courseVersion: string;
  sentAt: string;
  linkExpiresAt: string;
  modulesRead: number;
  modulesTotal: number;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  passedAt: string | null;
}

export interface ReferenceInput {
  name: string;
  relationship: string;
  email?: string;
  phone?: string;
}

/** `GET /teachers/applications/list` row. */
export interface ApplicationListItem {
  id: string;
  applicantName: string;
  email: string;
  country: string | null;
  status: HiringStage;
  createdAt: string;
  updatedAt: string;
  steps: Array<{
    step: HiringStage;
    status: HiringStepStatus;
    completedAt: string | null;
    notes: string | null;
    reviewer: { name: string } | null;
  }>;
  documents: ApplicationDocument[];
}

/** `GET /teachers/applications/:id`. */
export interface ApplicationDetail {
  /** The applicant's teacher profile, once their account exists (resolved by the API). */
  profileId?: string | null;
  id: string;
  applicantName: string;
  email: string;
  phone: string | null;
  country: string | null;
  qualifications: unknown;
  recitationAudioUrl: string | null;
  /** Short-lived signed link to play the stored recitation (backend B31). */
  recitationAudioDownloadUrl?: string | null;
  status: HiringStage;
  /** Linked account once provisioned/approved; the teacher profile id is not returned. */
  userId: string | null;
  steps: Array<{
    id: string;
    step: HiringStage;
    status: HiringStepStatus;
    notes: string | null;
    completedAt: string | null;
  }>;
  documents: ApplicationDocument[];
  /** The demo step's evidence: a live interview the applicant attended, marked passed. */
  interviewPassed?: boolean;
  /** The applicant's training course; null until the link is sent. */
  training?: ApplicantTrainingSummary | null;
  references?: HiringReference[];
  safeguardingTrainingAt?: string | null;
  platformTrainingAt?: string | null;
}

/**
 * What a step still needs before it can pass — the same rules the API enforces, shown
 * up front so the reviewer is not left guessing after a refusal.
 */
export function missingEvidence(app: ApplicationDetail, step: HiringStage): string[] {
  const missing: string[] = [];
  if (step === 'DEMO_CLASS' && !app.interviewPassed) {
    missing.push('A live interview the applicant attended, marked passed (see Interviews above).');
  }
  if (step === 'ID_CHECK') {
    const verified = (type: string) => app.documents.some((d) => d.type === type && d.verified);
    if (!verified('ID')) missing.push('The photo ID marked verified.');
    const claimsSanad = (app.qualifications as { hasSanad?: unknown } | null)?.hasSanad === true;
    if (claimsSanad && !verified('CERTIFICATE')) missing.push('The ijazah / sanad certificate marked verified.');
  }
  if (step === 'REFERENCE_CHECK' && !(app.references ?? []).some((r) => r.outcome === 'CONFIRMED')) {
    missing.push('At least one referee who confirmed the applicant.');
  }
  if (step === 'TRAINING' && app.training?.status !== 'PASSED') {
    missing.push('The applicant’s completed training: every module confirmed and the teacher terms accepted (see Training below).');
  }
  return missing;
}

/** `RecordStepDto`. */
export interface RecordStepInput {
  step: HiringStage;
  status: HiringStepStatus;
  notes?: string;
}

export interface RecordStepResult {
  step: { id: string; step: HiringStage; status: HiringStepStatus; completedAt: string | null };
  applicationStatus: HiringStage;
}

export interface SafeguardingTrainingResult {
  id: string;
  safeguardingTrainingCompletedAt: string | null;
  readyToMatch: boolean;
}

export interface ProfileReviewResult {
  id: string;
  pendingProfileChanges: unknown;
  bio?: string | null;
  photoUrl?: string | null;
}

/** `GET /teachers/profile-changes` row: staged values next to the live values of the same fields. */
export interface PendingProfileChange {
  profileId: string;
  teacherName: string;
  submittedAt: string | null;
  changes: Record<string, unknown>;
  current: Record<string, unknown>;
}

const enc = encodeURIComponent;

export const teacherHiringApi = {
  /** Teachers with a profile change waiting for approval (ADMIN/SUPER_ADMIN). */
  listProfileChanges: () => http.get<PendingProfileChange[]>('/teachers/profile-changes'),
  listApplications: (status?: HiringStage) =>
    http.get<ApplicationListItem[]>('/teachers/applications/list', { query: { status } }),
  getApplication: (id: string) => http.get<ApplicationDetail>(`/teachers/applications/${enc(id)}`),
  recordStep: (applicationId: string, body: RecordStepInput) =>
    http.post<RecordStepResult>(`/teachers/applications/${enc(applicationId)}/steps`, body),
  attachDocument: (applicationId: string, body: { type: string; key: string }) =>
    http.post<ApplicationDocument>(`/teachers/applications/${enc(applicationId)}/documents`, body),
  reviewDocument: (applicationId: string, documentId: string, body: { verified: boolean; note?: string }) =>
    http.post<ApplicationDocument>(
      `/teachers/applications/${enc(applicationId)}/documents/${enc(documentId)}/review`,
      body,
    ),
  addReference: (applicationId: string, body: ReferenceInput) =>
    http.post<HiringReference>(`/teachers/applications/${enc(applicationId)}/references`, body),
  recordReference: (
    applicationId: string,
    referenceId: string,
    body: { outcome: Exclude<ReferenceOutcome, 'PENDING'>; notes: string },
  ) =>
    http.post<HiringReference>(
      `/teachers/applications/${enc(applicationId)}/references/${enc(referenceId)}/outcome`,
      body,
    ),
  /** `reason` is shown to the teacher when a change is rejected. Approving verifies new credentials. */
  reviewProfileChange: (profileId: string, approve: boolean, reason?: string) =>
    http.post<ProfileReviewResult>(`/teachers/profiles/${enc(profileId)}/review`, {
      approve,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
  /** Emails (or re-emails) the training link; returns the link once. */
  sendTrainingLink: (applicationId: string) =>
    http.post<{ trainingUrl: string; status: string }>(`/applicant-training/applications/${enc(applicationId)}/send`, {}),
};

/** Steps a reviewer records — every real step except the SUBMITTED intake (already passed). */
export const RECORDABLE_STEPS: HiringStage[] = HIRING_PIPELINE.filter((s) => s !== 'SUBMITTED');

/**
 * The step a reviewer should act on next: the first process step not yet passed, or
 * APPROVED once every process step has passed. Null when the application is closed.
 */
export function nextActionableStep(
  steps: Array<{ step: HiringStage; status: HiringStepStatus }>,
): HiringStage | null {
  const byStep = new Map(steps.map((s) => [s.step, s.status]));
  for (const stage of HIRING_PIPELINE) {
    if (stage === 'APPROVED') break;
    if (byStep.has(stage) && byStep.get(stage) !== 'PASSED') return stage;
  }
  if (byStep.has('APPROVED') && byStep.get('APPROVED') !== 'PASSED') return 'APPROVED';
  return null;
}

/** Process steps (excluding APPROVED/REJECTED) that are not yet passed. */
export function outstandingSteps(steps: Array<{ step: HiringStage; status: HiringStepStatus }>): HiringStage[] {
  return steps.filter((s) => s.status !== 'PASSED' && s.step !== 'APPROVED' && s.step !== 'REJECTED').map((s) => s.step);
}

/** Orders steps by the pipeline (the API orders by creation time, which is the same today). */
export function sortSteps<T extends { step: HiringStage }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => HIRING_STAGES.indexOf(a.step) - HIRING_STAGES.indexOf(b.step));
}

/** Mirrors `RecordStepDto` and the "cannot approve with steps outstanding" rule. */
export function validateRecordStep(
  input: RecordStepInput,
  steps: Array<{ step: HiringStage; status: HiringStepStatus }>,
): string | null {
  if (!HIRING_PIPELINE.includes(input.step)) return 'Choose a pipeline step.';
  if (input.notes && input.notes.length > 2000) return 'Notes are limited to 2000 characters.';
  if (input.step === 'APPROVED' && input.status === 'PASSED') {
    const outstanding = outstandingSteps(steps);
    if (outstanding.length > 0) return `Cannot approve while steps are outstanding: ${outstanding.join(', ')}.`;
  }
  return null;
}
