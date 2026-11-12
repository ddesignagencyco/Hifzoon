import { http } from '../http';

/** `GET /admin/ops/families/:id` */
export interface FamilyDetail {
  id: string;
  name: string;
  country: string | null;
  currency: string | null;
  timeZone: string | null;
  billingName: string | null;
  createdAt: string;
  deletedAt: string | null;
  members: Array<{
    id: string;
    relationship: string;
    isPrimary: boolean;
    verifiedAt: string | null;
    user: { id: string; name: string; email: string | null; phone: string | null; status: string; lastActiveAt: string | null };
  }>;
  students: Array<{
    id: string;
    displayName: string;
    birthYear: number;
    gender: string | null;
    language: string;
    kidsMode: boolean;
    enrolments: Array<{ id: string; status: string; course: { name: string }; teacher: { id: string; user: { name: string } } | null }>;
  }>;
  subscriptions: Array<{
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    amountMinor: number;
    currency: string;
    plan: { name: string };
  }>;
  invoices: Array<{ id: string; number: string; status: string; totalMinor: number; currency: string; dueAt: string | null }>;
  balances: {
    classCredits: number;
    availableMakeupCredits: number;
    openInvoices: number;
    openInvoicesMinor: number;
    openDataRequests: number;
  };
}

export interface FamilyPatch {
  name?: string;
  country?: string | null;
  timeZone?: string;
  billingName?: string | null;
}

/** `GET /admin/ops/students/:id` */
export interface StudentDetail {
  id: string;
  displayName: string;
  birthYear: number;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  language: string;
  timeZone: string;
  kidsMode: boolean;
  notes: string | null;
  mushafLayout: 'MADANI_15' | 'INDOPAK_13' | 'INDOPAK_16';
  createdAt: string;
  deletedAt: string | null;
  family: { id: string; name: string };
  user: { id: string; email: string | null } | null;
  enrolments: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    currentLessonPosition: number | null;
    course: { id: string; name: string };
    currentLevel: { name: string } | null;
    teacher: { id: string; user: { name: string } } | null;
  }>;
  recentClasses: Array<{
    id: string;
    startsAt: string;
    status: string;
    type: string;
    course: { name: string };
    teacher: { user: { name: string } };
  }>;
  classCounts: Record<string, number>;
}

export interface StudentPatch {
  displayName?: string;
  birthYear?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  language?: string;
  timeZone?: string;
  kidsMode?: boolean;
  notes?: string | null;
  mushafLayout?: StudentDetail['mushafLayout'];
}

export type Granularity = 'week' | 'month';

/** `GET /admin/ops/analytics` — rates are `null` when there is nothing to measure. */
export interface AnalyticsReport {
  range: { from: string; to: string; granularity: Granularity };
  revenue: Array<{ bucket: string; currency: string; grossMinor: number; refundedMinor: number; netMinor: number }>;
  completion: Array<{
    bucket: string;
    completed: number;
    noShow: number;
    cancelled: number;
    finished: number;
    completionRate: number | null;
  }>;
  churn: Array<{ bucket: string; activeAtStart: number; cancelled: number; churnRate: number | null }>;
  teacherUtilisation: {
    overall: number | null;
    teachers: Array<{ teacherId: string; name: string; taughtMinutes: number; availableMinutes: number; utilisation: number | null }>;
  };
}

export type StaffInviteRole = 'ADMIN' | 'SUPERVISOR' | 'SAFEGUARDING_LEAD' | 'EXAMINER';
export const STAFF_INVITE_ROLES: StaffInviteRole[] = ['ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD', 'EXAMINER'];

export interface UserSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  staff: boolean;
}

const enc = encodeURIComponent;

export const opsAdminApi = {
  family: (id: string) => http.get<FamilyDetail>(`/admin/ops/families/${enc(id)}`),
  updateFamily: (id: string, body: FamilyPatch) => http.patch<unknown>(`/admin/ops/families/${enc(id)}`, body),
  student: (id: string) => http.get<StudentDetail>(`/admin/ops/students/${enc(id)}`),
  updateStudent: (id: string, body: StudentPatch) => http.patch<unknown>(`/admin/ops/students/${enc(id)}`, body),
  analytics: (p: { from?: string; to?: string; granularity: Granularity }) =>
    http.get<AnalyticsReport>('/admin/ops/analytics', { query: p }),
  createStaff: (body: { email: string; name: string; phone?: string; roles: StaffInviteRole[] }) =>
    http.post<{ userId: string; inviteEmailed: boolean }>('/admin/console/staff', body),
  resendInvite: (userId: string) => http.post<unknown>(`/admin/console/users/${enc(userId)}/resend-invite`),
  passwordReset: (userId: string) => http.post<unknown>(`/admin/console/users/${enc(userId)}/password-reset`),
  resetTwoFactor: (userId: string) => http.post<unknown>(`/admin/console/users/${enc(userId)}/two-factor/reset`),
  revokeSessions: (userId: string) =>
    http.post<{ userId: string; sessionsRevoked: number }>(`/admin/console/users/${enc(userId)}/revoke-sessions`),
  sessions: (userId: string) => http.get<UserSession[]>(`/admin/console/users/${enc(userId)}/sessions`),
};

/** Rates come back as 0..1 (or null). */
export function pct(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${Math.round(rate * 1000) / 10}%`;
}
