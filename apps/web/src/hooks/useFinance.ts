'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { billingAdminApi, IssueInvoiceInput, RefundInput } from '@/lib/api/modules/billing-admin';
import { payrollAdminApi } from '@/lib/api/modules/payroll-admin';
import { auditApi } from '@/lib/api/modules/audit';

export const financeKeys = {
  plans: ['finance', 'plans'] as const,
  rates: ['finance', 'payroll', 'rates'] as const,
  report: (periodId: string) => ['finance', 'payroll', 'report', periodId] as const,
  reportsAll: ['finance', 'payroll', 'report'] as const,
  /** Periods discovered from the audit log (SUPER_ADMIN only — there is no period list endpoint). */
  periodsFromAudit: ['finance', 'payroll', 'periods-audit'] as const,
  billingActivity: ['finance', 'billing-activity'] as const,
};

export function useBillingPlans() {
  return useQuery({ queryKey: financeKeys.plans, queryFn: () => billingAdminApi.plans(), staleTime: 5 * 60 * 1000 });
}

/** Each mutation takes the idempotency key the caller minted once for this user intent. */
export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: IssueInvoiceInput; idempotencyKey: string }) =>
      billingAdminApi.issueInvoice(body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.billingActivity }),
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: RefundInput; idempotencyKey: string }) =>
      billingAdminApi.refund(body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.billingActivity }),
  });
}

export function useRunDunning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) => billingAdminApi.runDunning(idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.billingActivity }),
  });
}

/** Recent billing operations from the audit log (SUPER_ADMIN only). */
export function useBillingActivity(enabled: boolean) {
  return useQuery({
    queryKey: financeKeys.billingActivity,
    queryFn: () => auditApi.list({ action: 'bil.', limit: 20 }),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function usePayRates() {
  return useQuery({ queryKey: financeKeys.rates, queryFn: payrollAdminApi.rates, staleTime: 5 * 60 * 1000 });
}

export function usePayrollPeriodsFromAudit(enabled: boolean) {
  return useQuery({
    queryKey: financeKeys.periodsFromAudit,
    queryFn: () => auditApi.list({ action: 'pay.period.open', targetType: 'payroll_period', limit: 50 }),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function usePayrollReport(periodId: string | null) {
  return useQuery({
    queryKey: financeKeys.report(periodId ?? ''),
    queryFn: () => payrollAdminApi.report(periodId as string),
    enabled: Boolean(periodId),
    retry: false,
  });
}

export function useOpenPayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { startsOn: string; endsOn: string }) => payrollAdminApi.openPeriod(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.periodsFromAudit }),
  });
}

export function useCalculatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => payrollAdminApi.calculate(periodId),
    onSuccess: (_data, periodId) => qc.invalidateQueries({ queryKey: financeKeys.report(periodId) }),
  });
}

export function useMarkPayrollEntryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, payoutReference }: { entryId: string; payoutReference: string }) =>
      payrollAdminApi.markPaid(entryId, payoutReference),
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.reportsAll }),
  });
}
