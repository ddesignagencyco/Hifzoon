'use client';

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { qaApi, qaInsightsApi, RubricInput, SubmitReviewInput } from '@/lib/api/modules/qa';

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
  return useQuery({
    queryKey: qaKeys.teachers,
    queryFn: () => qaApi.teachers(),
    staleTime: 5 * 60 * 1000,
  });
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
    mutationFn: ({ classId, body }: { classId: string; body: SubmitReviewInput }) =>
      qaApi.submitReview(classId, body),
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

// ── Nov 2026: queue, past reviews, rubrics, metrics, caseloads ───────────────

export function useReviewQueue(q: { period?: string; teacherId?: string; page: number; limit: number }) {
  return useQuery({ queryKey: ['qa', 'queue', q], queryFn: () => qaInsightsApi.queue(q), placeholderData: keepPreviousData });
}

export function usePastReviews(q: { teacherId?: string; replied?: string; page: number; limit: number }) {
  return useQuery({ queryKey: ['qa', 'reviews', q], queryFn: () => qaInsightsApi.reviews(q), placeholderData: keepPreviousData });
}

export function useReviewDetail(id: string | null) {
  return useQuery({ queryKey: ['qa', 'review', id], queryFn: () => qaInsightsApi.review(id as string), enabled: Boolean(id) });
}

export function useRubrics() {
  return useQuery({ queryKey: ['qa', 'rubrics'], queryFn: qaInsightsApi.rubrics, staleTime: 60_000 });
}

/** Rubric changes also change what the review form draws, so every rubric view refreshes. */
export function useSaveRubric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { kind: 'create'; body: RubricInput } | { kind: 'update'; id: string; body: Partial<RubricInput> } | { kind: 'activate'; id: string }): Promise<unknown> =>
      i.kind === 'create' ? qaInsightsApi.createRubric(i.body) : i.kind === 'update' ? qaInsightsApi.updateRubric(i.id, i.body) : qaInsightsApi.activateRubric(i.id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['qa', 'rubrics'] }),
  });
}

export function useTeacherMetrics(teacherId: string | undefined, months = 3) {
  return useQuery({ queryKey: ['qa', 'metrics', teacherId, months], queryFn: () => qaInsightsApi.metrics(teacherId as string, months), enabled: Boolean(teacherId) });
}

export function useMyCaseload() {
  return useQuery({ queryKey: ['supervision', 'mine'], queryFn: qaInsightsApi.myCaseload });
}

export function useCaseload(supervisorId: string, enabled = true) {
  return useQuery({ queryKey: ['supervision', 'caseload', supervisorId], queryFn: () => qaInsightsApi.caseload(supervisorId), enabled });
}

export function useSetCaseload(supervisorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (i: { kind: 'assign' | 'unassign'; teacherId: string }) =>
      i.kind === 'assign' ? qaInsightsApi.assign(supervisorId, i.teacherId) : qaInsightsApi.unassign(supervisorId, i.teacherId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervision'] });
      // A supervisor's visible teachers, queue and scorecards all follow the caseload.
      qc.invalidateQueries({ queryKey: ['qa'] });
    },
  });
}
