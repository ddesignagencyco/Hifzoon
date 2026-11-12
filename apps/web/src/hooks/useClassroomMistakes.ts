'use client';

import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { lessonsApi, MarkMistakeInput } from '@/lib/api/modules/lessons';
import { lessonsReadApi } from '@/lib/api/modules/lessons-read';

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
    // A backstop for a dropped socket: marks still show within a few seconds.
    refetchInterval: 15_000,
  });
}

/**
 * Mistake history for each student in the class. Used for AI-flag review, because
 * the per-class list does not return `source` / `confirmed` / `dismissedAt`.
 */
export function useStudentsMistakes(
  studentIds: string[],
  enabled = true,
  refetchInterval?: number,
) {
  return useQueries({
    queries: studentIds.map((id) => ({
      queryKey: mistakeKeys.forStudent(id),
      queryFn: () => lessonsApi.studentMistakes(id, { limit: 200 }),
      enabled,
      ...(refetchInterval ? { refetchInterval } : {}),
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

/**
 * Every view a fixed (or reopened) mistake shows in: the class lists and each student's
 * history (`mistakeKeys.all`), and the family's Mistakes to practise, history and lesson
 * cards (`['parent', ...]`).
 */
export function invalidateMistakeViews(queryClient: QueryClient, studentId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: mistakeKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['parent', 'mistakes', studentId] }),
    queryClient.invalidateQueries({ queryKey: ['parent', 'lesson-card'] }),
  ]);
}

/**
 * Teacher: "Fixed" (the mistake was read correctly) or, with `reopen`, Undo / it came back.
 * The one resolve call the same class, the practice review and the next class's Recheck
 * share, so all three refresh the same views.
 */
export function useSetMistakeFixed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mistakeId,
      reopen,
    }: {
      mistakeId: string;
      studentId: string;
      reopen?: boolean;
    }) => lessonsReadApi.resolveMistake(mistakeId, reopen),
    onSuccess: (_data, { studentId }) => invalidateMistakeViews(queryClient, studentId),
  });
}

export function useDismissMistake(classId: string) {
  return useReviewMutation((id: string) => lessonsApi.dismissMistake(id), classId);
}

export function useConfirmMistake(classId: string) {
  return useReviewMutation((id: string) => lessonsApi.confirmMistake(id), classId);
}
