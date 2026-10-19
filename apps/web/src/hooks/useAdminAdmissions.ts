'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  admissionsAdminApi,
  BookTrialInput,
  TeacherChangeStatus,
  TrialOutcomeInput,
} from '@/lib/api/modules/admissions-admin';

export const admissionsAdminKeys = {
  all: ['admissions-admin'] as const,
  teacherChangesAll: ['admissions-admin', 'teacher-changes'] as const,
  teacherChanges: (status?: TeacherChangeStatus) => ['admissions-admin', 'teacher-changes', status ?? 'ALL'] as const,
  plans: ['admissions-admin', 'plans'] as const,
};

export function useTeacherChanges(status?: TeacherChangeStatus, enabled = true) {
  return useQuery({
    queryKey: admissionsAdminKeys.teacherChanges(status),
    queryFn: () => admissionsAdminApi.listTeacherChanges(status),
    enabled,
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: admissionsAdminKeys.plans,
    queryFn: admissionsAdminApi.listPlans,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBookTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookTrialInput) => admissionsAdminApi.bookTrial(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduling'] });
    },
  });
}

export function useRecordTrialOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, ...body }: TrialOutcomeInput & { classId: string }) =>
      admissionsAdminApi.recordTrialOutcome(classId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduling'] });
    },
  });
}

export function useResolveTeacherChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, status }: { requestId: string; status: Exclude<TeacherChangeStatus, 'OPEN'> }) =>
      admissionsAdminApi.resolveTeacherChange(requestId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: admissionsAdminKeys.teacherChangesAll }),
  });
}
