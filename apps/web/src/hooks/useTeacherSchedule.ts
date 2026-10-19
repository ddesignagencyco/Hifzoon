'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CancelClassInput,
  RescheduleInput,
  SetAvailabilityInput,
  teacherScheduleApi,
} from '@/lib/api/modules/teacher-schedule';
import { teacherKeys } from '@/hooks/useTeacher';

export function useTeacherTimetable(
  teacherId: string | null | undefined,
  range: { from: string; to: string; tz: string },
) {
  return useQuery({
    queryKey: teacherKeys.timetable(teacherId ?? '', range.from, range.to, range.tz),
    queryFn: () => teacherScheduleApi.timetable(teacherId as string, range),
    enabled: Boolean(teacherId),
    staleTime: 30 * 1000,
  });
}

export function useTeacherAvailability(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: teacherKeys.availability(teacherId ?? ''),
    queryFn: () => teacherScheduleApi.availability(teacherId as string),
    enabled: Boolean(teacherId),
  });
}

export function useSetTeacherAvailability(teacherId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetAvailabilityInput) => teacherScheduleApi.setAvailability(teacherId as string, body),
    onSuccess: (data) => {
      if (!teacherId) return;
      queryClient.setQueryData(teacherKeys.availability(teacherId), data);
      return queryClient.invalidateQueries({ queryKey: teacherKeys.availability(teacherId) });
    },
  });
}

function useInvalidateClass() {
  const queryClient = useQueryClient();
  return (classId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teacherKeys.timetableRoot }),
      queryClient.invalidateQueries({ queryKey: teacherKeys.brief(classId) }),
    ]);
}

export function useCancelTeacherClass() {
  const invalidate = useInvalidateClass();
  return useMutation({
    mutationFn: ({ classId, ...body }: CancelClassInput & { classId: string }) =>
      teacherScheduleApi.cancelClass(classId, body),
    onSuccess: (_data, vars) => invalidate(vars.classId),
  });
}

export function useRescheduleTeacherClass() {
  const invalidate = useInvalidateClass();
  return useMutation({
    mutationFn: ({ classId, ...body }: RescheduleInput & { classId: string }) =>
      teacherScheduleApi.reschedule(classId, body),
    onSuccess: (_data, vars) => invalidate(vars.classId),
  });
}
