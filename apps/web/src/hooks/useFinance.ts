'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingAdminApi,
  IssueInvoiceInput,
  PlanInput,
  RefundInput,
  SetPriceInput,
  WriteOffInput,
} from '@/lib/api/modules/billing-admin';
import { payrollAdminApi } from '@/lib/api/modules/payroll-admin';
import { auditApi } from '@/lib/api/modules/audit';

export const financeKeys = {
  plans: ['finance', 'plans'] as const,
  rates: ['finance', 'payroll', 'rates'] as const,
  report: (periodId: string) => ['finance', 'payroll', 'report', periodId] as const,
  reportsAll: ['finance', 'payroll', 'report'] as const,
  periods: ['finance', 'payroll', 'periods'] as const,
  billingActivity: ['finance', 'billing-activity'] as const,
  prices: ['finance', 'prices'] as const,
};

export function useBillingLookups() {
  return useQuery({ queryKey: ['finance', 'lookups'], queryFn: billingAdminApi.lookups, staleTime: 15 * 1000 });
}

export function useAdminPrices(enabled = true) {
  return useQuery({ queryKey: financeKeys.prices, queryFn: billingAdminApi.prices, enabled });
}

/** Any price or plan change: refresh the editor, catalogues and every cached family price. */
function useInvalidatePricing() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: financeKeys.prices }),
      qc.invalidateQueries({ queryKey: financeKeys.plans }),
      qc.invalidateQueries({ queryKey: ['billing-plan-price'] }),
      qc.invalidateQueries({ queryKey: ['billing-family'] }),
    ]);
}

export function useSetPrice() {
  const invalidate = useInvalidatePricing();
  return useMutation({ mutationFn: (body: SetPriceInput) => billingAdminApi.setPrice(body), onSuccess: invalidate });
}

export function useCreatePlan() {
  const invalidate = useInvalidatePricing();
  return useMutation({ mutationFn: (body: PlanInput) => billingAdminApi.createPlan(body), onSuccess: invalidate });
}

export function useUpdatePlan() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: Parameters<typeof billingAdminApi.updatePlan>[1] }) =>
      billingAdminApi.updatePlan(planId, body),
    onSuccess: invalidate,
  });
}

export function useBillingPlans() {
  return useQuery({ queryKey: financeKeys.plans, queryFn: () => billingAdminApi.plans(), staleTime: 5 * 60 * 1000 });
}

/** Each mutation takes the idempotency key the caller minted once for this user intent. */
export function useIssueInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: IssueInvoiceInput; idempotencyKey: string }) =>
      billingAdminApi.issueInvoice(body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.billingActivity });
      qc.invalidateQueries({ queryKey: ['finance', 'lookups'] });
    },
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: RefundInput; idempotencyKey: string }) =>
      billingAdminApi.refund(body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.billingActivity });
      qc.invalidateQueries({ queryKey: ['finance', 'lookups'] });
    },
  });
}

export function useWriteOffInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      body,
      idempotencyKey,
    }: {
      invoiceId: string;
      body: WriteOffInput;
      idempotencyKey: string;
    }) => billingAdminApi.writeOffInvoice(invoiceId, body, idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.billingActivity });
      qc.invalidateQueries({ queryKey: ['finance', 'lookups'] });
    },
  });
}

export function useRunDunning() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) => billingAdminApi.runDunning(idempotencyKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.billingActivity });
      qc.invalidateQueries({ queryKey: ['finance', 'lookups'] });
    },
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

export function usePayrollPeriods() {
  return useQuery({ queryKey: financeKeys.periods, queryFn: payrollAdminApi.periods, staleTime: 30 * 1000 });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.periods }),
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
