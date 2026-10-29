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
  approvedById?: string | null;
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
  recordSafeguardingTraining: (profileId: string, completedAt: string) =>
    http.post<SafeguardingTrainingResult>(`/teachers/profiles/${enc(profileId)}/safeguarding-training`, {
      completedAt,
    }),
  /** `reason` is shown to the teacher when a change is rejected. Approving verifies new credentials. */
  reviewProfileChange: (profileId: string, approve: boolean, reason?: string) =>
    http.post<ProfileReviewResult>(`/teachers/profiles/${enc(profileId)}/review`, {
      approve,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    }),
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
