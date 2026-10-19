import { http } from '../http';

/**
 * Admissions operations (AdmissionsController): trial booking and outcome, and the
 * teacher-change queue. ADMIN and SUPER_ADMIN.
 */

export type ClassStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED_FAMILY'
  | 'CANCELLED_TEACHER'
  | 'NO_SHOW_STUDENT'
  | 'NO_SHOW_TEACHER';

/** ClassSession row returned by `POST /trials`. */
export interface TrialClass {
  id: string;
  scheduleId: string | null;
  teacherId: string;
  courseId: string;
  type: 'TRIAL';
  startsAt: string;
  endsAt: string;
  status: ClassStatus;
  [key: string]: unknown;
}

/** `bookTrialBody`. */
export interface BookTrialInput {
  studentId: string;
  courseId: string;
  /** ISO date-time; must not be in the past. */
  startsAt: string;
  teacherId?: string;
  leadId?: string;
}

/** `trialOutcomeBody`. */
export interface TrialOutcomeInput {
  won: boolean;
  placementLevelId?: string;
  recommendedPlanId?: string;
  notes?: string;
  lostReason?: string;
}

export interface TrialOutcomeRecord {
  id: string;
  classId: string;
  placementLevelId: string | null;
  recommendedPlanId: string | null;
  notes: string | null;
  subscribeToken: string;
  completedAt: string;
}

export interface TrialOutcomeResult {
  outcome: TrialOutcomeRecord;
  subscribeToken: string;
  /** True when an outcome already existed: the original token is returned, nothing is changed. */
  alreadyRecorded: boolean;
}

export type TeacherChangeStatus = 'OPEN' | 'APPROVED' | 'DECLINED' | 'CANCELLED';
export const TEACHER_CHANGE_STATUSES: TeacherChangeStatus[] = ['OPEN', 'APPROVED', 'DECLINED', 'CANCELLED'];

/** `GET /teacher-changes` row (listTeacherChanges). */
export interface TeacherChangeRequest {
  id: string;
  familyId: string;
  studentId: string;
  enrolmentId: string;
  reason: string;
  status: TeacherChangeStatus;
  resolvedById: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  family: { id: string; name: string };
  resolvedBy: { id: string; name: string } | null;
  studentName: string | null;
}

/** Raw `teacher_change_request` row returned by resolve. */
export type ResolvedTeacherChange = Omit<TeacherChangeRequest, 'family' | 'resolvedBy' | 'studentName'>;

/** `GET /billing/plans` row (BillingService.listPlans — plan with prices). */
export interface PlanRecord {
  id: string;
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: string;
  active: boolean;
  prices: Array<{ id: string; currency: string; amountMinor: number }>;
}

const enc = encodeURIComponent;

export const admissionsAdminApi = {
  bookTrial: (body: BookTrialInput) => http.post<TrialClass>('/trials', body),
  recordTrialOutcome: (classId: string, body: TrialOutcomeInput) =>
    http.post<TrialOutcomeResult>(`/trials/${enc(classId)}/outcome`, body),
  listTeacherChanges: (status?: TeacherChangeStatus) =>
    http.get<TeacherChangeRequest[]>('/teacher-changes', { query: { status } }),
  resolveTeacherChange: (requestId: string, status: Exclude<TeacherChangeStatus, 'OPEN'>) =>
    http.post<ResolvedTeacherChange>(`/teacher-changes/${enc(requestId)}/resolve`, { status }),
  /** Public plan catalogue — used to pick a recommended plan for a trial outcome. */
  listPlans: () => http.get<PlanRecord[]>('/billing/plans'),
};

/** Mirrors `trialOutcomeBody`. */
export function validateTrialOutcome(input: TrialOutcomeInput): Partial<Record<keyof TrialOutcomeInput, string>> {
  const errors: Partial<Record<keyof TrialOutcomeInput, string>> = {};
  if (input.notes && input.notes.length > 4000) errors.notes = 'Notes are limited to 4000 characters.';
  if (input.lostReason && input.lostReason.length > 2000) errors.lostReason = 'Reason is limited to 2000 characters.';
  return errors;
}
