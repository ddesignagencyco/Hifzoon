import { http } from '../http';
import type { HiringStage } from './teacher-hiring';

/**
 * Hiring interviews (apps/api/src/modules/interviews/interviews.controller.ts).
 *
 * Two audiences:
 *  - staff (`/interviews/*`, ADMIN / SUPER_ADMIN / SUPERVISOR) book, run and score;
 *  - the applicant (`/interviews/join*`), who has no account and is authenticated only
 *    by the opaque token in their emailed link.
 *
 * Types mirror the `InterviewsService` return shapes exactly.
 */

export type InterviewStatus =
  | 'SCHEDULED'
  | 'LIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW_APPLICANT'
  | 'NO_SHOW_INTERVIEWER';

export type InterviewOutcome = 'PENDING' | 'PASSED' | 'FAILED';

export type InterviewParticipantRole = 'INTERVIEWER' | 'APPLICANT' | 'OBSERVER';

/** An interview can no longer be joined once it reaches one of these. */
export const CLOSED_INTERVIEW_STATUSES: InterviewStatus[] = [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW_APPLICANT',
  'NO_SHOW_INTERVIEWER',
];

/** The room opens this many minutes before the start and closes this long after the end. */
export const INTERVIEW_EARLY_OPEN_MINUTES = 10;

export const INTERVIEW_DURATION = { DEFAULT_MINUTES: 30, MIN_MINUTES: 10, MAX_MINUTES: 120 } as const;

export const INTERVIEW_SCORE_MIN = 1;
export const INTERVIEW_SCORE_MAX = 5;

/** The rubric, in the order the form shows it. */
export const INTERVIEW_SCORE_FIELDS = [
  { field: 'recitationScore', label: 'Recitation', hint: 'Fluency and accuracy of the recitation itself' },
  { field: 'tajweedScore', label: 'Tajweed', hint: 'Makharij, sifaat and the rules applied correctly' },
  { field: 'memorisationScore', label: 'Memorisation', hint: 'Strength and reliability of their own Hifz' },
  { field: 'teachingScore', label: 'Teaching', hint: 'How they would correct and guide a student' },
  { field: 'communicationScore', label: 'Communication', hint: 'Clarity, patience and manner with a child' },
] as const;

export type InterviewScoreField = (typeof INTERVIEW_SCORE_FIELDS)[number]['field'];

export type InterviewScores = Partial<Record<InterviewScoreField, number | null>>;

/** `GET /interviews` row. */
export interface InterviewListItem {
  id: string;
  applicationId: string;
  stage: HiringStage | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  status: InterviewStatus;
  outcome: InterviewOutcome;
  decidedAt: string | null;
  interviewerId: string;
  interviewer: { name: string };
  application: { applicantName: string; email: string; status: HiringStage };
}

/** `GET /interviews/:id`. */
export interface InterviewDetail {
  id: string;
  applicationId: string;
  stage: HiringStage | null;
  status: InterviewStatus;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  notes: string | null;
  outcome: InterviewOutcome;
  outcomeNotes: string | null;
  scores: Required<Record<InterviewScoreField, number | null>>;
  decidedAt: string | null;
  decidedBy: { id: string; name: string } | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  interviewer: { id: string; name: string };
  applicant: { name: string; email: string; applicationStatus: HiringStage };
  participants: Array<{
    identity: string;
    displayName: string;
    role: InterviewParticipantRole;
    joinedAt: string;
    leftAt: string | null;
    minutesPresent: number;
  }>;
  /** The hiring step this interview is evidence for; recording it stays a separate action. */
  servesStep: HiringStage;
  /** False for a supervisor who only sat in: they may not overwrite the verdict. */
  canConduct: boolean;
}

/** `POST /interviews` — the join link is in the response once, at creation only. */
export interface ScheduledInterview {
  id: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: InterviewStatus;
  stage: HiringStage | null;
  durationMinutes: number;
  applicantName: string;
  interviewerName: string;
  applicantJoinUrl: string;
}

export interface ScheduleInterviewInput {
  applicationId: string;
  startsAt: string;
  durationMinutes?: number;
  interviewerId?: string;
  stage?: HiringStage;
  timeZone?: string;
  notifyApplicant?: boolean;
}

export interface RescheduleInterviewInput {
  startsAt?: string;
  durationMinutes?: number;
  interviewerId?: string;
  stage?: HiringStage;
  timeZone?: string;
  notifyApplicant?: boolean;
}

