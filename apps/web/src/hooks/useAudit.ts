'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { auditApi, AuditFilters } from '@/lib/api/modules/audit';

export const auditKeys = {
  all: ['audit'] as const,
  list: (filters: AuditFilters) => ['audit', 'list', filters] as const,
};

export function useAuditLog(filters: AuditFilters, enabled = true) {
  return useQuery({
    queryKey: auditKeys.list(filters),
    queryFn: () => auditApi.list(filters),
    enabled,
    placeholderData: keepPreviousData,
  });
}
