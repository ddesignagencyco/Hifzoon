'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookClassInput, familySchedulingApi, OpenSlotQuery } from '@/lib/api/modules/scheduling-family';
import { qualityRatingApi, RateClassInput } from '@/lib/api/modules/quality-rating';

export const scheduleKeys = {
  all: ['parent', 'schedule'] as const,
  timetable: (familyId: string, from: string, to: string, tz: string) =>
    ['parent', 'schedule', 'timetable', familyId, from, to, tz] as const,
  openSlots: (query: OpenSlotQuery) => ['parent', 'schedule', 'open-slots', query] as const,
};

export function useFamilyTimetable(familyId: string | null | undefined, params: { from: string; to: string; tz: string }) {
  return useQuery({
    queryKey: scheduleKeys.timetable(familyId ?? '', params.from, params.to, params.tz),
    queryFn: () => familySchedulingApi.timetable(familyId as string, params),
    enabled: Boolean(familyId),
    staleTime: 30_000,
  });
}

export function useOpenSlots(query: OpenSlotQuery | null) {
  return useQuery({
    queryKey: scheduleKeys.openSlots(query ?? { from: '', to: '', visitorZone: '' }),
    queryFn: () => familySchedulingApi.openSlots(query as OpenSlotQuery),
    enabled: Boolean(query),
    staleTime: 30_000,
  });
}

/** Any change to a class affects timetables, dashboards (upcoming classes) and slots. */
function useInvalidateSchedule() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: scheduleKeys.all }),
      qc.invalidateQueries({ queryKey: ['parent', 'dashboard'] }),
    ]);
}

export function useCancelClass() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (input: { classId: string; reason: string }) => familySchedulingApi.cancel(input.classId, input.reason),
    onSuccess: () => invalidate(),
  });
}

export function useRescheduleClass() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (input: { classId: string; newStartsAt: string; durationMinutes?: number }) =>
      familySchedulingApi.reschedule(input.classId, input.newStartsAt, input.durationMinutes),
    onSuccess: () => invalidate(),
  });
}

export function useBookClass() {
  const invalidate = useInvalidateSchedule();
  return useMutation({
    mutationFn: (input: BookClassInput) => familySchedulingApi.book(input),
    onSuccess: () => invalidate(),
  });
}

export function useRateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RateClassInput & { classId: string }) => qualityRatingApi.rateClass(input.classId, input),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['parent', 'teacher-rating'] }),
        qc.invalidateQueries({ queryKey: ['parent', 'report-card'] }),
      ]),
  });
}
