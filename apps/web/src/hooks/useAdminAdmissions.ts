'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  admissionsAdminApi,
  BookTrialInput,
  TeacherChangeStatus,
  TrialOutcomeEdit,
  TrialOutcomeInput,
} from '@/lib/api/modules/admissions-admin';

export const admissionsAdminKeys = {
  all: ['admissions-admin'] as const,
  teacherChangesAll: ['admissions-admin', 'teacher-changes'] as const,
  teacherChanges: (status?: TeacherChangeStatus) => ['admissions-admin', 'teacher-changes', status ?? 'ALL'] as const,
  plans: ['admissions-admin', 'plans'] as const,
};

export function useTeacherChanges(status?: TeacherChangeStatus, enabled = true) {
  return useQuery({
    queryKey: admissionsAdminKeys.teacherChanges(status),
    queryFn: () => admissionsAdminApi.listTeacherChanges(status),
    enabled,
  });
}

export function useAdminPlans() {
  return useQuery({
    queryKey: admissionsAdminKeys.plans,
    queryFn: admissionsAdminApi.listPlans,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBookTrial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BookTrialInput) => admissionsAdminApi.bookTrial(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduling'] });
      queryClient.invalidateQueries({ queryKey: TRIAL_LIST_KEY });
    },
  });
}

export function useRecordTrialOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, ...body }: TrialOutcomeInput & { classId: string }) =>
      admissionsAdminApi.recordTrialOutcome(classId, body),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['crm'] });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduling'] });
      queryClient.invalidateQueries({ queryKey: ['teacher'] });
      queryClient.invalidateQueries({ queryKey: trialOutcomeKey(vars.classId) });
      queryClient.invalidateQueries({ queryKey: TRIAL_LIST_KEY });
    },
  });
}

export const TRIAL_LIST_KEY = ['admin-trials'] as const;

/** Trial classes with their result and lead, refreshed every minute so new bookings appear. */
export function useTrialList() {
  return useQuery({ queryKey: TRIAL_LIST_KEY, queryFn: admissionsAdminApi.listTrials, refetchInterval: 60_000 });
}

export const trialOutcomeKey = (classId: string) => ['trial-outcome', classId] as const;

export function useTrialOutcome(classId: string | null | undefined) {
  return useQuery({
    queryKey: trialOutcomeKey(classId ?? ''),
    queryFn: () => admissionsAdminApi.getTrialOutcome(classId as string),
    enabled: Boolean(classId),
  });
}

export function useEditTrialOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, ...body }: TrialOutcomeEdit & { classId: string }) =>
      admissionsAdminApi.editTrialOutcome(classId, body),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: trialOutcomeKey(vars.classId) });
      queryClient.invalidateQueries({ queryKey: TRIAL_LIST_KEY });
    },
  });
}

export function useResolveTeacherChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      status,
      newTeacherId,
      resolutionNote,
    }: {
      requestId: string;
      status: Exclude<TeacherChangeStatus, 'OPEN'>;
      newTeacherId?: string;
      resolutionNote?: string;
    }) => admissionsAdminApi.resolveTeacherChange(requestId, status, newTeacherId, resolutionNote),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: admissionsAdminKeys.teacherChangesAll }),
  });
}

/** M60 — Admin → Enrolments → "Change teacher". */
export function useChangeEnrolmentTeacher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrolmentId, teacherId, note }: { enrolmentId: string; teacherId: string; note?: string }) =>
      admissionsAdminApi.changeEnrolmentTeacher(enrolmentId, teacherId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: admissionsAdminKeys.teacherChangesAll });
      queryClient.invalidateQueries({ queryKey: ['admin-scheduling'] });
      queryClient.invalidateQueries({ queryKey: ['admin-courses'] });
    },
  });
}
