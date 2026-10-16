'use client';

import { useQuery } from '@tanstack/react-query';
import { TeacherProfile } from '@/lib/types';
import { fetchTeachers } from '@/lib/api/client';
import { VERIFIED_FACULTY_PROFILES } from '@/lib/data/baseline-catalog';

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
