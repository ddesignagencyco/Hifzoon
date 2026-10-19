import { http } from '../http';

/** CRM (`/admin/crm/*`, CrmController) — ADMIN and SUPER_ADMIN. */

export type LeadStatus = 'NEW' | 'TRIAL_BOOKED' | 'TRIAL_DONE' | 'WON' | 'LOST';
/** Funnel order used by the backend (`LEAD_FLOW`). */
export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON', 'LOST'];
export const CLOSED_LEAD_STATUSES: LeadStatus[] = ['WON', 'LOST'];

export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export const TASK_STATUSES: TaskStatus[] = ['OPEN', 'DONE', 'CANCELLED'];
export type TaskType = 'NO_SHOW_FOLLOWUP' | 'TRIAL_NOT_CONVERTED' | 'OTHER';
export const TASK_TYPES: TaskType[] = ['NO_SHOW_FOLLOWUP', 'TRIAL_NOT_CONVERTED', 'OTHER'];

/** Task row as stored (prisma `Task`). */
export interface CrmTask {
  id: string;
  leadId: string | null;
  type: TaskType;
  assigneeId: string | null;
  dueAt: string;
  status: TaskStatus;
  note: string | null;
  completedAt: string | null;
  createdAt: string;
}

/** Lead row as stored (prisma `Lead`). */
export interface Lead {
  id: string;
  source: string | null;
  status: LeadStatus;
  ownerId: string | null;
  contactName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  childAge: number | null;
  courseInterest: string | null;
  familyId: string | null;
  trialClassId: string | null;
  lostReason: string | null;
  notes: string | null;
  contactUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /admin/crm/leads` row: lead + open tasks + owner. */
export interface LeadListItem extends Lead {
  tasks: CrmTask[];
  owner: { id: string; name: string; email: string | null } | null;
}

/** `GET /admin/crm/tasks` row. */
export interface TaskListItem extends CrmTask {
  lead: { id: string; contactName: string; status: LeadStatus } | null;
  assignee: { id: string; name: string } | null;
}

/** CRM list endpoints return `{ items, total, page, limit }` as the payload (not pagination meta). */
export interface CrmPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PipelineSummary {
  counts: Array<{ status: LeadStatus; count: number }>;
  total: number;
  won: number;
  trialToWonRate: number | null;
  bookingToDoneRate: number | null;
  openTasks: number;
  overdueTasks: number;
}

export interface LeadFilters {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  ownerId?: string;
  source?: string;
  search?: string;
}

export interface CreateLeadInput {
  contactName: string;
  source?: string;
  email?: string;
  phone?: string;
  country?: string;
  childAge?: number;
  courseInterest?: string;
  notes?: string;
  ownerId?: string;
}

export interface UpdateLeadStatusInput {
  status: LeadStatus;
  lostReason?: string;
  familyId?: string;
}

export interface TaskFilters {
  page?: number;
  limit?: number;
  assigneeId?: string;
  status?: TaskStatus;
  overdueOnly?: boolean;
}

export interface CreateTaskInput {
  leadId?: string;
  type: TaskType;
  assigneeId?: string;
  /** ISO date-time. */
  dueAt: string;
  note?: string;
}

const enc = encodeURIComponent;

export const crmApi = {
  listLeads: (filters: LeadFilters = {}) =>
    http.get<CrmPage<LeadListItem>>('/admin/crm/leads', { query: { ...filters } }),
  createLead: (body: CreateLeadInput) => http.post<Lead>('/admin/crm/leads', body),
  updateLeadStatus: (leadId: string, body: UpdateLeadStatusInput) =>
    http.patch<Lead>(`/admin/crm/leads/${enc(leadId)}/status`, body),
  pipeline: () => http.get<PipelineSummary>('/admin/crm/pipeline'),
  listTasks: (filters: TaskFilters = {}) =>
    http.get<CrmPage<TaskListItem>>('/admin/crm/tasks', {
      // `overdueOnly` is z.coerce.boolean(): any non-empty string is true, so only send it when set.
      query: { ...filters, overdueOnly: filters.overdueOnly ? true : undefined },
    }),
  createTask: (body: CreateTaskInput) => http.post<CrmTask>('/admin/crm/tasks', body),
  completeTask: (taskId: string) => http.post<CrmTask>(`/admin/crm/tasks/${enc(taskId)}/complete`),
};

// ── Validation mirroring the zod schemas in crm.controller.ts ────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Raw text form state for the create-lead form. */
export interface LeadFormValues {
  contactName: string;
  source: string;
  email: string;
  phone: string;
  country: string;
  childAge: string;
  courseInterest: string;
  notes: string;
}

export const EMPTY_LEAD_FORM: LeadFormValues = {
  contactName: '',
  source: '',
  email: '',
  phone: '',
  country: '',
  childAge: '',
  courseInterest: '',
  notes: '',
};

export type LeadFormErrors = Partial<Record<keyof LeadFormValues, string>>;

/** Validates against `createLeadBody`. */
export function validateLeadForm(values: LeadFormValues): LeadFormErrors {
  const errors: LeadFormErrors = {};
  const name = values.contactName.trim();
  if (!name) errors.contactName = 'Contact name is required.';
  else if (name.length > 160) errors.contactName = 'Contact name is limited to 160 characters.';
  if (values.source.trim().length > 60) errors.source = 'Source is limited to 60 characters.';
  const email = values.email.trim();
  if (email && (!EMAIL_RE.test(email) || email.length > 320)) errors.email = 'Enter a valid email address.';
  const phone = values.phone.trim();
  if (phone && (phone.length < 5 || phone.length > 32)) errors.phone = 'Phone must be 5–32 characters.';
  const country = values.country.trim();
  if (country && !/^[A-Za-z]{2}$/.test(country)) errors.country = 'Use a 2-letter country code (e.g. GB).';
  const age = values.childAge.trim();
  if (age) {
    const n = Number(age);
    if (!Number.isInteger(n) || n < 3 || n > 18) errors.childAge = "Child's age must be a whole number from 3 to 18.";
  }
  if (values.courseInterest.trim().length > 60) errors.courseInterest = 'Course interest is limited to 60 characters.';
  if (values.notes.length > 4000) errors.notes = 'Notes are limited to 4000 characters.';
  return errors;
}

/** Converts the validated form to the request body, omitting empty optionals. */
export function toCreateLeadInput(values: LeadFormValues): CreateLeadInput {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    contactName: values.contactName.trim(),
    source: opt(values.source),
    email: opt(values.email),
    phone: opt(values.phone),
    country: opt(values.country)?.toUpperCase(),
    childAge: values.childAge.trim() ? Number(values.childAge) : undefined,
    courseInterest: opt(values.courseInterest),
    notes: opt(values.notes),
  };
}

/** Stages a lead may move to from its current one (closed leads are immutable server-side). */
export function nextLeadStatuses(current: LeadStatus): LeadStatus[] {
  if (CLOSED_LEAD_STATUSES.includes(current)) return [];
  return LEAD_STATUSES.filter((s) => s !== current);
}

/** `0.333` → `33%`; null when the backend could not compute a rate. */
export function formatRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 1000) / 10}%`;
}
