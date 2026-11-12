import { apiDownload } from '../client';
import { http } from '../http';

export type PayrollStatus = 'OPEN' | 'CALCULATED' | 'EXPORTED' | 'PAID';

export type PayRateClassType = 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';
export const PAY_RATE_CLASS_TYPES: PayRateClassType[] = ['TRIAL', 'REGULAR', 'CIRCLE', 'EXAM', 'MAKEUP'];

/** `GET /payroll/rates` row (Prisma `PayRate`; inactive ones only with `includeInactive`). */
export interface PayRate {
  id: string;
  name: string;
  currency: string;
  ratePerClassMinor: number;
  classType: PayRateClassType | null;
  effectiveFrom: string;
  active: boolean;
  createdAt: string;
  /** Teachers currently on this rate (rates list only). */
  _count?: { teachers: number };
}

export interface PayRateInput {
  name: string;
  currency: string;
  ratePerClassMinor: number;
  classType?: PayRateClassType | null;
  effectiveFrom: string;
}

export type PayrollAdjustmentKind = 'BONUS' | 'DEDUCTION';

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
    teacherId: string;
    grossMinor: number;
    deductionsMinor: number;
    bonusesMinor: number;
    netMinor: number;
    status: PayrollStatus;
    payoutReference: string | null;
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
  rates: (includeInactive = false) =>
    http.get<PayRate[]>('/payroll/rates', { query: { includeInactive: includeInactive || undefined } }),
  createRate: (body: PayRateInput) => http.post<PayRate>('/payroll/rates', body),
  updateRate: (id: string, body: Partial<PayRateInput>) =>
    http.patch<PayRate>(`/payroll/rates/${encodeURIComponent(id)}`, body),
  setRateActive: (id: string, active: boolean) =>
    http.post<PayRate>(`/payroll/rates/${encodeURIComponent(id)}/active`, { active }),
  assignTeacherRate: (teacherId: string, rateId: string | null) =>
    http.put<{ id: string; payRateId: string | null }>(`/payroll/teachers/${encodeURIComponent(teacherId)}/rate`, { rateId }),
  /** Downloads the CSV; a CALCULATED period becomes EXPORTED. */
  exportCsv: (periodId: string) =>
    apiDownload(`/payroll/periods/${encodeURIComponent(periodId)}/export.csv`, `payroll-${periodId}.csv`),
  adjust: (entryId: string, body: { kind: PayrollAdjustmentKind; amountMinor: number; reason: string }) =>
    http.post<PayrollEntry>(`/payroll/entries/${encodeURIComponent(entryId)}/adjustments`, body),
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
  if (!errors.startsOn && !errors.endsOn && endsOn < startsOn) errors.endsOn = 'The period cannot end before it starts.';
  return errors;
}

/** Pay-rate form checks; the amount is typed in major units (e.g. 4.50). */
export function validatePayRate(v: {
  name: string;
  currency: string;
  amount: string;
  effectiveFrom: string;
}): Partial<Record<'name' | 'currency' | 'amount' | 'effectiveFrom', string>> {
  const errors: Partial<Record<'name' | 'currency' | 'amount' | 'effectiveFrom', string>> = {};
  if (!v.name.trim()) errors.name = 'Give the rate a name.';
  if (!/^[A-Za-z]{3}$/.test(v.currency.trim())) errors.currency = 'Use a 3-letter currency code.';
  const n = Number(v.amount);
  if (!v.amount.trim() || !Number.isFinite(n) || n <= 0) errors.amount = 'Enter an amount above zero.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom)) errors.effectiveFrom = 'Choose a date.';
  return errors;
}

/** A bonus/deduction needs a positive amount and a reason (shown on the payslip). */
export function validateAdjustment(amount: string, reason: string): { amount?: string; reason?: string } {
  const errors: { amount?: string; reason?: string } = {};
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n) || n <= 0) errors.amount = 'Enter an amount above zero.';
  if (reason.trim().length < 3) errors.reason = 'Give a reason (at least 3 characters).';
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
