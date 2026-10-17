'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchPlans, PlanConfig } from '@/lib/api/client';

export const PLANS_QUERY_KEY = ['billing-plans'] as const;

export function usePlans() {
  const query = useQuery<PlanConfig[], Error>({
    queryKey: PLANS_QUERY_KEY,
    queryFn: fetchPlans,
    staleTime: 5 * 60 * 1000,
  });

  return {
    plans: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
