'use client';

import { useQuery } from '@tanstack/react-query';
import { healthApi } from '@/lib/api/modules/health';

/** Readiness, polled every 30 s while the admin overview is open. */
export function useApiReadiness() {
  return useQuery({ queryKey: ['health', 'ready'], queryFn: healthApi.ready, refetchInterval: 30 * 1000, retry: false });
}

export function useApiLiveness() {
  return useQuery({ queryKey: ['health', 'live'], queryFn: healthApi.live, refetchInterval: 30 * 1000, retry: false });
}
