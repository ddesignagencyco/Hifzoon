'use client';

import { useQueries } from '@tanstack/react-query';
import { billingFamilyApi, PlanPrice } from '@/lib/api/modules/billing-family';

export const planPriceKey = (planId: string, currency: string) => ['billing-plan-price', planId, currency] as const;

/**
 * Prices for each (plan, currency) pair via `GET /billing/plans/:id/price`, since the
 * catalogue no longer carries them. `get` returns `undefined` while loading or on error and
 * `null` when no price is set in that currency.
 */
export function usePlanPrices(planIds: string[], currencies: string[], enabled = true) {
  const pairs = planIds.flatMap((planId) => currencies.map((currency) => [planId, currency] as const));
  const results = useQueries({
    queries: pairs.map(([planId, currency]) => ({
      queryKey: planPriceKey(planId, currency),
      queryFn: () => billingFamilyApi.price(planId, currency),
      staleTime: 5 * 60 * 1000,
      retry: false,
      enabled: enabled && Boolean(planId && currency),
    })),
  });

  const byKey = new Map<string, PlanPrice | null | undefined>();
  pairs.forEach(([planId, currency], i) => byKey.set(`${planId}:${currency}`, results[i]?.data));

  return {
    get: (planId: string, currency: string) => byKey.get(`${planId}:${currency}`),
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
