'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateEnrolmentInput, enrolmentsApi, UpdateEnrolmentStatusInput } from '@/lib/api/modules/enrolments';
import { admissionsGuardianApi, TeacherChangeRequestInput } from '@/lib/api/modules/admissions-guardian';
import { qualityRatingApi } from '@/lib/api/modules/quality-rating';

export const enrolmentKeys = {
  all: ['parent', 'enrolments'] as const,
  forStudent: (studentId: string) => ['parent', 'enrolments', studentId] as const,
  nextLesson: (enrolmentId: string) => ['parent', 'next-lesson', enrolmentId] as const,
  catalogue: ['parent', 'catalogue'] as const,
  teacherRating: (teacherId: string) => ['parent', 'teacher-rating', teacherId] as const,
  teacherChanges: ['parent', 'teacher-changes'] as const,
};

/** The family's own teacher-change requests (backend M15). */
export function useMyTeacherChanges() {
  return useQuery({ queryKey: enrolmentKeys.teacherChanges, queryFn: admissionsGuardianApi.myTeacherChanges, staleTime: 30 * 1000 });
}

export function useCancelTeacherChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => admissionsGuardianApi.cancelTeacherChange(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: enrolmentKeys.teacherChanges }),
  });
}

export function useStudentEnrolments(studentId: string | null | undefined) {
  return useQuery({
    queryKey: enrolmentKeys.forStudent(studentId ?? ''),
    // The list endpoint is unscoped, so always pass the child's id and filter again
    // client-side so nothing outside this family is ever rendered.
    queryFn: async () => {
      const rows = await enrolmentsApi.list({ studentId: studentId as string });
      return rows.filter((r) => r.student.id === studentId);
    },
    enabled: Boolean(studentId),
  });
}

export function useNextLesson(enrolmentId: string | null | undefined) {
  return useQuery({
    queryKey: enrolmentKeys.nextLesson(enrolmentId ?? ''),
    queryFn: () => enrolmentsApi.nextLesson(enrolmentId as string),
    enabled: Boolean(enrolmentId),
    staleTime: 60_000,
  });
}

export function useNextLessons(enrolmentIds: string[]) {
  return useQueries({
    queries: enrolmentIds.map((id) => ({
      queryKey: enrolmentKeys.nextLesson(id),
      queryFn: () => enrolmentsApi.nextLesson(id),
      staleTime: 60_000,
    })),
  });
}

export function useCourseCatalogue() {
  return useQuery({ queryKey: enrolmentKeys.catalogue, queryFn: enrolmentsApi.catalogue, staleTime: 5 * 60_000 });
}

export function useUpdateEnrolmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEnrolmentStatusInput & { enrolmentId: string }) =>
      enrolmentsApi.updateStatus(input.enrolmentId, input),
    // Pausing/cancelling also cancels future classes, so refresh timetables and dashboards.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parent'] }),
  });
}

export function useCreateEnrolment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnrolmentInput) => enrolmentsApi.create(input),
    onSuccess: (_data, input) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: enrolmentKeys.forStudent(input.studentId) }),
        qc.invalidateQueries({ queryKey: ['parent', 'dashboard', input.studentId] }),
      ]),
  });
}

export function useRequestTeacherChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TeacherChangeRequestInput) => admissionsGuardianApi.requestTeacherChange(input),
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: enrolmentKeys.forStudent(input.studentId) });
      void qc.invalidateQueries({ queryKey: enrolmentKeys.teacherChanges });
    },
  });
}

export function useTeacherRating(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: enrolmentKeys.teacherRating(teacherId ?? ''),
    queryFn: () => qualityRatingApi.teacherRating(teacherId as string),
    enabled: Boolean(teacherId),
    staleTime: 5 * 60_000,
  });
}
