'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HiringStage, RecordStepInput, teacherHiringApi } from '@/lib/api/modules/teacher-hiring';

export const hiringKeys = {
  all: ['hiring'] as const,
  list: (status?: HiringStage) => ['hiring', 'applications', status ?? 'ALL'] as const,
  detail: (id: string) => ['hiring', 'application', id] as const,
};

export function useHiringApplications(status?: HiringStage, enabled = true) {
  return useQuery({
    queryKey: hiringKeys.list(status),
    queryFn: () => teacherHiringApi.listApplications(status),
    enabled,
  });
}

export function useHiringApplication(id: string | undefined) {
  return useQuery({
    queryKey: hiringKeys.detail(id ?? ''),
    queryFn: () => teacherHiringApi.getApplication(id as string),
    enabled: Boolean(id),
  });
}

export function useRecordHiringStep(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordStepInput) => teacherHiringApi.recordStep(applicationId, body),
    // Settled rather than success: the API writes the step row before it refuses an approval.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: hiringKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admin-console', 'readiness'] });
    },
  });
}

export function useRecordSafeguardingTraining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, completedAt }: { profileId: string; completedAt: string }) =>
      teacherHiringApi.recordSafeguardingTraining(profileId, completedAt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiringKeys.all });
      queryClient.invalidateQueries({ queryKey: ['admin-console', 'readiness'] });
    },
  });
}

export function useReviewTeacherProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, approve }: { profileId: string; approve: boolean }) =>
      teacherHiringApi.reviewProfileChange(profileId, approve),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-console', 'readiness'] });
    },
  });
}
