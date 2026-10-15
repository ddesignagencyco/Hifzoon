'use client';

import { useMemo } from 'react';
import { useScorecards, useTeacherRatings } from '@/hooks/useQa';
import { SupervisedTeacher } from '@/lib/api/modules/qa';
import type { TeacherQaRow } from './TeacherQaTable';

/** Joins each teacher with their rating summary and scorecard (parallel queries). */
export function useTeacherQaRows(teachers: SupervisedTeacher[] | undefined, months = 3): TeacherQaRow[] {
  const ids = useMemo(() => (teachers ?? []).map((t) => t.id), [teachers]);
  const ratings = useTeacherRatings(ids);
  const scorecards = useScorecards(ids, months);
  return (teachers ?? []).map((teacher, i) => ({
    teacher,
    rating: ratings[i]?.data,
    ratingLoading: !!ratings[i]?.isLoading,
    scorecard: scorecards[i]?.data,
    scorecardLoading: !!scorecards[i]?.isLoading,
    scorecardError: !!scorecards[i]?.isError,
  }));
}
