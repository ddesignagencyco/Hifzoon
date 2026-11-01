'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  coursesAdminApi,
  CreateCourseInput,
  CreateEnrolmentInput,
  CreateLessonInput,
  CreateLevelInput,
  EnrolmentFilters,
  PagedEnrolmentFilters,
  UpdateEnrolmentStatusInput,
} from '@/lib/api/modules/courses-admin';

export const coursesAdminKeys = {
  all: ['courses-admin'] as const,
  list: (locale: string) => ['courses-admin', 'list', locale] as const,
  detail: (courseId: string) => ['courses-admin', 'detail', courseId] as const,
  enrolmentsAll: ['courses-admin', 'enrolments'] as const,
  enrolments: (filters: EnrolmentFilters) => ['courses-admin', 'enrolments', filters] as const,
  enrolmentsPage: (filters: PagedEnrolmentFilters) => ['courses-admin', 'enrolments-page', filters] as const,
};

export function useAdminCourses(locale = 'en') {
  return useQuery({
    queryKey: coursesAdminKeys.list(locale),
    queryFn: () => coursesAdminApi.list(locale),
    staleTime: 60 * 1000,
  });
}

export function useAdminCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: coursesAdminKeys.detail(courseId ?? ''),
    queryFn: () => coursesAdminApi.get(courseId as string),
    enabled: Boolean(courseId),
  });
}

export function useAdminEnrolments(filters: EnrolmentFilters) {
  return useQuery({
    queryKey: coursesAdminKeys.enrolments(filters),
    queryFn: () => coursesAdminApi.listEnrolments(filters),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

/** Server-paginated enrolments for the admin table (the array hook stays for pickers/counts). */
export function useAdminEnrolmentsPage(filters: PagedEnrolmentFilters) {
  return useQuery({
    queryKey: coursesAdminKeys.enrolmentsPage(filters),
    queryFn: () => coursesAdminApi.listEnrolmentsPage(filters),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCourseInput) => coursesAdminApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursesAdminKeys.all });
      // The public catalogue hook reads the same endpoint.
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });
}

export function useCreateLevel(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLevelInput) => coursesAdminApi.createLevel(courseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursesAdminKeys.detail(courseId) });
      qc.invalidateQueries({ queryKey: ['courses-admin', 'list'] });
    },
  });
}

export function useCreateLesson(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ levelId, body }: { levelId: string; body: CreateLessonInput }) =>
      coursesAdminApi.createLesson(levelId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursesAdminKeys.detail(courseId) });
      qc.invalidateQueries({ queryKey: ['courses-admin', 'list'] });
    },
  });
}

export function useCreateEnrolment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEnrolmentInput) => coursesAdminApi.createEnrolment(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: coursesAdminKeys.enrolmentsAll }),
  });
}

export function useUpdateEnrolmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrolmentId, body }: { enrolmentId: string; body: UpdateEnrolmentStatusInput }) =>
      coursesAdminApi.updateEnrolmentStatus(enrolmentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: coursesAdminKeys.enrolmentsAll }),
  });
}

export function useSetLessonPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrolmentId, position }: { enrolmentId: string; position: number }) =>
      coursesAdminApi.setLessonPosition(enrolmentId, position),
    onSuccess: () => qc.invalidateQueries({ queryKey: coursesAdminKeys.enrolmentsAll }),
  });
}
