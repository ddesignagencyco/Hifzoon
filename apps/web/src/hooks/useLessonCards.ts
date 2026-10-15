'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lessonsApi, SubmitLessonCardInput, UpdateLessonCardInput } from '@/lib/api/modules/lessons';
import { mistakeKeys } from './useClassroomMistakes';

export const lessonCardKeys = {
  all: ['lesson-cards'] as const,
  prefill: (classId: string) => ['lesson-cards', 'prefill', classId] as const,
  detail: (id: string) => ['lesson-cards', 'detail', id] as const,
  editLog: (id: string) => ['lesson-cards', 'edit-log', id] as const,
};

export function useLessonCardPrefill(classId: string) {
  return useQuery({
    queryKey: lessonCardKeys.prefill(classId),
    queryFn: () => lessonsApi.prefill(classId),
    enabled: !!classId,
    // 409 (already submitted) / 403 are answers, not transient failures.
    retry: false,
    staleTime: 0,
  });
}

export function useSubmitLessonCard(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitLessonCardInput) => lessonsApi.submit(classId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lessonCardKeys.prefill(classId) });
      queryClient.invalidateQueries({ queryKey: mistakeKeys.all });
    },
  });
}

export function useLessonCard(lessonCardId: string) {
  return useQuery({
    queryKey: lessonCardKeys.detail(lessonCardId),
    queryFn: () => lessonsApi.get(lessonCardId),
    enabled: !!lessonCardId,
  });
}

export function useLessonCardEditLog(lessonCardId: string, enabled = true) {
  return useQuery({
    queryKey: lessonCardKeys.editLog(lessonCardId),
    queryFn: () => lessonsApi.editLog(lessonCardId),
    enabled: enabled && !!lessonCardId,
  });
}

export function useUpdateLessonCard(lessonCardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLessonCardInput) => lessonsApi.update(lessonCardId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: lessonCardKeys.detail(lessonCardId) });
      queryClient.invalidateQueries({ queryKey: lessonCardKeys.editLog(lessonCardId) });
    },
  });
}

export function useSaveAiDraft(lessonCardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: string) => lessonsApi.saveAiDraft(lessonCardId, draft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonCardKeys.detail(lessonCardId) }),
  });
}

export function useApproveAiDraft(lessonCardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => lessonsApi.approveAiDraft(lessonCardId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonCardKeys.detail(lessonCardId) }),
  });
}
