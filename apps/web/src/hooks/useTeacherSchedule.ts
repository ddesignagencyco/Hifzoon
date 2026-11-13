'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CancelClassInput,
  RescheduleInput,
  SetAvailabilityInput,
  teacherScheduleApi,
} from '@/lib/api/modules/teacher-schedule';
import { teacherKeys } from '@/hooks/useTeacher';
import {
  monthlyAvailabilityApi,
  MonthlyAvailabilitySlotInput,
  MonthlyLeaveDayInput,
} from '@/lib/api/modules/backend-updates-oct2026';

export const trialsAwaitingResultKey = ['teacher', 'trials-awaiting-result'] as const;

/** Teacher: trial classes that have ended and still need their result recorded. */
export function useTrialsAwaitingResult() {
  return useQuery({
    queryKey: trialsAwaitingResultKey,
    queryFn: teacherScheduleApi.trialsAwaitingResult,
    staleTime: 60_000,
  });
}

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
    mutationFn: (body: SetAvailabilityInput) =>
      teacherScheduleApi.setAvailability(teacherId as string, body),
    onSuccess: (data) => {
      if (!teacherId) return;
      queryClient.setQueryData(teacherKeys.availability(teacherId), data);
      // Availability drives the teacher's own timetable and the parent-facing open-slot search.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: teacherKeys.availability(teacherId) }),
        queryClient.invalidateQueries({ queryKey: teacherKeys.timetableRoot }),
        queryClient.invalidateQueries({ queryKey: ['parent', 'schedule', 'open-slots'] }),
      ]);
    },
  });
}

const monthKey = (teacherId: string, month: string) =>
  ['teacher', 'availability-month', teacherId, month] as const;

/** Hours and leave for one calendar month (`YYYY-MM`). */
export function useMonthlyAvailability(teacherId: string | null | undefined, month: string) {
  return useQuery({
    queryKey: monthKey(teacherId ?? '', month),
    queryFn: () => monthlyAvailabilityApi.getMonth(teacherId as string, month),
    enabled: Boolean(teacherId),
  });
}

export function useSetMonthlyAvailability(
  teacherId: string | null | undefined,
  month: string,
  timeZone?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slots: MonthlyAvailabilitySlotInput[]) =>
      monthlyAvailabilityApi.setMonth(teacherId as string, month, slots, timeZone),
    onSuccess: (data) => {
      queryClient.setQueryData(monthKey(teacherId ?? '', month), data);
      // Monthly hours drive the teacher's timetable and the parent-facing open-slot search.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: teacherKeys.timetableRoot }),
        queryClient.invalidateQueries({ queryKey: ['parent', 'schedule', 'open-slots'] }),
      ]);
    },
  });
}

export function useSetMonthlyLeave(teacherId: string | null | undefined, month: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (days: MonthlyLeaveDayInput[]) =>
      monthlyAvailabilityApi.setLeaveMonth(teacherId as string, month, days),
    onSuccess: (data) => {
      queryClient.setQueryData(monthKey(teacherId ?? '', month), data);
      // Leave days close bookable slots, so the timetable and open-slot search change too.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: teacherKeys.timetableRoot }),
        queryClient.invalidateQueries({ queryKey: ['parent', 'schedule', 'open-slots'] }),
      ]);
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
