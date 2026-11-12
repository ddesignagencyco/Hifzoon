'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HolidayInput, SchedulePatch, schedulingExtrasApi } from '@/lib/api/modules/scheduling-admin';
import { adminSchedulingKeys } from './useAdminScheduling';

const holidayKey = ['scheduling', 'holidays'] as const;
const offersKey = ['scheduling', 'substitute-offers', 'mine'] as const;

/** Anything that adds, moves or removes classes changes every view of the timetable. */
function useRefreshClasses() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: adminSchedulingKeys.all });
    qc.invalidateQueries({ queryKey: ['teacher'] });
    qc.invalidateQueries({ queryKey: ['parent'] });
    qc.invalidateQueries({ queryKey: ['qa', 'timetable'] });
  };
}

export function useScheduleActions() {
  const refresh = useRefreshClasses();
  return useMutation({
    mutationFn: (i: { kind: 'update'; id: string; body: SchedulePatch } | { kind: 'pause' | 'resume' | 'end'; id: string }): Promise<unknown> =>
      i.kind === 'update' ? schedulingExtrasApi.updateSchedule(i.id, i.body)
        : i.kind === 'pause' ? schedulingExtrasApi.pauseSchedule(i.id)
        : i.kind === 'resume' ? schedulingExtrasApi.resumeSchedule(i.id)
        : schedulingExtrasApi.endSchedule(i.id),
    onSettled: refresh,
  });
}

export function useHolidays(from?: string) {
  return useQuery({ queryKey: [...holidayKey, from ?? ''], queryFn: () => schedulingExtrasApi.holidays(from) });
}

export function useSaveHoliday() {
  const qc = useQueryClient();
  const refresh = useRefreshClasses();
  return useMutation({
    mutationFn: (i: { kind: 'create'; body: HolidayInput } | { kind: 'update'; id: string; body: Partial<HolidayInput> } | { kind: 'delete'; id: string }) =>
      i.kind === 'create' ? schedulingExtrasApi.createHoliday(i.body)
        : i.kind === 'update' ? schedulingExtrasApi.updateHoliday(i.id, i.body)
        : schedulingExtrasApi.deleteHoliday(i.id),
    onSettled: () => { qc.invalidateQueries({ queryKey: holidayKey }); refresh(); },
  });
}

export function useSubstituteCandidates(classId: string | null) {
  return useQuery({ queryKey: ['scheduling', 'substitute-candidates', classId], queryFn: () => schedulingExtrasApi.substituteCandidates(classId as string), enabled: Boolean(classId) });
}

export function useSubstituteActions(classId: string) {
  const qc = useQueryClient();
  const refresh = useRefreshClasses();
  return {
    offer: useMutation({
      mutationFn: (b: { teacherIds: string[]; expiresInHours?: number }) => schedulingExtrasApi.offerSubstitute(classId, b),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduling', 'substitute-candidates', classId] }),
    }),
    assign: useMutation({ mutationFn: (teacherId: string) => schedulingExtrasApi.assignSubstitute(classId, teacherId), onSuccess: refresh }),
  };
}

export function useMySubstituteOffers() {
  return useQuery({ queryKey: offersKey, queryFn: schedulingExtrasApi.myOffers });
}

export function useRespondOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { offerId: string; accept: boolean }) => schedulingExtrasApi.respondOffer(v.offerId, v.accept),
    // 409 (expired / taken / double-booked) also changes the list, so refresh on settle.
    onSettled: () => { qc.invalidateQueries({ queryKey: offersKey }); qc.invalidateQueries({ queryKey: ['teacher'] }); },
  });
}

export function useClassChange() {
  const refresh = useRefreshClasses();
  return {
    cancel: useMutation({ mutationFn: (v: { classId: string; reason: string }) => schedulingExtrasApi.cancelClass(v.classId, v.reason), onSettled: refresh }),
    reschedule: useMutation({ mutationFn: (v: { classId: string; newStartsAt: string; durationMinutes?: number }) => schedulingExtrasApi.rescheduleClass(v.classId, { newStartsAt: v.newStartsAt, durationMinutes: v.durationMinutes }), onSettled: refresh }),
  };
}
