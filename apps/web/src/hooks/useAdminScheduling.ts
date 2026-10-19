'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateScheduleInput, OpenSlotQuery, recentTrialClasses, schedulingAdminApi } from '@/lib/api/modules/scheduling-admin';

export const adminSchedulingKeys = {
  all: ['admin-scheduling'] as const,
  schedule: (id: string) => ['admin-scheduling', 'schedule', id] as const,
  matching: (studentId: string, courseId: string) => ['admin-scheduling', 'matching', studentId, courseId] as const,
  openSlots: (query: OpenSlotQuery | null) => ['admin-scheduling', 'open-slots', query] as const,
  timetable: (teacherId: string, from: string, to: string, tz: string) =>
    ['admin-scheduling', 'timetable', teacherId, from, to, tz] as const,
  availability: (teacherId: string) => ['admin-scheduling', 'availability', teacherId] as const,
  enrolments: (studentId?: string, status?: string) =>
    ['admin-scheduling', 'enrolments', studentId ?? '', status ?? ''] as const,
  courses: ['admin-scheduling', 'courses'] as const,
};

export function useAdminSchedule(scheduleId: string | null | undefined) {
  return useQuery({
    queryKey: adminSchedulingKeys.schedule(scheduleId ?? ''),
    queryFn: () => schedulingAdminApi.getSchedule(scheduleId as string),
    enabled: Boolean(scheduleId),
    retry: false,
  });
}

export function useAdminMatching(studentId: string | null | undefined, courseId: string | null | undefined) {
  return useQuery({
    queryKey: adminSchedulingKeys.matching(studentId ?? '', courseId ?? ''),
    queryFn: () => schedulingAdminApi.matching(studentId as string, courseId as string),
    enabled: Boolean(studentId && courseId),
  });
}

export function useAdminOpenSlots(query: OpenSlotQuery | null) {
  return useQuery({
    queryKey: adminSchedulingKeys.openSlots(query),
    queryFn: () => schedulingAdminApi.openSlots(query as OpenSlotQuery),
    enabled: Boolean(query),
  });
}

export function useAdminTeacherTimetable(teacherId: string | null | undefined, from: string, to: string, tz: string) {
  return useQuery({
    queryKey: adminSchedulingKeys.timetable(teacherId ?? '', from, to, tz),
    queryFn: () => schedulingAdminApi.teacherTimetable(teacherId as string, { from, to, tz }),
    enabled: Boolean(teacherId),
  });
}

/**
 * Trial classes from every listed teacher's timetable in `[from, now)` — one request per
 * teacher, so callers pass the cleared teachers they already know about.
 */
export function useRecentTrialClasses(
  teachers: ReadonlyArray<{ id: string; name: string }>,
  range: { from: string; to: string; tz: string; now: number },
  enabled = true,
) {
  return useQueries({
    queries: teachers.map((t) => ({
      queryKey: adminSchedulingKeys.timetable(t.id, range.from, range.to, range.tz),
      queryFn: () => schedulingAdminApi.teacherTimetable(t.id, { from: range.from, to: range.to, tz: range.tz }),
      enabled,
      retry: false,
    })),
    combine: (results) => ({
      data: recentTrialClasses(
        teachers.map((t, i) => ({ teacherId: t.id, teacherName: t.name, entries: results[i]?.data })),
        range.now,
      ),
      isLoading: results.some((r) => r.isLoading),
      failed: results.filter((r) => r.isError).length,
    }),
  });
}

export function useAdminTeacherAvailability(teacherId: string | null | undefined) {
  return useQuery({
    queryKey: adminSchedulingKeys.availability(teacherId ?? ''),
    queryFn: () => schedulingAdminApi.availability(teacherId as string),
    enabled: Boolean(teacherId),
    retry: false,
  });
}

export function useAdminEnrolments(params: { studentId?: string; status?: string } = {}, enabled = true) {
  return useQuery({
    queryKey: adminSchedulingKeys.enrolments(params.studentId, params.status),
    queryFn: () => schedulingAdminApi.listEnrolments(params),
    enabled,
  });
}

export function useAdminCourses() {
  return useQuery({
    queryKey: adminSchedulingKeys.courses,
    queryFn: schedulingAdminApi.listCourses,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScheduleInput) => schedulingAdminApi.createSchedule(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminSchedulingKeys.all }),
  });
}
