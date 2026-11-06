'use client';

import { useQuery } from '@tanstack/react-query';
import { coursesAdminApi } from '@/lib/api/modules/courses-admin';

/**
 * A course's levels and lesson titles from the public `GET /courses/:id`. Anyone signed in
 * (teacher, family, student) can read it, so screens show lesson titles instead of numbers.
 * The key sits under `['courses']`, which every curriculum edit invalidates.
 */
export function useCourseOutline(courseId: string | null | undefined) {
  return useQuery({
    queryKey: ['courses', 'outline', courseId ?? ''],
    queryFn: () => coursesAdminApi.get(courseId as string),
    enabled: Boolean(courseId),
    staleTime: 5 * 60 * 1000,
  });
}
