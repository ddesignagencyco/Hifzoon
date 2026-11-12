'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingAdminApi,
  InvoiceListFilters,
  IssueInvoiceInput,
  PlanInput,
  PromoCodeInput,
  RefundInput,
  SetPriceInput,
  WriteOffInput,
} from '@/lib/api/modules/billing-admin';
import {
  PayRateInput,
  PayrollAdjustmentKind,
  payrollAdminApi,
} from '@/lib/api/modules/payroll-admin';
import { auditApi } from '@/lib/api/modules/audit';

export const financeKeys = {
  plans: ['finance', 'plans'] as const,
  rates: ['finance', 'payroll', 'rates'] as const,
  report: (periodId: string) => ['finance', 'payroll', 'report', periodId] as const,
  reportsAll: ['finance', 'payroll', 'report'] as const,
  periods: ['finance', 'payroll', 'periods'] as const,
  billingActivity: ['finance', 'billing-activity'] as const,
  prices: ['finance', 'prices'] as const,
  invoices: (filters: InvoiceListFilters) => ['finance', 'invoices', filters] as const,
  promoCodes: ['finance', 'promo-codes'] as const,
  ratesAll: ['finance', 'payroll', 'rates'] as const,
  classCredits: (familyId: string) => ['finance', 'class-credits', familyId] as const,
};

export function usePromoCodes(enabled = true) {
  return useQuery({
    queryKey: financeKeys.promoCodes,
    queryFn: billingAdminApi.promoCodes,
    enabled,
  });
}

/** Create, edit or delete a promo code, refreshing the list after any of them. */
export function useSavePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'create'; body: PromoCodeInput }
        | { kind: 'update'; id: string; body: Partial<Omit<PromoCodeInput, 'code'>> }
        | { kind: 'delete'; id: string },
    ): Promise<unknown> =>
      input.kind === 'create'
        ? billingAdminApi.createPromoCode(input.body)
        : input.kind === 'update'
          ? billingAdminApi.updatePromoCode(input.id, input.body)
          : billingAdminApi.deletePromoCode(input.id),
    onSettled: () => qc.invalidateQueries({ queryKey: financeKeys.promoCodes }),
  });
}

/** `q` searches family name / invoice number on the server; empty gives the newest records. */
export function useBillingLookups(q = '') {
  const term = q.trim();
  return useQuery({
    queryKey: ['finance', 'lookups', term],
    queryFn: () => billingAdminApi.lookups(term),
    placeholderData: keepPreviousData,
    staleTime: 15 * 1000,
  });
}

export function useAdminInvoices(filters: InvoiceListFilters) {
  return useQuery({
    queryKey: financeKeys.invoices(filters),
    queryFn: () => billingAdminApi.listInvoices(filters),
    staleTime: 15 * 1000,
    placeholderData: keepPreviousData,
  });
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
  return useMutation({
    mutationFn: (body: SetPriceInput) => billingAdminApi.setPrice(body),
    onSuccess: invalidate,
  });
}

export function useCreatePlan() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: (body: PlanInput) => billingAdminApi.createPlan(body),
    onSuccess: invalidate,
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidatePricing();
  return useMutation({
    mutationFn: ({
      planId,
      body,
    }: {
      planId: string;
      body: Parameters<typeof billingAdminApi.updatePlan>[1];
    }) => billingAdminApi.updatePlan(planId, body),
    onSuccess: invalidate,
  });
}

export function useBillingPlans() {
  return useQuery({
    queryKey: financeKeys.plans,
    queryFn: () => billingAdminApi.plans(),
    staleTime: 5 * 60 * 1000,
  });
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
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
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
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
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
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
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
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
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

export function usePayRates(includeInactive = false) {
  return useQuery({
    queryKey: [...financeKeys.rates, { includeInactive }],
    queryFn: () => payrollAdminApi.rates(includeInactive),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePayrollPeriods() {
  return useQuery({
    queryKey: financeKeys.periods,
    queryFn: payrollAdminApi.periods,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: financeKeys.periods }),
  });
}

export function useCalculatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => payrollAdminApi.calculate(periodId),
    onSuccess: (_data, periodId) => {
      qc.invalidateQueries({ queryKey: financeKeys.report(periodId) });
      // The period moves OPEN → CALCULATED, which the periods list must show.
      qc.invalidateQueries({ queryKey: financeKeys.periods });
    },
  });
}

export function useMarkPayrollEntryPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, payoutReference }: { entryId: string; payoutReference: string }) =>
      payrollAdminApi.markPaid(entryId, payoutReference),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.reportsAll });
      qc.invalidateQueries({ queryKey: financeKeys.periods });
    },
  });
}

/** Create / edit / switch a pay rate on or off; every rates view (and teacher pickers) refresh. */
export function useSavePayRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { kind: 'create'; body: PayRateInput }
        | { kind: 'update'; id: string; body: Partial<PayRateInput> }
        | { kind: 'active'; id: string; active: boolean },
    ): Promise<unknown> =>
      input.kind === 'create'
        ? payrollAdminApi.createRate(input.body)
        : input.kind === 'update'
          ? payrollAdminApi.updateRate(input.id, input.body)
          : payrollAdminApi.setRateActive(input.id, input.active),
    onSettled: () => qc.invalidateQueries({ queryKey: financeKeys.ratesAll }),
  });
}

export function useAssignTeacherRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teacherId, rateId }: { teacherId: string; rateId: string | null }) =>
      payrollAdminApi.assignTeacherRate(teacherId, rateId),
    // The rates list shows how many teachers are on each rate.
    onSettled: () => qc.invalidateQueries({ queryKey: financeKeys.ratesAll }),
  });
}

export function useAdjustPayrollEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      entryId,
      ...body
    }: {
      entryId: string;
      kind: PayrollAdjustmentKind;
      amountMinor: number;
      reason: string;
    }) => payrollAdminApi.adjust(entryId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: financeKeys.reportsAll });
      qc.invalidateQueries({ queryKey: ['teacher', 'payslips'] });
    },
  });
}

/** Exporting moves a CALCULATED period to EXPORTED, so reports and the periods list refresh. */
export function useExportPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => payrollAdminApi.exportCsv(periodId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: financeKeys.reportsAll });
      qc.invalidateQueries({ queryKey: financeKeys.periods });
    },
  });
}

export function useClassCredits(familyId: string | null) {
  return useQuery({
    queryKey: financeKeys.classCredits(familyId ?? ''),
    queryFn: () => billingAdminApi.classCredits(familyId as string),
    enabled: Boolean(familyId),
    retry: false,
  });
}

export function useIssueClassCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      body,
      idempotencyKey,
    }: {
      body: { familyId: string; amountClasses: number; reason: string };
      idempotencyKey: string;
    }) => billingAdminApi.issueClassCredit(body, idempotencyKey),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: financeKeys.classCredits(v.body.familyId) }),
  });
}

export function useRevokeClassCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; familyId: string; reason: string }) =>
      billingAdminApi.revokeClassCredit(id, reason),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: financeKeys.classCredits(v.familyId) }),
  });
}
