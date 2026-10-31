import { http } from '../http';

export type PayrollStatus = 'OPEN' | 'CALCULATED' | 'EXPORTED' | 'PAID';

/** `GET /payroll/rates` row (Prisma `PayRate`, active only). */
export interface PayRate {
  id: string;
  name: string;
  currency: string;
  ratePerClassMinor: number;
  classType: 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP' | null;
  effectiveFrom: string;
  active: boolean;
  createdAt: string;
}

/** Prisma `PayrollPeriod` returned by `POST /payroll/periods`. */
export interface PayrollPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  status: PayrollStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CalculateResult {
  periodId: string;
  teachers: number;
  classesScanned: number;
}

/** `GET /payroll/periods/:id/report` (PayrollService.periodReport). Amounts carry no currency. */
export interface PayrollReport {
  period: { id: string; startsOn: string; endsOn: string; status: PayrollStatus };
  totals: { gross: number; deductions: number; bonuses: number; net: number };
  entries: Array<{
    id: string;
    teacher: string;
    grossMinor: number;
    netMinor: number;
    status: PayrollStatus;
    lineCount: number;
  }>;
}

/** Prisma `PayrollEntry` returned by `POST /payroll/entries/:id/paid`. */
export interface PayrollEntry {
  id: string;
  periodId: string;
  teacherId: string;
  grossMinor: number;
  deductionsMinor: number;
  bonusesMinor: number;
  netMinor: number;
  status: PayrollStatus;
  paidAt: string | null;
  payoutReference: string | null;
}

/** `GET /payroll/periods` row. */
export interface PayrollPeriodSummary {
  id: string;
  startsOn: string;
  endsOn: string;
  status: PayrollStatus;
  _count: { entries: number };
}

export const payrollAdminApi = {
  rates: () => http.get<PayRate[]>('/payroll/rates'),
  periods: () => http.get<PayrollPeriodSummary[]>('/payroll/periods'),
  openPeriod: (body: { startsOn: string; endsOn: string }) => http.post<PayrollPeriod>('/payroll/periods', body),
  calculate: (periodId: string) =>
    http.post<CalculateResult>(`/payroll/periods/${encodeURIComponent(periodId)}/calculate`),
  report: (periodId: string) => http.get<PayrollReport>(`/payroll/periods/${encodeURIComponent(periodId)}/report`),
  markPaid: (entryId: string, payoutReference: string) =>
    http.post<PayrollEntry>(`/payroll/entries/${encodeURIComponent(entryId)}/paid`, { payoutReference }),
};

/** Mirrors `periodBody` + the service rule "a payroll period must end after it starts". */
export function validatePeriod(startsOn: string, endsOn: string): Partial<Record<'startsOn' | 'endsOn', string>> {
  const errors: Partial<Record<'startsOn' | 'endsOn', string>> = {};
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v).getTime());
  if (!isDate(startsOn)) errors.startsOn = 'Choose a start date.';
  if (!isDate(endsOn)) errors.endsOn = 'Choose an end date.';
  if (!errors.startsOn && !errors.endsOn && endsOn <= startsOn) errors.endsOn = 'The period must end after it starts.';
  return errors;
}

/** Mirrors `markPaidBody` (1–120 chars). */
export function validatePayoutReference(value: string): string | null {
  const v = value.trim();
  if (v.length < 1) return 'Payout reference is required.';
  if (v.length > 120) return 'Payout reference must be at most 120 characters.';
  return null;
}

/** Formats a `@db.Date` value (`2026-10-01T00:00:00.000Z`) as a calendar date without timezone drift. */
export function formatPeriodDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
