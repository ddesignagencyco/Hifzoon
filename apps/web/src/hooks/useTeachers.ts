'use client';

import { useQuery } from '@tanstack/react-query';
import { TeacherProfile } from '@/lib/types';
import { fetchTeachers } from '@/lib/api/client';
import { teacherApi } from '@/lib/api/modules/teacher';
import { qualityRatingApi } from '@/lib/api/modules/quality-rating';

export const TEACHERS_QUERY_KEY = ['teachers'] as const;

export function useTeachers(genderFilter: 'ALL' | 'MALE' | 'FEMALE' = 'ALL') {
  const query = useQuery<TeacherProfile[], Error>({
    queryKey: TEACHERS_QUERY_KEY,
    queryFn: fetchTeachers,
    staleTime: 5 * 60 * 1000,
  });

  const allFaculty = query.data ?? [];

  const filteredFaculty = allFaculty.filter((teacher) => {
    if (genderFilter === 'ALL') return true;
    return teacher.gender === genderFilter;
  });

  return {
    teachers: filteredFaculty,
    allTeachers: allFaculty,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Public teacher profile by **user** id (`GET /teachers/public/:userId`); 404 unless approved and bookable. */
export function usePublicTeacher(userId: string | undefined) {
  return useQuery({
    queryKey: ['teachers', 'public', userId ?? ''],
    queryFn: () => teacherApi.publicProfile(userId as string),
    enabled: Boolean(userId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Live family rating (`GET /quality/teachers/:teacherId/rating`, public) by **profile** id.
 * Used instead of `publicRatingAvg`, which is only ever written by the seed.
 */
export function usePublicTeacherRating(teacherId: string | undefined) {
  return useQuery({
    queryKey: ['teachers', 'rating', teacherId ?? ''],
    queryFn: () => qualityRatingApi.teacherRating(teacherId as string),
    enabled: Boolean(teacherId),
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
}
