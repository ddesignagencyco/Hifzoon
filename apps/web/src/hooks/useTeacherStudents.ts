'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { teacherEnrolmentsApi } from '@/lib/api/modules/enrolments-teacher';
import { teacherApi } from '@/lib/api/modules/teacher';
import { teacherKeys } from '@/hooks/useTeacher';

/** Profile, family and class consents for one of the teacher's own students (M47). */
export function useTeacherStudentProfile(studentId: string | undefined) {
  return useQuery({
    queryKey: ['teacher', 'student-profile', studentId ?? ''],
    queryFn: () => teacherApi.student(studentId as string),
    enabled: Boolean(studentId),
  });
}

export function useTeacherNextLesson(enrolmentId: string | undefined) {
  return useQuery({
    queryKey: teacherKeys.nextLesson(enrolmentId ?? ''),
    queryFn: () => teacherEnrolmentsApi.nextLesson(enrolmentId as string),
    enabled: Boolean(enrolmentId),
  });
}

export function useSetTeacherLessonPosition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrolmentId, position }: { enrolmentId: string; position: number }) =>
      teacherEnrolmentsApi.setLessonPosition(enrolmentId, position),
    onSuccess: (_data, vars) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: teacherKeys.nextLesson(vars.enrolmentId) }),
        queryClient.invalidateQueries({ queryKey: teacherKeys.enrolmentsRoot }),
        queryClient.invalidateQueries({ queryKey: teacherKeys.briefRoot }),
      ]),
  });
}

export function useTeacherStudentLessonCards(studentId: string | undefined) {
  return useQuery({
    queryKey: teacherKeys.lessonCards(studentId ?? ''),
    queryFn: () => teacherEnrolmentsApi.lessonCards(studentId as string),
    enabled: Boolean(studentId),
  });
}

export function useTeacherLessonCard(lessonCardId: string | null | undefined) {
  return useQuery({
    queryKey: teacherKeys.lessonCard(lessonCardId ?? ''),
    queryFn: () => teacherEnrolmentsApi.lessonCard(lessonCardId as string),
    enabled: Boolean(lessonCardId),
  });
}
