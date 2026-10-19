'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { qaApi, SubmitReviewInput } from '@/lib/api/modules/qa';

export const qaKeys = {
  all: ['qa'] as const,
  teachers: ['qa', 'teachers'] as const,
  rating: (teacherId: string) => ['qa', 'rating', teacherId] as const,
  scorecard: (teacherId: string, months: number) => ['qa', 'scorecard', teacherId, months] as const,
  scorecards: (teacherId: string) => ['qa', 'scorecard', teacherId] as const,
  timetable: (teacherId: string, from: string, to: string, tz: string) =>
    ['qa', 'timetable', teacherId, from, to, tz] as const,
};

export function useSupervisedTeachers() {
  return useQuery({ queryKey: qaKeys.teachers, queryFn: () => qaApi.teachers(), staleTime: 5 * 60 * 1000 });
}

export function useTeacherRating(teacherId: string | undefined) {
  return useQuery({
    queryKey: qaKeys.rating(teacherId ?? ''),
    queryFn: () => qaApi.teacherRating(teacherId!),
    enabled: !!teacherId,
    staleTime: 60 * 1000,
  });
}

/** Rating summaries for many teachers in parallel (overview table). */
export function useTeacherRatings(teacherIds: string[]) {
  return useQueries({
    queries: teacherIds.map((id) => ({
      queryKey: qaKeys.rating(id),
      queryFn: () => qaApi.teacherRating(id),
      staleTime: 60 * 1000,
    })),
  });
}

export function useScorecard(teacherId: string | undefined, months = 3, enabled = true) {
  return useQuery({
    queryKey: qaKeys.scorecard(teacherId ?? '', months),
    queryFn: () => qaApi.scorecard(teacherId!, months),
    enabled: !!teacherId && enabled,
    staleTime: 60 * 1000,
  });
}

export function useScorecards(teacherIds: string[], months = 3, enabled = true) {
  return useQueries({
    queries: teacherIds.map((id) => ({
      queryKey: qaKeys.scorecard(id, months),
      queryFn: () => qaApi.scorecard(id, months),
      enabled,
      staleTime: 60 * 1000,
    })),
  });
}

export function useTeacherTimetable(
  teacherId: string | undefined,
  range: { from: string; to: string; tz: string },
) {
  return useQuery({
    queryKey: qaKeys.timetable(teacherId ?? '', range.from, range.to, range.tz),
    queryFn: () => qaApi.teacherTimetable(teacherId!, range),
    enabled: !!teacherId,
    staleTime: 60 * 1000,
  });
}

export function useSubmitReview(teacherId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, body }: { classId: string; body: SubmitReviewInput }) => qaApi.submitReview(classId, body),
    onSuccess: () => {
      if (teacherId) queryClient.invalidateQueries({ queryKey: qaKeys.scorecards(teacherId) });
      else queryClient.invalidateQueries({ queryKey: ['qa', 'scorecard'] });
    },
  });
}

export function useDrawSample() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (teacherId: string) => qaApi.drawSample(teacherId),
    onSuccess: (_data, teacherId) => {
      queryClient.invalidateQueries({ queryKey: qaKeys.scorecards(teacherId) });
    },
  });
}
