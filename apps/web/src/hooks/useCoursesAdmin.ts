'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  coursesAdminApi,
  CreateCourseInput,
  CreateEnrolmentInput,
  CreateLessonInput,
  CreateLevelInput,
  EnrolmentFilters,
  MoveDirection,
  PagedEnrolmentFilters,
  UpdateEnrolmentStatusInput,
  UpdateLessonInput,
} from '@/lib/api/modules/courses-admin';

export const coursesAdminKeys = {
  all: ['courses-admin'] as const,
  list: (locale: string) => ['courses-admin', 'list', locale] as const,
  detail: (courseId: string) => ['courses-admin', 'detail', courseId] as const,
  curriculum: (courseId: string) => ['courses-admin', 'curriculum', courseId] as const,
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
      qc.invalidateQueries({ queryKey: coursesAdminKeys.curriculum(courseId) });
      qc.invalidateQueries({ queryKey: ['courses'] });
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
      qc.invalidateQueries({ queryKey: coursesAdminKeys.curriculum(courseId) });
      qc.invalidateQueries({ queryKey: ['courses'] });
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
    mutationFn: ({ enrolmentId, position, levelId }: { enrolmentId: string; position: number; levelId?: string }) =>
      coursesAdminApi.setLessonPosition(enrolmentId, position, levelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: coursesAdminKeys.enrolmentsAll });
      qc.invalidateQueries({ queryKey: ['courses-admin', 'enrolments-page'] });
      qc.invalidateQueries({ queryKey: ['courses-admin', 'curriculum'] });
    },
  });
}

/** The admin course builder's view: lessons with teacher notes and enrolment counts. */
export function useAdminCurriculum(courseId: string | undefined) {
  return useQuery({
    queryKey: coursesAdminKeys.curriculum(courseId ?? ''),
    queryFn: () => coursesAdminApi.curriculum(courseId as string),
    enabled: Boolean(courseId),
  });
}

/** After any curriculum edit: the builder, the catalogue and every lesson-title reader refetch. */
function invalidateCurriculum(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: coursesAdminKeys.all });
  qc.invalidateQueries({ queryKey: ['courses'] });
}

export function useUpdateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ levelId, body }: { levelId: string; body: { name?: string; passMark?: number } }) =>
      coursesAdminApi.updateLevel(levelId, body),
    onSuccess: () => invalidateCurriculum(qc),
  });
}

export function useMoveLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ levelId, direction }: { levelId: string; direction: MoveDirection }) =>
      coursesAdminApi.moveLevel(levelId, direction),
    onSuccess: () => invalidateCurriculum(qc),
  });
}

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, body }: { lessonId: string; body: UpdateLessonInput }) =>
      coursesAdminApi.updateLesson(lessonId, body),
    onSuccess: () => invalidateCurriculum(qc),
  });
}

export function useMoveLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, direction }: { lessonId: string; direction: MoveDirection }) =>
      coursesAdminApi.moveLesson(lessonId, direction),
    onSuccess: () => invalidateCurriculum(qc),
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => coursesAdminApi.deleteLesson(lessonId),
    onSuccess: () => invalidateCurriculum(qc),
  });
}
