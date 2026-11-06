import { http } from '../http';
import type { AyahRef } from './mushaf';
import type { MistakeType } from './lessons';

/**
 * Practice between classes (`apps/api/src/modules/practice`, FR-AIC).
 *
 *   POST /practice-assignments                   teacher sets a passage
 *   GET  /practice-assignments?studentId&status  with minutes done and review status
 *   GET  /practice-assignments/:id/sessions      sessions, with signed audio links and marks
 *   POST /practice-sessions/upload-url           signed PUT for a recording
 *   POST /practice-sessions                      log a session (timer minutes, reveals)
 *   GET  /practice-sessions/to-review            teacher: sessions waiting for a reply
 *   GET  /practice-sessions/:id                  one session with its assignment
 *   POST /practice-sessions/:id/review           teacher feedback and marked words
 *   GET  /practice-assignments/:id/reference-audio  a qari's recitation per ayah
 *   GET  /practice-assignments/:id/recording-allowed  whether a guardian allows recordings
 *
 * Two kinds of session: PREPARE (the child's own practice with the timer, never reviewed) and
 * RECITATION (a recording sent to the teacher, who reviews it).
 *
 * Nothing is scored by machine: the teacher listens (or reads the log) and replies.
 */

export const PRACTICE_MODES = ['READING', 'MEMORISATION'] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];
export type PracticeStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

/** A practice that is a board item: a Hisn al-Muslim chapter or dua, or a Noorani Qaida lesson. */
export type PracticeBoard = 'QAIDA' | 'DUAS';

/** Where a practice is: a surah/ayah range, or (range null) a board item with its label. */
export interface PracticePassage {
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  /** Absent from older API responses (always a range then). */
  board?: PracticeBoard | null;
  /** DUAS: the chapter id. QAIDA: the 1-based lesson. */
  boardLesson?: number | null;
  /** DUAS: one dua of the chapter (0-based), or null for the whole chapter. */
  boardItem?: number | null;
  /** The dua / chapter title or the Qaida lesson title. */
  label?: string | null;
}

export interface PracticeAssignment extends PracticePassage {
  id: string;
  studentId: string;
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
  /** Sessions the teacher has not replied to yet; absent from older API responses. */
  awaitingReview?: number;
  /** The most recent reply, and who gave it. */
  lastReview?: { at: string; by: string | null } | null;
}

/** A word the teacher marked while reviewing a session. */
export interface PracticeMark {
  id: string;
  surah: number | null;
  ayah: number | null;
  wordIndex: number | null;
  type: MistakeType;
  note: string | null;
  resolvedAt: string | null;
}

/** PREPARE: own practice, never reviewed. RECITATION: a recording for the teacher. */
export type PracticeSessionKind = 'PREPARE' | 'RECITATION';

export interface PracticeSessionRow {
  id: string;
  /** Absent from older API responses; see `sessionKind`. */
  kind?: PracticeSessionKind;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  wordsRecited: number;
  revealsCount: number;
  audioDeleteAfter: string | null;
  resultSummary: { note?: string } | null;
  hasAudio: boolean;
  audioUrl: string | null;
  reviewedAt?: string | null;
  feedback?: string | null;
  reviewedBy?: { name: string } | null;
  marks?: PracticeMark[];
}

export interface PracticeSessionDetail {
  session: PracticeSessionRow;
  assignment: Pick<
    PracticeAssignment,
    | 'id'
    | 'studentId'
    | 'fromSurah'
    | 'fromAyah'
    | 'toSurah'
    | 'toAyah'
    | 'board'
    | 'boardLesson'
    | 'boardItem'
    | 'label'
    | 'mode'
    | 'targetMinutes'
    | 'student'
    | 'teacher'
  > | null;
  canReview: boolean;
}

/** Which sessions the teacher's practice queue lists. */
export type PracticeReviewStatus = 'waiting' | 'reviewed' | 'all';