/** `POST /interviews/:id/token` and `POST /interviews/join/room`. */
export interface InterviewRoomToken {
  sub: string;
  iid: string;
  role: InterviewParticipantRole;
  uid: string | null;
  /** Signed room token — the only credential the interview socket accepts. */
  token: string;
  /** Video provider room URL (`fake://room/…` with the development fake provider). */
  url: string;
  /** LiveKit access token for `url`; absent with the fake provider. */
  videoToken?: string;
  expiresAt: string;
  displayName: string;
}

/** `GET /interviews/:id/state` and the socket's `interview:state` payload. */
export interface InterviewSnapshot {
  interviewId: string;
  status: InterviewStatus;
  stage: HiringStage | null;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  applicantName: string;
  interviewerName: string;
  /** Always null for the applicant: the notes are the interviewer's. */
  notes: string | null;
  outcome: InterviewOutcome;
  participants: Array<{
    identity: string;
    displayName: string;
    role: InterviewParticipantRole;
    joinedAt: string;
    micOn?: boolean | null;
    camOn?: boolean | null;
  }>;
  serverTime: string;
}

/** `POST /interviews/join` — what the applicant's lobby shows before they join. */
export interface InterviewLobby {
  interviewId: string;
  applicantName: string;
  interviewerName: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  status: InterviewStatus;
  window: JoinWindow;
  opensAt: string;
  earlyOpenMinutes: number;
  serverTime: string;
}

export interface InterviewAttendance {
  interviewId: string;
  participants: Array<{
    id: string;
    identity: string;
    displayName: string;
    role: InterviewParticipantRole;
    joinedAt: string;
    leftAt: string | null;
    minutesPresent: number;
  }>;
  summary: {
    applicantAttended: boolean;
    interviewerAttended: boolean;
    applicantMinutes: number;
    interviewerMinutes: number;
    stillConnected: number;
  };
}

export interface InterviewOutcomeResult {
  id: string;
  status: InterviewStatus;
  outcome: InterviewOutcome;
  outcomeNotes: string | null;
  decidedAt: string | null;
  recordStepHint: {
    applicationId: string;
    step: HiringStage;
    suggestedStatus: 'PASSED' | 'FAILED';
  };
}

const enc = encodeURIComponent;
const base = (interviewId: string) => `/interviews/${enc(interviewId)}`;

