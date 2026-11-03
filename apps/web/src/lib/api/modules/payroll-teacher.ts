import { http } from '../http';

/** `GET /payroll/my-payslips` (PayrollService.teacherPayslips) — a `payroll_entry` with its period and lines. */
export type PayrollLineKind = 'CLASS' | 'DEDUCTION_LATE' | 'DEDUCTION_MISSED' | 'BONUS' | string;
export type PayrollStatus = 'OPEN' | 'CALCULATED' | 'EXPORTED' | 'PAID' | string;

export interface PayslipLine {
  kind: PayrollLineKind;
  amountMinor: number;
  note: string | null;
  classId: string | null;
}

export interface Payslip {
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
  createdAt: string;
  updatedAt: string;
  period: { startsOn: string; endsOn: string; status: PayrollStatus };
  lines: PayslipLine[];
}

export const payrollTeacherApi = {
  myPayslips: (page?: number, limit?: number) =>
    http.getPage<Payslip>('/payroll/my-payslips', { query: { page, limit } }),
};

/**
 * Minor units → `1,234.50`. The payslip response carries no currency code, so the
 * amount is shown without a symbol rather than guessing one.
 */
export function formatMinorAmount(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return '—';
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
}

/** Period dates are `@db.Date` (UTC midnight) — format them in UTC so they never shift a day. */
export function formatPeriod(period: Payslip['period']): string {
  const fmt = (v: string) =>
    new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `${fmt(period.startsOn)} – ${fmt(period.endsOn)}`;
}