export interface PracticeReviewItem {
  id: string;
  startedAt: string;
  minutes: number;
  revealsCount: number;
  hasAudio: boolean;
  kind?: PracticeSessionKind;
  /** Set once the teacher has replied; null while it waits. */
  reviewedAt?: string | null;
  assignment: Pick<
    PracticeAssignment,
    | 'id'
    | 'fromSurah'
    | 'fromAyah'
    | 'toSurah'
    | 'toAyah'
    | 'board'
    | 'boardLesson'
    | 'boardItem'
    | 'label'
    | 'mode'
    | 'student'
  >;
}

/** A word of the passage; for a board practice, the dua word or Qaida item (`itemRef`) instead. */
export type ReviewMarkInput =
  | { surah: number; ayah: number; wordIndex: number; type: MistakeType; itemRef?: undefined }
  | { itemRef: string; type: MistakeType; surah?: undefined; ayah?: undefined; wordIndex?: undefined };

export interface ReviewPracticeInput {
  feedback?: string;
  mistakes?: ReviewMarkInput[];
}

export interface ReferenceAudio {
  /** False when the deployment has no licensed recitation source. */
  available: boolean;
  truncated: boolean;
  ayahs: Array<{ surah: number; ayah: number; url: string }>;
}

/** A surah/ayah range, or a board item (`board` + `boardLesson`, optional `boardItem`). */
export interface AssignPracticeInput {
  studentId: string;
  fromSurah?: number;
  fromAyah?: number;
  toSurah?: number;
  toAyah?: number;
  board?: PracticeBoard;
  boardLesson?: number;
  boardItem?: number;
  mode: PracticeMode;
  targetMinutes: number;
  dueOn?: string;
}

export interface LogPracticeInput {
  assignmentId: string;
  minutes: number;
  revealsCount?: number;
  audioKey?: string;
}

export const practiceApi = {
  assign: (body: AssignPracticeInput) =>
    http.post<PracticeAssignment>('/practice-assignments', body),
  list: (filter: { studentId?: string; status?: PracticeStatus } = {}) =>
    http.get<PracticeAssignment[]>('/practice-assignments', { query: { ...filter } }),
  sessions: (assignmentId: string) =>
    http.get<PracticeSessionRow[]>(`/practice-assignments/${assignmentId}/sessions`),
  uploadUrl: (body: { assignmentId: string; contentType: string; size: number }) =>
    http.post<{ key: string; url: string }>('/practice-sessions/upload-url', body),
  log: (body: LogPracticeInput) =>
    http.post<{ assignmentStatus: PracticeStatus; minutesDone: number }>(
      '/practice-sessions',
      body,
    ),
  recordingAllowed: (assignmentId: string) =>
    http.get<{ allowed: boolean }>(`/practice-assignments/${assignmentId}/recording-allowed`),
  referenceAudio: (assignmentId: string) =>
    http.get<ReferenceAudio>(`/practice-assignments/${assignmentId}/reference-audio`),
  toReview: (status: PracticeReviewStatus = 'waiting') =>
    http.get<PracticeReviewItem[]>('/practice-sessions/to-review', { query: { status } }),
  session: (sessionId: string) =>
    http.get<PracticeSessionDetail>(`/practice-sessions/${sessionId}`),
  review: (sessionId: string, body: ReviewPracticeInput) =>
    http.post<{ id: string; reviewedAt: string; feedback: string | null; added: number }>(
      `/practice-sessions/${sessionId}/review`,
      body,
    ),
};

