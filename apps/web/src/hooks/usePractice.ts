'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssignPracticeInput,
  LogPracticeInput,
  practiceApi,
  PracticeStatus,
} from '@/lib/api/modules/practice';

export const practiceKeys = {
  all: ['practice'] as const,
  list: (studentId?: string, status?: PracticeStatus) => ['practice', 'list', studentId ?? 'all', status ?? 'any'] as const,
  sessions: (assignmentId: string) => ['practice', 'sessions', assignmentId] as const,
};

export function usePracticeAssignments(filter: { studentId?: string; status?: PracticeStatus } = {}, enabled = true) {
  return useQuery({
    queryKey: practiceKeys.list(filter.studentId, filter.status),
    queryFn: () => practiceApi.list(filter),
    enabled,
  });
}

export function usePracticeSessions(assignmentId: string | null) {
  return useQuery({
    queryKey: practiceKeys.sessions(assignmentId ?? ''),
    queryFn: () => practiceApi.sessions(assignmentId as string),
    enabled: Boolean(assignmentId),
  });
}

export function useAssignPractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignPracticeInput) => practiceApi.assign(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: practiceKeys.all }),
  });
}

export function useLogPractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LogPracticeInput) => practiceApi.log(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: practiceKeys.all }),
  });
}