export const interviewsApi = {
  list: (filter: { applicationId?: string; status?: InterviewStatus; mine?: boolean } = {}) =>
    http.get<InterviewListItem[]>('/interviews', { query: { ...filter } }),
  get: (interviewId: string) => http.get<InterviewDetail>(base(interviewId)),
  schedule: (body: ScheduleInterviewInput) => http.post<ScheduledInterview>('/interviews', body),
  reschedule: (interviewId: string, body: RescheduleInterviewInput) =>
    http.patch<ScheduledInterview>(base(interviewId), body),
  cancel: (interviewId: string, reason?: string) =>
    http.post<{ id: string; status: InterviewStatus }>(
      `${base(interviewId)}/cancel`,
      reason?.trim() ? { reason: reason.trim() } : {},
    ),

  token: (interviewId: string) => http.post<InterviewRoomToken>(`${base(interviewId)}/token`, {}),
  state: (interviewId: string) => http.get<InterviewSnapshot>(`${base(interviewId)}/state`),
  attendance: (interviewId: string) => http.get<InterviewAttendance>(`${base(interviewId)}/attendance`),

  saveNotes: (interviewId: string, notes: string) =>
    http.patch<{ id: string; notes: string | null; updatedAt: string }>(`${base(interviewId)}/notes`, { notes }),
  recordOutcome: (
    interviewId: string,
    body: { outcome: Exclude<InterviewOutcome, 'PENDING'>; outcomeNotes?: string; scores?: InterviewScores },
  ) => http.post<InterviewOutcomeResult>(`${base(interviewId)}/outcome`, body),
  noShow: (interviewId: string, who: 'APPLICANT' | 'INTERVIEWER', note?: string) =>
    http.post<{ id: string; status: InterviewStatus }>(`${base(interviewId)}/no-show`, {
      who,
      ...(note?.trim() ? { note: note.trim() } : {}),
    }),
  end: (interviewId: string) =>
    http.post<{ id: string; status: InterviewStatus; attendanceClosed: number }>(`${base(interviewId)}/end`, {}),

  // ── The applicant, with no account ──────────────────────────────────────────
  /**
   * The token travels in the body, never in the URL: it is the applicant's only
   * credential, and a token in a path lands in access logs and `Referer` headers.
   */
  lobby: (token: string) => http.post<InterviewLobby>('/interviews/join', { token }),
  joinRoom: (token: string) => http.post<InterviewRoomToken>('/interviews/join/room', { token }),
  /** The applicant's polling fallback: the staff `state` route is role-guarded. */
  joinState: (token: string) => http.post<InterviewSnapshot>('/interviews/join/state', { token }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export type JoinWindow = 'early' | 'open' | 'closed';

/** Mirrors the join window the API enforces when it issues a room token. */
export function interviewJoinWindow(
  startsAt: string,
  endsAt: string,
  now: number = Date.now(),
): JoinWindow {
  const opensAt = new Date(startsAt).getTime() - INTERVIEW_EARLY_OPEN_MINUTES * 60_000;
  const closesAt = new Date(endsAt).getTime() + INTERVIEW_EARLY_OPEN_MINUTES * 60_000;
  if (now < opensAt) return 'early';
  if (now > closesAt) return 'closed';
  return 'open';
}

export function isInterviewClosed(status: InterviewStatus): boolean {
  return CLOSED_INTERVIEW_STATUSES.includes(status);
}

const ROLE_LABELS: Record<InterviewParticipantRole, string> = {
  INTERVIEWER: 'Interviewer',
  APPLICANT: 'Applicant',
  OBSERVER: 'Observer',
};

export function interviewRoleLabel(role: string): string {
  return ROLE_LABELS[role as InterviewParticipantRole] ?? role;
}

const STATUS_LABELS: Record<InterviewStatus, string> = {
  SCHEDULED: 'Scheduled',
  LIVE: 'Live',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW_APPLICANT: 'Applicant did not attend',
  NO_SHOW_INTERVIEWER: 'Interviewer did not attend',
};

export function interviewStatusLabel(status: string): string {
  return STATUS_LABELS[status as InterviewStatus] ?? status;
}

/** The development video provider issues `fake://` URLs no real client can connect to. */
export function isFakeInterviewUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith('fake://');
}

/** Mirrors `ScheduleInterviewDto` plus the service's "not in the past" rule. */
export function validateScheduleInterview(
  input: { startsAt: string; durationMinutes?: number },
  now: number = Date.now(),
): string | null {
  const at = new Date(input.startsAt).getTime();
  if (!input.startsAt || Number.isNaN(at)) return 'Choose a date and time.';
  if (at < now - 60_000) return 'An interview cannot be booked in the past.';
  const minutes = input.durationMinutes ?? INTERVIEW_DURATION.DEFAULT_MINUTES;
  if (
    !Number.isInteger(minutes) ||
    minutes < INTERVIEW_DURATION.MIN_MINUTES ||
    minutes > INTERVIEW_DURATION.MAX_MINUTES
  ) {
    return `An interview lasts between ${INTERVIEW_DURATION.MIN_MINUTES} and ${INTERVIEW_DURATION.MAX_MINUTES} minutes.`;
  }
  return null;
}

/** Mirrors `InterviewOutcomeDto` and the 1–5 rubric bounds. */
export function validateInterviewOutcome(input: {
  outcome: InterviewOutcome;
  outcomeNotes?: string;
  scores?: InterviewScores;
}): string | null {
  if (input.outcome !== 'PASSED' && input.outcome !== 'FAILED') {
    return 'Choose whether the applicant passed or failed.';
  }
  if (input.outcomeNotes && input.outcomeNotes.length > 4000) {
    return 'Notes are limited to 4000 characters.';
  }
  for (const [field, value] of Object.entries(input.scores ?? {})) {
    if (value === null || value === undefined) continue;
    if (!Number.isInteger(value) || value < INTERVIEW_SCORE_MIN || value > INTERVIEW_SCORE_MAX) {
      return `${field} must be a whole number between ${INTERVIEW_SCORE_MIN} and ${INTERVIEW_SCORE_MAX}.`;
    }
  }
  return null;
}

/** The rubric average, to one decimal. Null when nothing has been scored. */
export function averageScore(scores: InterviewScores | null | undefined): number | null {
  const values = Object.values(scores ?? {}).filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

/** Socket.IO origin for the `/interviews` namespace (gateways are not under `/api/v1`). */
export function interviewSocketUrl(
  apiBase: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1',
): string {
  // The web dev proxy cannot carry WebSocket upgrades, so a tunnel setup points the
  // socket at the API directly.
  const socketBase = process.env.NEXT_PUBLIC_SOCKET_URL;
  if (socketBase) return `${socketBase.replace(/\/$/, '')}/interviews`;
  try {
    // A relative base (`/api/v1`, single-origin tunnel mode) means "this site's origin".
    if (apiBase.startsWith('/')) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      return `${origin}/interviews`;
    }
    return `${new URL(apiBase).origin}/interviews`;
  } catch {
    return 'http://localhost:4000/interviews';
  }
}
