'use client';

import { useQueries } from '@tanstack/react-query';
import { billingFamilyApi, PlanPrice } from '@/lib/api/modules/billing-family';

/** Tier pricing: price with a given teacher (their tier) or tier; standard price otherwise. */
export interface PriceContext {
  teacherId?: string | null;
  tierId?: string | null;
}

export const planPriceKey = (planId: string, ctx?: PriceContext) =>
  ['billing-plan-price', planId, ctx?.teacherId ?? '', ctx?.tierId ?? ''] as const;

/**
 * Each plan's USD price via `GET /billing/plans/:id/price`, since the catalogue does not
 * carry them. `get` returns `undefined` while loading or on error and `null` when the plan
 * has no price.
 */
export function usePlanPrices(planIds: string[], enabled = true, ctx?: PriceContext) {
  const results = useQueries({
    queries: planIds.map((planId) => ({
      queryKey: planPriceKey(planId, ctx),
      queryFn: () => billingFamilyApi.price(planId, ctx),
      staleTime: 5 * 60 * 1000,
      retry: false,
      enabled: enabled && Boolean(planId),
    })),
  });

  const byPlan = new Map<string, PlanPrice | null | undefined>();
  planIds.forEach((planId, i) => byPlan.set(planId, results[i]?.data));

  return {
    get: (planId: string) => byPlan.get(planId),
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
