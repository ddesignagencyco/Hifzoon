'use client';

import { useQuery } from '@tanstack/react-query';
import { Course } from '@/lib/types';
import { fetchCourses } from '@/lib/api/client';
import { BASELINE_COURSES } from '@/lib/data/baseline-catalog';

export const COURSE_QUERY_KEY = ['courses'] as const;

export function useCourses() {
  const query = useQuery<Course[], Error>({
    queryKey: COURSE_QUERY_KEY,
    queryFn: fetchCourses,
    staleTime: 5 * 60 * 1000,
  });

  return {
    courses: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useCourse(codeOrId: string) {
  const { courses, isLoading, isError } = useCourses();

  const course = courses.find(
    (c) => c.id.toLowerCase() === codeOrId.toLowerCase() || c.code.toLowerCase() === codeOrId.toLowerCase()
  );

  return {
    course,
    isLoading,
    isError,
  };
}
