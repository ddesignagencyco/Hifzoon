'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  InterviewScores,
  InterviewSnapshot,
  InterviewStatus,
  RescheduleInterviewInput,
  ScheduleInterviewInput,
  interviewsApi,
} from '@/lib/api/modules/interviews';
import { hiringKeys } from './useHiring';

export const interviewKeys = {
  all: ['interviews'] as const,
  list: (filter: { applicationId?: string; status?: InterviewStatus; mine?: boolean } = {}) =>
    ['interviews', 'list', filter.applicationId ?? 'ALL', filter.status ?? 'ALL', filter.mine ? 'MINE' : 'ANY'] as const,
  detail: (id: string) => ['interviews', 'detail', id] as const,
  state: (id: string) => ['interviews', id, 'state'] as const,
  attendance: (id: string) => ['interviews', id, 'attendance'] as const,
  lobby: (token: string) => ['interviews', 'lobby', token] as const,
};

/** Default state poll: the room follows presence within ~3s even without a socket. */
export const INTERVIEW_STATE_POLL_MS = 3000;
/** While the socket is connected it carries every change; polling is only a safety net. */
export const INTERVIEW_LIVE_POLL_MS = 20_000;

export function useInterviews(
  filter: { applicationId?: string; status?: InterviewStatus; mine?: boolean } = {},
  enabled = true,
) {
  return useQuery({
    queryKey: interviewKeys.list(filter),
    queryFn: () => interviewsApi.list(filter),
    enabled,
  });
}

export function useInterview(interviewId: string | undefined) {
  return useQuery({
    queryKey: interviewKeys.detail(interviewId ?? ''),
    queryFn: () => interviewsApi.get(interviewId as string),
    enabled: Boolean(interviewId),
  });
}

type PollSetting = number | false | ((data: InterviewSnapshot | undefined) => number | false);

/**
 * The room snapshot.
 *
 * `applicantToken` switches it to the public route: the staff `state` endpoint is
 * role-guarded, and an applicant holds no session, so polling it as them would 403 on a
 * loop. Both routes answer the same shape — the applicant's just never carries the notes.
 */
export function useInterviewState(
  interviewId: string,
  options: { pollMs?: PollSetting; applicantToken?: string } = {},
) {
  const pollMs = options.pollMs === undefined ? INTERVIEW_STATE_POLL_MS : options.pollMs;
  const { applicantToken } = options;
  return useQuery({
    queryKey: interviewKeys.state(interviewId),
    queryFn: () =>
      applicantToken ? interviewsApi.joinState(applicantToken) : interviewsApi.state(interviewId),
    enabled: !!interviewId,
    refetchInterval: typeof pollMs === 'function' ? (query) => pollMs(query.state.data) : pollMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

export function useInterviewAttendance(interviewId: string, enabled = true) {
  return useQuery({
    queryKey: interviewKeys.attendance(interviewId),
    queryFn: () => interviewsApi.attendance(interviewId),
    enabled: enabled && !!interviewId,
    refetchInterval: 20_000,
  });
}

export function useScheduleInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleInterviewInput) => interviewsApi.schedule(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      // The application detail page shows its interviews alongside the hiring steps.
      queryClient.invalidateQueries({ queryKey: hiringKeys.all });
    },
  });
}

export function useRescheduleInterview(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RescheduleInterviewInput) => interviewsApi.reschedule(interviewId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: interviewKeys.all }),
  });
}

export function useCancelInterview(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => interviewsApi.cancel(interviewId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      queryClient.invalidateQueries({ queryKey: hiringKeys.all });
    },
  });
}

/** Room token — a POST, so joining is an explicit action rather than a query. */
export function useJoinInterview(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => interviewsApi.token(interviewId),
    onSuccess: () => {
      // The first token opens the room and may flip the interview to LIVE.
      queryClient.invalidateQueries({ queryKey: interviewKeys.state(interviewId) });
    },
  });
}

/**
 * Autosaves the interviewer's notes. Deliberately not optimistic: the textarea is the
 * source of truth while it has focus, and writing the server's echo back into it mid-type
 * would move the caret.
 */
export function useSaveInterviewNotes(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => interviewsApi.saveNotes(interviewId, notes),
    onSuccess: (data) => {
      queryClient.setQueryData<InterviewSnapshot>(interviewKeys.state(interviewId), (prev) =>
        prev ? { ...prev, notes: data.notes } : prev,
      );
    },
  });
}

export function useRecordInterviewOutcome(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      outcome: 'PASSED' | 'FAILED';
      outcomeNotes?: string;
      scores?: InterviewScores;
    }) => interviewsApi.recordOutcome(interviewId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interviewKeys.all });
      // The verdict does not move the pipeline, but the application page shows it.
      queryClient.invalidateQueries({ queryKey: hiringKeys.all });
    },
  });
}

export function useMarkInterviewNoShow(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ who, note }: { who: 'APPLICANT' | 'INTERVIEWER'; note?: string }) =>
      interviewsApi.noShow(interviewId, who, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: interviewKeys.all }),
  });
}

export function useEndInterview(interviewId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => interviewsApi.end(interviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: interviewKeys.all }),
  });
}

// ── The applicant, with no account ────────────────────────────────────────────

/**
 * The applicant's lobby, keyed by their emailed token.
 *
 * Polls while the room is still closed so the Join button appears on its own when the
 * window opens — an applicant waiting on a page that never changes refreshes, and some
 * of them will refresh their way out of the tab.
 */
export function useInterviewLobby(token: string | undefined) {
  return useQuery({
    queryKey: interviewKeys.lobby(token ?? ''),
    queryFn: () => interviewsApi.lobby(token as string),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: (query) => (query.state.data?.window === 'early' ? 15_000 : false),
  });
}

export function useJoinInterviewAsApplicant(token: string | undefined) {
  return useMutation({
    mutationFn: () => interviewsApi.joinRoom(token as string),
  });
}
