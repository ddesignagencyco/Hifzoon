'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AssessmentType, assessmentsApi } from '@/lib/api/modules/assessments';

export const assessmentKeys = {
  forEnrolment: (enrolmentId: string) => ['assessments', enrolmentId] as const,
};

export function useEnrolmentAssessments(enrolmentId: string | undefined) {
  return useQuery({
    queryKey: assessmentKeys.forEnrolment(enrolmentId ?? ''),
    queryFn: () => assessmentsApi.list(enrolmentId as string),
    enabled: Boolean(enrolmentId),
  });
}

export function useRecordAssessment(enrolmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      rubricScores: Record<string, number>;
      notes?: string;
      type?: AssessmentType;
    }) => assessmentsApi.create(enrolmentId, body),
    // A pass moves the level and the lesson pointer, so every enrolment view refreshes.
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: assessmentKeys.forEnrolment(enrolmentId) }),
        qc.invalidateQueries({ queryKey: ['teacher', 'enrolments'] }),
        qc.invalidateQueries({ queryKey: ['teacher', 'next-lesson', enrolmentId] }),
      ]),
  });
}
