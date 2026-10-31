'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BandwidthQuery,
  classroomApi,
  ClassroomHighlight,
  ClassroomSnapshot,
  validateBandwidthQuery,
} from '@/lib/api/modules/classroom';
import type { MushafLayout } from '@/lib/api/modules/mushaf';

export const classroomKeys = {
  all: ['classroom'] as const,
  state: (classId: string) => ['classroom', classId, 'state'] as const,
  attendance: (classId: string) => ['classroom', classId, 'attendance'] as const,
  recordingConsent: (classId: string) => ['classroom', classId, 'recording-consent'] as const,
  bandwidth: (q: BandwidthQuery) => ['classroom', 'bandwidth', q.rttMs, q.downlinkKbps, q.packetLossPercent ?? 0] as const,
};

/** Default state poll: participants follow the teacher within ~2.5s even without a socket. */
export const STATE_POLL_MS = 2500;
/** While the socket is connected it carries every change; polling is only a safety net. */
export const LIVE_POLL_MS = 15_000;

type PollSetting = number | false | ((data: ClassroomSnapshot | undefined) => number | false);

export function useClassroomState(classId: string, options: { pollMs?: PollSetting } = {}) {
  const pollMs = options.pollMs === undefined ? STATE_POLL_MS : options.pollMs;
  return useQuery({
    queryKey: classroomKeys.state(classId),
    queryFn: () => classroomApi.state(classId),
    enabled: !!classId,
    refetchInterval: typeof pollMs === 'function' ? (query) => pollMs(query.state.data) : pollMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** Room token — a POST, so it is an explicit "Join" action rather than a query. */
export function useJoinClassroom(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (asStudentId?: string) => classroomApi.token(classId, asStudentId),
    onSuccess: () => {
      // Issuing the first token opens the room and may flip the class to LIVE.
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

export function useClassroomAttendance(classId: string, enabled = true) {
  return useQuery({
    queryKey: classroomKeys.attendance(classId),
    queryFn: () => classroomApi.attendance(classId),
    enabled: enabled && !!classId,
    refetchInterval: 15_000,
  });
}

export function useCloseAttendance(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => classroomApi.closeAttendance(classId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classroomKeys.attendance(classId) });
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

/** Writes a partial update into the cached snapshot so the teacher sees changes instantly. */
function patchState(
  queryClient: ReturnType<typeof useQueryClient>,
  classId: string,
  patch: Partial<ClassroomSnapshot>,
) {
  queryClient.setQueryData<ClassroomSnapshot>(classroomKeys.state(classId), (current) =>
    current ? { ...current, ...patch } : current,
  );
}

export function useSetClassroomPage(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (page: number) => classroomApi.setPage(classId, page),
    onSuccess: (data) => {
      patchState(queryClient, classId, { page: data.page, layout: data.layout });
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

export function useSetClassroomHighlight(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (highlight: ClassroomHighlight) => classroomApi.setHighlight(classId, highlight),
    onSuccess: (data) => {
      patchState(queryClient, classId, { highlight: data });
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

export function useSetClassroomLayout(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: MushafLayout) => classroomApi.setLayout(classId, layout),
    onSuccess: (data) => {
      patchState(queryClient, classId, { layout: data.layout });
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

export function useSetClassroomTajweed(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => classroomApi.setTajweed(classId, enabled),
    onSuccess: (data) => {
      patchState(queryClient, classId, { tajweedColours: data.tajweedColours });
      queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) });
    },
  });
}

export function useRecordingConsent(classId: string, enabled = true) {
  return useQuery({
    queryKey: classroomKeys.recordingConsent(classId),
    queryFn: () => classroomApi.recordingConsent(classId),
    enabled: enabled && !!classId,
  });
}

export function useStartRecording(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => classroomApi.startRecording(classId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: classroomKeys.recordingConsent(classId) });
    },
  });
}

export function useStopRecording(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => classroomApi.stopRecording(classId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: classroomKeys.state(classId) }),
  });
}

/** The class recording with a fresh signed link; refetched rather than cached long. */
export function useClassRecording(classId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['classroom', classId ?? '', 'recording'] as const,
    queryFn: () => classroomApi.recording(classId as string),
    enabled: enabled && !!classId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useBandwidthAdvice(query: BandwidthQuery | null) {
  const valid = !!query && validateBandwidthQuery(query) === null;
  return useQuery({
    queryKey: query ? classroomKeys.bandwidth(query) : ['classroom', 'bandwidth', 'none'],
    queryFn: () => classroomApi.bandwidthAdvice(query as BandwidthQuery),
    enabled: valid,
    staleTime: 60_000,
  });
}
