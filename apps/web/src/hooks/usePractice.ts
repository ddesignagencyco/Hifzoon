'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssignPracticeInput,
  LogPracticeInput,
  practiceApi,
  PracticeReviewStatus,
  PracticeStatus,
  ReviewPracticeInput,
} from '@/lib/api/modules/practice';

export const practiceKeys = {
  all: ['practice'] as const,
  list: (studentId?: string, status?: PracticeStatus) =>
    ['practice', 'list', studentId ?? 'all', status ?? 'any'] as const,
  sessions: (assignmentId: string) => ['practice', 'sessions', assignmentId] as const,
  session: (sessionId: string) => ['practice', 'session', sessionId] as const,
  toReview: ['practice', 'to-review'] as const,
  reference: (assignmentId: string) => ['practice', 'reference', assignmentId] as const,
  recordingAllowed: (assignmentId: string) =>
    ['practice', 'recording-allowed', assignmentId] as const,
};

/** Whether a guardian allows practice recordings (AI_VOICE consent) for this assignment. */
export function useRecordingAllowed(assignmentId: string, enabled = true) {
  return useQuery({
    queryKey: practiceKeys.recordingAllowed(assignmentId),
    queryFn: () => practiceApi.recordingAllowed(assignmentId),
    enabled,
    retry: false,
  });
}

export function usePracticeAssignments(
  filter: { studentId?: string; status?: PracticeStatus } = {},
  enabled = true,
) {
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

/** The ayah audio URLs do not change, so they are fetched once per assignment. */
export function useReferenceAudio(assignmentId: string, enabled = true) {
  return useQuery({
    queryKey: practiceKeys.reference(assignmentId),
    queryFn: () => practiceApi.referenceAudio(assignmentId),
    enabled,
    staleTime: Infinity,
  });
}

/** Teacher: sessions waiting for a reply (also the nav badge, so one shared request). */
export function usePracticeToReview(enabled = true, status: PracticeReviewStatus = 'waiting') {
  return useQuery({
    queryKey: [...practiceKeys.toReview, status],
    queryFn: () => practiceApi.toReview(status),
    enabled,
    staleTime: 60_000,
  });
}

export function usePracticeSession(sessionId: string | null) {
  return useQuery({
    queryKey: practiceKeys.session(sessionId ?? ''),
    queryFn: () => practiceApi.session(sessionId as string),
    enabled: Boolean(sessionId),
  });
}

export function useReviewPracticeSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewPracticeInput) => practiceApi.review(sessionId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: practiceKeys.all }),
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
