'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HiringStage, RecordStepInput, teacherHiringApi } from '@/lib/api/modules/teacher-hiring';

export const hiringKeys = {
  all: ['hiring'] as const,
  list: (status?: HiringStage) => ['hiring', 'applications', status ?? 'ALL'] as const,
  detail: (id: string) => ['hiring', 'application', id] as const,
  profileChanges: ['hiring', 'profile-changes'] as const,
};

export function usePendingProfileChanges(enabled = true) {
  return useQuery({ queryKey: hiringKeys.profileChanges, queryFn: teacherHiringApi.listProfileChanges, enabled });
}

export function useHiringApplications(status?: HiringStage, enabled = true) {
  return useQuery({
    queryKey: hiringKeys.list(status),
    queryFn: () => teacherHiringApi.listApplications(status),
    enabled,
  });
}

export function useHiringApplication(id: string | undefined, options: { refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: hiringKeys.detail(id ?? ''),
    queryFn: () => teacherHiringApi.getApplication(id as string),
    enabled: Boolean(id),
    refetchInterval: options.refetchInterval ?? false,
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

/**
 * One mutation for every piece of hiring evidence (demo, document, reference, training):
 * each refreshes the application so the step form sees what is now on record.
 */
export function useHiringEvidence<TArgs>(applicationId: string, fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: hiringKeys.detail(applicationId) }),
  });
}

export function useReviewTeacherProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, approve, reason }: { profileId: string; approve: boolean; reason?: string }) =>
      teacherHiringApi.reviewProfileChange(profileId, approve, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hiringKeys.profileChanges });
      queryClient.invalidateQueries({ queryKey: ['teachers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-console', 'readiness'] });
    },
  });
}
