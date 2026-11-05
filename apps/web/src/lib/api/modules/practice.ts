import { http } from '../http';

/**
 * Practice between classes (`apps/api/src/modules/practice`, FR-AIC).
 *
 *   POST /practice-assignments                   teacher sets a passage
 *   GET  /practice-assignments?studentId&status  with minutes done
 *   GET  /practice-assignments/:id/sessions      sessions, with signed audio links
 *   POST /practice-sessions/upload-url           signed PUT for a recording
 *   POST /practice-sessions                      log a session
 *
 * Sessions are not machine-scored yet: no speech engine is switched on, so the result says
 * so (`resultSummary.scored === false`) and the teacher listens to the recording instead.
 */

export const PRACTICE_MODES = ['READING', 'MEMORISATION'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];
export type PracticeStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface PracticeAssignment {
  id: string;
  studentId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  mode: PracticeMode;
  targetMinutes: number;
  /** `YYYY-MM-DD` at midnight UTC, or null. */
  dueOn: string | null;
  status: PracticeStatus;
  createdAt: string;
  student: { id: string; displayName: string };
  teacher: { id: string; user: { name: string } };
  minutesDone: number;
  sessionCount: number;
  lastPractisedAt: string | null;
  overdue: boolean;
}

export interface PracticeSessionRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  wordsRecited: number;
  revealsCount: number;
  audioDeleteAfter: string | null;
  resultSummary: { scored?: boolean; note?: string } | null;
  hasAudio: boolean;
  audioUrl: string | null;
}

export interface AssignPracticeInput {
  studentId: string;
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  mode: PracticeMode;
  targetMinutes: number;
  dueOn?: string;
}

export interface LogPracticeInput {
  assignmentId: string;
  minutes: number;
  audioKey?: string;
}

export const practiceApi = {
  assign: (body: AssignPracticeInput) => http.post<PracticeAssignment>('/practice-assignments', body),
  list: (filter: { studentId?: string; status?: PracticeStatus } = {}) =>
    http.get<PracticeAssignment[]>('/practice-assignments', { query: { ...filter } }),
  sessions: (assignmentId: string) => http.get<PracticeSessionRow[]>(`/practice-assignments/${assignmentId}/sessions`),
  uploadUrl: (body: { assignmentId: string; contentType: string; size: number }) =>
    http.post<{ key: string; url: string }>('/practice-sessions/upload-url', body),
  log: (body: LogPracticeInput) =>
    http.post<{ assignmentStatus: PracticeStatus; minutesDone: number }>('/practice-sessions', body),
};

/** "67:1–10" for one surah, "2:255–3:5" across two. */
export function passageLabel(a: Pick<PracticeAssignment, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'>): string {
  return a.fromSurah === a.toSurah
    ? `${a.fromSurah}:${a.fromAyah}–${a.toAyah}`
    : `${a.fromSurah}:${a.fromAyah}–${a.toSurah}:${a.toAyah}`;
}

/**
 * Records with the microphone, uploads to the signed URL and logs the session. The browser's
 * own type is sent (e.g. `audio/webm;codecs=opus`), and the API signs exactly that.
 */
export async function uploadPracticeAudio(assignmentId: string, audio: Blob): Promise<string> {
  const contentType = audio.type || 'audio/webm';
  const { key, url } = await practiceApi.uploadUrl({ assignmentId, contentType, size: audio.size });
  const res = await fetch(url, { method: 'PUT', body: audio, headers: { 'Content-Type': contentType } });
  if (!res.ok) throw new Error('The recording could not be uploaded. Please try again.');
  return key;
}
