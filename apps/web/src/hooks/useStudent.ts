'use client';

import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/lib/api/modules/student';
import { enrolmentsApi } from '@/lib/api/modules/enrolments';

export const studentKeys = {
  me: ['student', 'me'] as const,
  inbox: (limit: number) => ['student', 'notifications', limit] as const,
};

export function useStudentProfile() {
  return useQuery({ queryKey: studentKeys.me, queryFn: studentApi.me, staleTime: 5 * 60 * 1000 });
}

export function useStudentInbox(limit = 50) {
  return useQuery({
    queryKey: studentKeys.inbox(limit),
    queryFn: () => studentApi.notifications({ page: 1, limit }),
    staleTime: 30 * 1000,
  });
}

/** The signed-in student's own enrolments — the API scopes the list to them (backend M7). */
export function useMyEnrolments() {
  return useQuery({ queryKey: ['student', 'enrolments'], queryFn: () => enrolmentsApi.list(), staleTime: 60 * 1000 });
}
