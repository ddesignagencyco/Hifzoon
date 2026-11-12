'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dataRequestsAdminApi } from '@/lib/api/modules/data-requests-admin';

export const dataRequestAdminKeys = {
  all: ['admin', 'data-requests'] as const,
  list: (openOnly: boolean, q = '') =>
    ['admin', 'data-requests', openOnly ? 'open' : 'all', q] as const,
};

export function useAdminDataRequests(filter: { openOnly?: boolean; q?: string } = {}) {
  const q = filter.q?.trim() ?? '';
  return useQuery({
    queryKey: dataRequestAdminKeys.list(Boolean(filter.openOnly), q),
    queryFn: () => dataRequestsAdminApi.list({ ...filter, q }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useRejectDataRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      dataRequestsAdminApi.reject(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: dataRequestAdminKeys.all }),
  });
}
