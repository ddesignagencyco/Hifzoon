import { http } from '../http';

/**
 * Complaints & safeguarding cases (apps/api/src/modules/qa/qa.controller.ts `CasesController`,
 * cases.service.ts). Roles: SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN — never ADMIN.
 * `GET /cases/sla` is SAFEGUARDING_LEAD / SUPER_ADMIN only. Every `GET /cases/:id` is audited.
 */

export type CaseType = 'COMPLAINT' | 'SAFEGUARDING';
export type CaseStatus = 'OPEN' | 'INVESTIGATING' | 'ACTIONED' | 'CLOSED';

export const CASE_TYPES: CaseType[] = ['SAFEGUARDING', 'COMPLAINT'];
export const CASE_STATUSES: CaseStatus[] = ['OPEN', 'INVESTIGATING', 'ACTIONED', 'CLOSED'];

interface PersonRef {
  id: string;
  name: string;
}

/** Plain `case_record` row (returned by open / transition / assign). */
/** M28 — how serious a case is. Safeguarding cases start HIGH, complaints MEDIUM. */
export type CaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const CASE_SEVERITIES: CaseSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export interface CaseRecord {
  id: string;
  type: CaseType;
  status: CaseStatus;
  severity?: CaseSeverity;
  ownerId: string | null;
  openedById: string;
  subjectUserId: string | null;
  classId: string | null;
  summary: string;
  dueAt: string;
  alertedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /cases` row (CasesService.list). Max 100, ordered by status then due date. */
export interface CaseListItem extends CaseRecord {
  owner: PersonRef | null;
  openedBy: PersonRef;
  _count: { notes: number };
}

export interface CaseNote {
  id: string;
  caseId: string;
  authorId: string;
  note: string;
  createdAt: string;
  author?: PersonRef;
}

/** `GET /cases/:id` (CasesService.read). */
export interface CaseDetail extends CaseRecord {
  notes: Array<CaseNote & { author: PersonRef }>;
  owner: PersonRef | null;
  openedBy: PersonRef;
  class: { id: string; startsAt: string; course: { name: string } | null } | null;
  sla: { dueAt: string; breached: boolean; minutesRemaining: number };
}

/** `GET /cases/sla` (CasesService.slaReport). */
export interface CaseSlaReport {
  open: number;
  breached: number;
  breachedDetail: Array<{ id: string; type: CaseType; status: CaseStatus; minutesOverdue: number }>;
  openDetail: Array<{ id: string; type: CaseType; minutesRemaining: number }>;
}

export interface CaseListFilter {
  type?: CaseType;
  status?: CaseStatus;
  overdueOnly?: boolean;
}

/** `POST /cases` body (zod `openCaseBody`). */
export interface OpenCaseInput {
  type: CaseType;
  summary: string;
  subjectUserId?: string;
  classId?: string;
  ownerId?: string;
  slaMinutes?: number;
  severity?: CaseSeverity;
}

export const SUMMARY_MIN = 10;
export const SUMMARY_MAX = 8000;
export const NOTE_MAX = 8000;
export const SLA_MIN = 1;
export const SLA_MAX = 604800; // zod max; the service further caps at 1 week (10080)
export const SLA_SERVICE_MAX = 60 * 24 * 7;
export const DEFAULT_SLA_MINUTES = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string) => UUID_RE.test(v.trim());

/** Client-side mirror of `openCaseBody` + the service's 1-minute-to-1-week SLA rule. */
export function validateOpenCase(input: OpenCaseInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!CASE_TYPES.includes(input.type)) errors.type = 'Choose a case type.';
  const summary = input.summary.trim();
  if (summary.length < SUMMARY_MIN) errors.summary = `Describe the concern in at least ${SUMMARY_MIN} characters.`;
  if (summary.length > SUMMARY_MAX) errors.summary = `Summary cannot exceed ${SUMMARY_MAX} characters.`;
  for (const key of ['subjectUserId', 'classId', 'ownerId'] as const) {
    const value = input[key];
    if (value && !isUuid(value)) errors[key] = 'Must be a valid id (UUID).';
  }
  if (input.slaMinutes !== undefined) {
    if (!Number.isInteger(input.slaMinutes) || input.slaMinutes < SLA_MIN || input.slaMinutes > SLA_SERVICE_MAX) {
      errors.slaMinutes = `SLA must be a whole number of minutes between ${SLA_MIN} and ${SLA_SERVICE_MAX} (1 week).`;
    }
  }
  return errors;
}

export interface TransitionOption {
  status: Exclude<CaseStatus, 'OPEN'>;
  disabled: boolean;
  reason?: string;
}

/**
 * Next states offered in the UI. The service only enforces "closed is final" and
 * "closing needs a note"; the UI additionally keeps the workflow moving forward
 * (an actioned case may go back to investigation, nothing returns to OPEN).
 */
export const CASE_TRANSITIONS: Record<CaseStatus, Array<Exclude<CaseStatus, 'OPEN'>>> = {
  OPEN: ['INVESTIGATING', 'ACTIONED', 'CLOSED'],
  INVESTIGATING: ['ACTIONED', 'CLOSED'],
  ACTIONED: ['INVESTIGATING', 'CLOSED'],
  CLOSED: [],
};

export function allowedTransitions(status: CaseStatus, noteCount: number): TransitionOption[] {
  return (CASE_TRANSITIONS[status] ?? []).map((next) =>
    next === 'CLOSED' && noteCount === 0
      ? { status: next, disabled: true, reason: 'Add at least one note before closing this case.' }
      : { status: next, disabled: false },
  );
}

/** Whether a case is past its SLA (closed cases never are). */
export function isCaseOverdue(c: Pick<CaseRecord, 'status' | 'dueAt'>, now = Date.now()): boolean {
  return c.status !== 'CLOSED' && new Date(c.dueAt).getTime() < now;
}

/** `125` → `2h 5m`; negative values are treated as their magnitude. */
export function formatMinutes(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** First 8 hex chars, upper-cased — the reference the backend uses in alerts. */
export function caseReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

const enc = encodeURIComponent;

/** `POST /cases/report` body (M56): any guardian, teacher or student. */
export interface ReportConcernInput {
  type: CaseType;
  description: string;
  classId?: string;
  threadId?: string;
}

/** `POST /cases/report` answer: only a reference, never the case itself. */
export interface ReportReceipt {
  reference: string;
  receivedAt: string;
}

/** `GET /cases/mine` row: reference and status only. */
export interface MyReport {
  reference: string;
  type: CaseType;
  status: CaseStatus;
  receivedAt: string;
  closedAt: string | null;
}

export const REPORT_MIN_LENGTH = 10;
export const REPORT_MAX_LENGTH = 8000;

export function validateReport(input: ReportConcernInput): string | null {
  const text = input.description.trim();
  if (text.length < REPORT_MIN_LENGTH) return `Describe what happened in at least ${REPORT_MIN_LENGTH} characters.`;
  if (text.length > REPORT_MAX_LENGTH) return `Keep the description under ${REPORT_MAX_LENGTH} characters.`;
  return null;
}

export const casesApi = {
  report: (input: ReportConcernInput) =>
    http.post<ReportReceipt>('/cases/report', {
      type: input.type,
      description: input.description.trim(),
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
    }),
  mine: () => http.get<MyReport[]>('/cases/mine'),
  list: (filter: CaseListFilter = {}) =>
    http.get<CaseListItem[]>('/cases', {
      query: {
        type: filter.type,
        status: filter.status,
        overdueOnly: filter.overdueOnly ? 'true' : undefined,
      },
    }),
  sla: () => http.get<CaseSlaReport>('/cases/sla'),
  get: (id: string) => http.get<CaseDetail>(`/cases/${enc(id)}`),
  open: (body: OpenCaseInput) => http.post<CaseRecord>('/cases', body),
  addNote: (id: string, note: string) => http.post<CaseNote>(`/cases/${enc(id)}/notes`, { note }),
  transition: (id: string, status: Exclude<CaseStatus, 'OPEN'>) =>
    http.post<CaseRecord>(`/cases/${enc(id)}/transition`, { status }),
  assign: (id: string, ownerId: string) => http.post<CaseRecord>(`/cases/${enc(id)}/assign`, { ownerId }),
  setSeverity: (id: string, severity: CaseSeverity) => http.post<CaseRecord>(`/cases/${enc(id)}/severity`, { severity }),
};
