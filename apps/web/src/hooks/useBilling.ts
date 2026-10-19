'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  billingFamilyApi,
  CheckoutInput,
  SubscribeInput,
} from '@/lib/api/modules/billing-family';

export const billingKeys = {
  all: ['billing-family'] as const,
  family: ['billing-family', 'family'] as const,
  families: ['billing-family', 'families'] as const,
  plans: ['billing-family', 'plans'] as const,
};

export function useFamilyBilling() {
  return useQuery({ queryKey: billingKeys.family, queryFn: billingFamilyApi.family });
}

export function useBillingFamilies() {
  return useQuery({
    queryKey: billingKeys.families,
    queryFn: billingFamilyApi.families,
    staleTime: 5 * 60 * 1000,
  });
}

/** Full catalogue (all currencies) — the screen picks the family's currency. */
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
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: { input: SubscribeInput; idempotencyKey?: string }) =>
      billingFamilyApi.subscribe(input, idempotencyKey),
    onSettled: invalidate,
  });
}

export function useCancelSubscription() {
  const invalidate = useInvalidateFamilyBilling();
  return useMutation({
    mutationFn: ({ subscriptionId, atPeriodEnd }: { subscriptionId: string; atPeriodEnd: boolean }) =>
      billingFamilyApi.cancel(subscriptionId, atPeriodEnd),
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