/** The surah/ayah range of a practice, or null for a board item. */
export function practiceRange(
  a: PracticePassage,
): { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null {
  if (a.board || a.fromSurah == null || a.fromAyah == null || a.toSurah == null || a.toAyah == null) {
    return null;
  }
  return { fromSurah: a.fromSurah, fromAyah: a.fromAyah, toSurah: a.toSurah, toAyah: a.toAyah };
}

/**
 * What a practice is, for lists and headings: "Surah 67:1–10", "Duas: Before eating",
 * "Qaida: Lesson 3 — Huroof muqattaʿat".
 */
export function practiceTitle(a: PracticePassage): string {
  if (a.board === 'QAIDA') {
    return `Qaida: Lesson ${a.boardLesson ?? '?'}${a.label ? ` — ${a.label}` : ''}`;
  }
  if (a.board === 'DUAS') return `Duas: ${a.label ?? `chapter ${a.boardLesson ?? '?'}`}`;
  return `Surah ${passageLabel(a)}`;
}

/** Sorts board practice after every surah range, Qaida before Duas, by lesson. */
export function practiceSortValue(a: PracticePassage): number {
  if (a.board) return (a.board === 'QAIDA' ? 200_000 : 300_000) + (a.boardLesson ?? 0) * 100 + (a.boardItem ?? 0);
  return (a.fromSurah ?? 0) * 1000 + (a.fromAyah ?? 0);
}

/** "67:1–10" for one surah, "2:255–3:5" across two; empty for a board item (see practiceTitle). */
export function passageLabel(
  a: Pick<PracticePassage, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'>,
): string {
  if (a.fromSurah == null) return '';
  return a.fromSurah === a.toSurah
    ? `${a.fromSurah}:${a.fromAyah}–${a.toAyah}`
    : `${a.fromSurah}:${a.fromAyah}–${a.toSurah}:${a.toAyah}`;
}

/** Ayahs in each surah, Hafs numbering (mirrors `apps/api/src/modules/practice/passage.ts`). */
const AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/**
 * The most ayahs the practice screen shows. A passage longer than this is more than a sitting;
 * the teacher splits it, and the screen says the rest is not shown.
 */
export const MAX_PASSAGE_AYAHS = 300;

/** The ayahs of a passage in reading order, across surah boundaries, at most `max` of them. */
export function passageAyahs(
  range: { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number },
  max = MAX_PASSAGE_AYAHS,
): { ayahs: AyahRef[]; truncated: boolean } {
  const ayahs: AyahRef[] = [];
  let surah = range.fromSurah;
  let ayah = range.fromAyah;
  while (surah < range.toSurah || (surah === range.toSurah && ayah <= range.toAyah)) {
    const count = AYAH_COUNTS[surah - 1];
    if (count === undefined) break;
    if (ayah > count) {
      surah += 1;
      ayah = 1;
      continue;
    }
    if (ayahs.length === max) return { ayahs, truncated: true };
    ayahs.push({ surah, ayah });
    ayah += 1;
  }
  return { ayahs, truncated: false };
}

/** Timer seconds to logged minutes: rounded up, at least 1, at most the API's 180. */
export function timerMinutes(seconds: number): number {
  return Math.min(180, Math.max(1, Math.ceil(seconds / 60)));
}

/** A recitation has (or had, before the 30-day deletion) a recording, or was reviewed. */
export function sessionKind(
  s: Pick<PracticeSessionRow, 'kind' | 'hasAudio' | 'audioDeleteAfter' | 'reviewedAt'>,
): PracticeSessionKind {
  if (s.kind) return s.kind;
  return s.hasAudio || s.audioDeleteAfter || s.reviewedAt ? 'RECITATION' : 'PREPARE';
}

/** Where the session stands for the family: prepare sessions are never sent to the teacher. */
export function sessionStatus(
  s: Pick<PracticeSessionRow, 'kind' | 'hasAudio' | 'audioDeleteAfter' | 'reviewedAt'>,
): 'reviewed' | 'waiting' | 'practised' {
  if (s.reviewedAt) return 'reviewed';
  return sessionKind(s) === 'RECITATION' ? 'waiting' : 'practised';
}

/** Recording length to logged minutes: rounded up, at least 1. */
export function recordingMinutes(seconds: number): number {
  return timerMinutes(seconds);
}

/**
 * Records with the microphone, uploads to the signed URL and logs the session. The browser's
 * own type is sent (e.g. `audio/webm;codecs=opus`), and the API signs exactly that.
 */
export async function uploadPracticeAudio(assignmentId: string, audio: Blob): Promise<string> {
  const contentType = audio.type || 'audio/webm';
  const { key, url } = await practiceApi.uploadUrl({ assignmentId, contentType, size: audio.size });
  const res = await fetch(url, {
    method: 'PUT',
    body: audio,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) throw new Error('The recording could not be uploaded. Please try again.');
  return key;
}
