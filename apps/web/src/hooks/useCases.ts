'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CaseListFilter, casesApi, CaseStatus, OpenCaseInput } from '@/lib/api/modules/cases';

export const caseKeys = {
  all: ['cases'] as const,
  list: (filter: CaseListFilter) => ['cases', 'list', filter.type ?? '', filter.status ?? '', !!filter.overdueOnly] as const,
  detail: (id: string) => ['cases', 'detail', id] as const,
  sla: ['cases', 'sla'] as const,
};

export function useCases(filter: CaseListFilter = {}) {
  return useQuery({
    queryKey: caseKeys.list(filter),
    queryFn: () => casesApi.list(filter),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Each read is audited server-side; keep the detail fresh but never keep a sensitive
 * record cached after the screen unmounts.
 */
export function useCase(id: string | undefined) {
  return useQuery({
    queryKey: caseKeys.detail(id ?? ''),
    queryFn: () => casesApi.get(id!),
    enabled: !!id,
    staleTime: 15 * 1000,
    gcTime: 0,
  });
}

export function useCaseSla(enabled = true) {
  return useQuery({
    queryKey: caseKeys.sla,
    queryFn: casesApi.sla,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: 60 * 1000,
  });
}

function useInvalidateCases() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['cases', 'list'] });
    queryClient.invalidateQueries({ queryKey: caseKeys.sla });
    if (id) queryClient.invalidateQueries({ queryKey: caseKeys.detail(id) });
  };
}

export function useOpenCase() {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (body: OpenCaseInput) => casesApi.open(body),
    onSuccess: () => invalidate(),
  });
}

export function useAddCaseNote(id: string) {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (note: string) => casesApi.addNote(id, note),
    onSuccess: () => invalidate(id),
  });
}

export function useTransitionCase(id: string) {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (status: Exclude<CaseStatus, 'OPEN'>) => casesApi.transition(id, status),
    onSuccess: () => invalidate(id),
  });
}

export function useAssignCase(id: string) {
  const invalidate = useInvalidateCases();
  return useMutation({
    mutationFn: (ownerId: string) => casesApi.assign(id, ownerId),
    onSuccess: () => invalidate(id),
  });
}

/** Current time, re-read every `intervalMs` so SLA countdowns stay honest without a refetch. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
