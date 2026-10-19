'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { lessonsApi, MarkMistakeInput } from '@/lib/api/modules/lessons';

export const mistakeKeys = {
  all: ['mistakes'] as const,
  forClass: (classId: string) => ['mistakes', 'class', classId] as const,
  forStudent: (studentId: string) => ['mistakes', 'student', studentId] as const,
};

export function useClassMistakes(classId: string, enabled = true) {
  return useQuery({
    queryKey: mistakeKeys.forClass(classId),
    queryFn: () => lessonsApi.classMistakes(classId),
    enabled: enabled && !!classId,
  });
}

/**
 * Mistake history for each student in the class. Used for AI-flag review, because
 * the per-class list does not return `source` / `confirmed` / `dismissedAt`.
 */
export function useStudentsMistakes(studentIds: string[], enabled = true) {
  return useQueries({
    queries: studentIds.map((id) => ({
      queryKey: mistakeKeys.forStudent(id),
      queryFn: () => lessonsApi.studentMistakes(id, { limit: 200 }),
      enabled,
    })),
  });
}

export function useMarkMistake(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MarkMistakeInput) => lessonsApi.markMistake(classId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: mistakeKeys.forClass(classId) });
      queryClient.invalidateQueries({ queryKey: mistakeKeys.forStudent(data.studentId) });
    },
  });
}

function useReviewMutation<T>(fn: (id: string) => Promise<T>, classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mistakeKeys.all });
      queryClient.invalidateQueries({ queryKey: mistakeKeys.forClass(classId) });
    },
  });
}

export function useDismissMistake(classId: string) {
  return useReviewMutation((id: string) => lessonsApi.dismissMistake(id), classId);
}

export function useConfirmMistake(classId: string) {
  return useReviewMutation((id: string) => lessonsApi.confirmMistake(id), classId);
}
