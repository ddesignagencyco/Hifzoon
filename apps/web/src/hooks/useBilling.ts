'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingFamilyApi,
  CheckoutInput,
  QuoteInput,
  ScheduleChoice,
  StartWithTeacherInput,
  SubscribeInput,
} from '@/lib/api/modules/billing-family';

export const billingKeys = {
  all: ['billing-family'] as const,
  family: ['billing-family', 'family'] as const,
  families: ['billing-family', 'families'] as const,
  plans: ['billing-family', 'plans'] as const,
  offers: ['billing-family', 'offers'] as const,
};

/**
 * The family's price with every discount, re-read when the plan, times or applied promo
 * code change. A rejected code comes back as the query's error, for the field to show.
 */
export function usePriceQuote(input: QuoteInput | null) {
  return useQuery({
    queryKey: ['billing-quote', input] as const,
    queryFn: () => billingFamilyApi.quote(input as QuoteInput),
    enabled: Boolean(input?.familyId && input.planId),
    retry: false,
    staleTime: 30 * 1000,
  });
}

/** One teacher's plan prices in USD (public; no family discounts). */
export function useTeacherPrices(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: ['billing-teacher-prices', teacherId ?? ''] as const,
    queryFn: () => billingFamilyApi.teacherPrices(teacherId as string),
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Won trials waiting for the family to continue with the teacher. */
export function useTrialOffers(enabled = true) {
  return useQuery({ queryKey: billingKeys.offers, queryFn: billingFamilyApi.offers, enabled });
}

export function useSyncSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) => billingFamilyApi.sync(subscriptionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  });
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, planId }: { subscriptionId: string; planId: string }) =>
      billingFamilyApi.changePlan(subscriptionId, planId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  });
}

export function useChangeWeeklyTimes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      subscriptionId,
      body,
    }: {
      subscriptionId: string;
      body: Omit<ScheduleChoice, 'teacherId'>;
    }) => billingFamilyApi.weeklyTimes(subscriptionId, body),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.all });
      queryClient.invalidateQueries({ queryKey: ['parent'] });
    },
  });
}

export function useKeepSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) => billingFamilyApi.keep(subscriptionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  });
}

export function useBillingPortal() {
  return useMutation({ mutationFn: (familyId: string) => billingFamilyApi.portal(familyId) });
}

export function useFamilyBilling() {
  return useQuery({ queryKey: billingKeys.family, queryFn: billingFamilyApi.family });
}

export function useFamilyPayments() {
  return useQuery({
    queryKey: [...billingKeys.family, 'payments'],
    queryFn: billingFamilyApi.payments,
  });
}

export function useBillingFamilies() {
  return useQuery({
    queryKey: billingKeys.families,
    queryFn: billingFamilyApi.families,
    staleTime: 5 * 60 * 1000,
  });
}

/** Full catalogue (plan shape and tier, no prices). */
export function useBillingPlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: () => billingFamilyApi.plans(),
    staleTime: 5 * 60 * 1000,
  });
}

function useInvalidateFamilyBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: billingKeys.family });
}

export function useSubscribe() {
  const invalidate = useInvalidateFamilyBilling();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: SubscribeInput; idempotencyKey?: string }) =>
      billingFamilyApi.subscribe(input, idempotencyKey),
    onSettled: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: billingKeys.offers });
    },
  });
}

/** "Start with this teacher": child, course, teacher, plan and weekly times, then the card page. */
export function useStartWithTeacher() {
  const invalidate = useInvalidateFamilyBilling();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: StartWithTeacherInput;
      idempotencyKey?: string;
    }) => billingFamilyApi.startWithTeacher(input, idempotencyKey),
    onSettled: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['parent'] });
    },
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateFamilyBilling();
  return useMutation({
    mutationFn: ({
      subscriptionId,
      atPeriodEnd,
    }: {
      subscriptionId: string;
      atPeriodEnd: boolean;
    }) => billingFamilyApi.cancel(subscriptionId, atPeriodEnd),
    onSettled: invalidate,
  });
}

export function usePauseSubscription() {
  const invalidate = useInvalidateFamilyBilling();
  return useMutation({
    mutationFn: ({ subscriptionId, days }: { subscriptionId: string; days: number }) =>
      billingFamilyApi.pause(subscriptionId, days),
    onSettled: invalidate,
  });
}

export function useResumeSubscription() {
  const invalidate = useInvalidateFamilyBilling();
  return useMutation({
    mutationFn: (subscriptionId: string) => billingFamilyApi.resume(subscriptionId),
    onSettled: invalidate,
  });
}

export function useCheckout() {
  const invalidate = useInvalidateFamilyBilling();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: CheckoutInput; idempotencyKey: string }) =>
      billingFamilyApi.checkout(input, idempotencyKey),
    onSettled: invalidate,
  });
}
