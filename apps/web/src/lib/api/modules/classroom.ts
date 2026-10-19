import { http } from '../http';
import type { MushafLayout } from './mushaf';

/**
 * Live classroom (apps/api/src/modules/classroom/classroom.controller.ts).
 * Types mirror ClassroomService return shapes exactly.
 */

/** `ParticipantRole` from @hifzoon/shared. */
export type ParticipantRole = 'TEACHER' | 'STUDENT' | 'GUARDIAN_VIEWER' | 'SUPERVISOR';

/** The room opens this many minutes before the start and closes this long after the end. */
export const CLASSROOM_EARLY_OPEN_MINUTES = 10;

/** `POST /classroom/classes/:classId/token` (ClassroomService.issueRoomToken). */
export interface RoomToken {
  sub: string;
  cid: string;
  role: ParticipantRole;
  studentId: string | null;
  /** Signed room token — the only credential the classroom socket accepts. */
  token: string;
  /** Video provider room URL (`fake://room/…` with the development fake provider). */
  url: string;
  expiresAt: string;
}

export interface ClassroomHighlight {
  surah: number;
  ayah: number;
  wordIndex: number;
}

/** `GET /classroom/classes/:classId/state` (ClassroomService.snapshot). */
export interface ClassroomSnapshot {
  classId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  layout: MushafLayout;
  tajweedColours: boolean;
  page: number | null;
  highlight: ClassroomHighlight | null;
  participants: Array<{
    userId: string;
    displayName: string;
    role: ParticipantRole;
    joinedAt: string;
  }>;
  serverTime: string;
}

/** `GET /classroom/classes/:classId/attendance` (ClassroomService.attendance). */
export interface ClassAttendance {
  classId: string;
  participants: Array<{
    id: string;
    role: ParticipantRole;
    joinedAt: string;
    leftAt: string | null;
    minutesPresent: number;
    user: { id: string; name: string };
    student: { id: string; displayName: string } | null;
  }>;
  summary: {
    studentsPresent: number;
    averageMinutes: number;
    guardiansPresent: number;
    stillConnected: number;
  };
}

/** `GET /classroom/classes/:classId/recording/consent`. */
export interface RecordingConsent {
  allowed: boolean;
  students: Array<{ studentId: string; displayName: string; consented: boolean }>;
  /** Display names of students without CLASS_RECORDING consent. */
  missing: string[];
}

/** `POST /classroom/classes/:classId/recording/start`. */
export interface RecordingStarted {
  started: boolean;
  egressId: string;
  deleteAfter: string;
}

export type BandwidthTier = 'GOOD' | 'DEGRADED' | 'AUDIO_ONLY' | 'RECOVERING';

/** `GET /classroom/bandwidth-advice`. */
export interface BandwidthAdvice {
  tier: BandwidthTier;
  publishVideo: boolean;
  publishAudio: boolean;
  requestResolution: string;
  reason: string;
}

/** BandwidthQueryDto bounds. */
export interface BandwidthQuery {
  rttMs: number;
  downlinkKbps: number;
  packetLossPercent?: number;
}

const base = (classId: string) => `/classroom/classes/${encodeURIComponent(classId)}`;

export const classroomApi = {
  token: (classId: string) => http.post<RoomToken>(`${base(classId)}/token`, {}),
  state: (classId: string) => http.get<ClassroomSnapshot>(`${base(classId)}/state`),
  attendance: (classId: string) => http.get<ClassAttendance>(`${base(classId)}/attendance`),
  closeAttendance: (classId: string) => http.post<{ closed: number }>(`${base(classId)}/attendance/close`, {}),
  setPage: (classId: string, page: number) =>
    http.post<{ page: number; layout: MushafLayout }>(`${base(classId)}/page`, { page }),
  setHighlight: (classId: string, highlight: ClassroomHighlight) =>
    http.post<ClassroomHighlight>(`${base(classId)}/highlight`, highlight),
  setLayout: (classId: string, layout: MushafLayout) =>
    http.post<{ layout: MushafLayout }>(`${base(classId)}/layout`, { layout }),
  setTajweed: (classId: string, enabled: boolean) =>
    http.post<{ tajweedColours: boolean }>(`${base(classId)}/tajweed`, { enabled }),
  recordingConsent: (classId: string) => http.get<RecordingConsent>(`${base(classId)}/recording/consent`),
  startRecording: (classId: string, overrideReason?: string) =>
    http.post<RecordingStarted>(
      `${base(classId)}/recording/start`,
      overrideReason ? { overrideReason } : {},
    ),
  bandwidthAdvice: (query: BandwidthQuery) =>
    http.get<BandwidthAdvice>('/classroom/bandwidth-advice', {
      query: {
        rttMs: Math.round(query.rttMs),
        downlinkKbps: Math.round(query.downlinkKbps),
        packetLossPercent: query.packetLossPercent === undefined ? undefined : Math.round(query.packetLossPercent),
      },
    }),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export type JoinWindow = 'early' | 'open' | 'closed';

/** Mirrors the FR-CLS-01 window enforced by issueRoomToken. */
export function joinWindow(startsAt: string, endsAt: string, now: number = Date.now()): JoinWindow {
  const opensAt = new Date(startsAt).getTime() - CLASSROOM_EARLY_OPEN_MINUTES * 60_000;
  const closesAt = new Date(endsAt).getTime() + CLASSROOM_EARLY_OPEN_MINUTES * 60_000;
  if (now < opensAt) return 'early';
  if (now > closesAt) return 'closed';
  return 'open';
}

/** The development video provider issues `fake://` URLs that no real client can connect to. */
export function isFakeVideoUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith('fake://');
}

export function roomIdFromUrl(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

const ROLE_LABELS: Record<ParticipantRole, string> = {
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  GUARDIAN_VIEWER: 'Guardian (watching)',
  SUPERVISOR: 'Supervisor',
};

export function participantRoleLabel(role: string): string {
  return ROLE_LABELS[role as ParticipantRole] ?? role;
}

/** Validates BandwidthQueryDto bounds before calling the API. */
export function validateBandwidthQuery(q: BandwidthQuery): string | null {
  const int = (v: number) => Number.isFinite(v) && v >= 0;
  if (!int(q.rttMs) || q.rttMs > 10000) return 'Round-trip time must be between 0 and 10000 ms';
  if (!int(q.downlinkKbps) || q.downlinkKbps > 100000) return 'Downlink must be between 0 and 100000 kbps';
  if (q.packetLossPercent !== undefined && (!int(q.packetLossPercent) || q.packetLossPercent > 100)) {
    return 'Packet loss must be between 0 and 100%';
  }
  return null;
}

/** Socket.IO origin for the `/classroom` namespace (gateway is not under `/api/v1`). */
export function classroomSocketUrl(apiBase: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'): string {
  try {
    return `${new URL(apiBase).origin}/classroom`;
  } catch {
    return 'http://localhost:4000/classroom';
  }
}
