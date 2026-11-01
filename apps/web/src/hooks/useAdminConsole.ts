'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adminConsoleApi,
  ProvisionTeacherInput,
  SearchEntity,
  StaffRole,
  UserStatus,
} from '@/lib/api/modules/admin-console';

export const adminConsoleKeys = {
  all: ['admin-console'] as const,
  overview: ['admin-console', 'overview'] as const,
  searchAll: ['admin-console', 'search'] as const,
  search: (q: string, entity: SearchEntity, limit: number, page: number) =>
    ['admin-console', 'search', entity, q, limit, page] as const,
  readinessAll: ['admin-console', 'readiness'] as const,
  readiness: (teacherId: string) => ['admin-console', 'readiness', teacherId] as const,
};

export function useAdminOverview(enabled = true) {
  return useQuery({
    queryKey: adminConsoleKeys.overview,
    queryFn: adminConsoleApi.overview,
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useAdminSearch<E extends SearchEntity>(
  q: string,
  entity: E,
  limit = 20,
  page = 1,
  enabled = true,
) {
  const term = q.trim();
  return useQuery({
    queryKey: adminConsoleKeys.search(term, entity, limit, page),
    queryFn: () => adminConsoleApi.search({ q: term, entity, limit, page }),
    enabled: enabled && term.length >= 2 && term.length <= 120,
    placeholderData: keepPreviousData,
  });
}

export function useTeacherReadiness(teacherId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: adminConsoleKeys.readiness(teacherId ?? ''),
    queryFn: () => adminConsoleApi.teacherReadiness(teacherId as string),
    enabled: Boolean(teacherId) && enabled,
    retry: false,
  });
}

export function useSetUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: UserStatus }) =>
      adminConsoleApi.setUserStatus(userId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminConsoleKeys.searchAll }),
  });
}

export function useSetUserRoles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: StaffRole[] }) =>
      adminConsoleApi.setUserRoles(userId, roles),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminConsoleKeys.searchAll }),
  });
}

export function useProvisionTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProvisionTeacherInput) => adminConsoleApi.provisionTeacher(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminConsoleKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hiring'] });
    },
  });
}
