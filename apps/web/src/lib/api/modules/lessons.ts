import { ApiClientError, http } from '../http';
import type { MushafLayout } from './mushaf';

/**
 * Mistakes and lesson cards (apps/api/src/modules/lessons/lessons.controller.ts).
 * Types mirror the MistakesService / LessonCardsService `select`s exactly.
 */

// ── Enums (@hifzoon/shared learning.enum.ts) ────────────────────────────────

export type MistakeType =
  | 'LETTER_MAKHRAJ'
  | 'VOWEL_HARAKAH'
  | 'TAJWEED_RULE'
  | 'SKIPPED_WORD'
  | 'ADDED_WORD'
  | 'STOP_WAQF';

export const MISTAKE_TYPES: readonly MistakeType[] = [
  'LETTER_MAKHRAJ',
  'VOWEL_HARAKAH',
  'TAJWEED_RULE',
  'SKIPPED_WORD',
  'ADDED_WORD',
  'STOP_WAQF',
];

export const MISTAKE_TYPE_LABELS: Record<MistakeType, string> = {
  LETTER_MAKHRAJ: 'Letter / makhraj',
  VOWEL_HARAKAH: 'Vowel / harakah',
  TAJWEED_RULE: 'Tajweed rule',
  SKIPPED_WORD: 'Skipped word',
  ADDED_WORD: 'Added word',
  STOP_WAQF: 'Stop / waqf',
};

export type Grade = 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK' | 'REPEAT';
export const GRADES: readonly Grade[] = ['EXCELLENT', 'GOOD', 'NEEDS_WORK', 'REPEAT'];
export const GRADE_LABELS: Record<Grade, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  NEEDS_WORK: 'Needs work',
  REPEAT: 'Repeat',
};

export type PortionKind = 'SABAQ' | 'SABQI' | 'MANZIL' | 'OTHER';
export const PORTION_KINDS: readonly PortionKind[] = ['SABAQ', 'SABQI', 'MANZIL', 'OTHER'];
export const PORTION_KIND_LABELS: Record<PortionKind, string> = {
  SABAQ: 'Sabaq (new lesson)',
  SABQI: 'Sabqi (recent revision)',
  MANZIL: 'Manzil (long-term revision)',
  OTHER: 'Other',
};

export type MistakeSource = 'CLASS' | 'AI';

/** FR-REC-08 — cards lock 48 hours after submission. */
export const LESSON_CARD_LOCK_HOURS = 48;
export const LESSON_TEXT_MAX = 2000;
export const EDIT_REASON_MAX = 500;
export const AI_DRAFT_MAX = 4000;
export const TAJWEED_RULE_MAX = 80;

// ── Mistakes ────────────────────────────────────────────────────────────────

/** MarkMistakeDto. */
export interface MarkMistakeInput {
  studentId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule?: string;
  occurredAt?: string;
}

/** `POST /classes/:classId/mistakes` (MistakesService.mark select). */
export interface MarkedMistake {
  id: string;
  studentId: string;
  classId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule: string | null;
  confirmed: boolean;
  occurredAt: string;
}

/** `GET /classes/:classId/mistakes` (MistakesService.listForClass select). */
export interface ClassMistake {
  id: string;
  studentId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule: string | null;
  occurredAt: string;
}

/** `GET /students/:studentId/mistakes` (MistakesService.listForStudent select). */
export interface StudentMistake {
  id: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule: string | null;
  source: MistakeSource;
  confirmed: boolean;
  dismissedAt: string | null;
  occurredAt: string;
  lessonCardId: string | null;
  classId: string | null;
}

export interface StudentMistakeQuery {
  from?: string;
  to?: string;
  type?: MistakeType;
  limit?: number;
}

export type DismissMistakeResult = { dismissed: true } | { alreadyDismissed: true };

export interface ConfirmMistakeResult {
  id: string;
  confirmed: boolean;
  dismissedAt: string | null;
}

// ── Lesson cards ────────────────────────────────────────────────────────────

/** PortionDto. */
export interface LessonPortionInput {
  kind: PortionKind;
  fromSurah?: number;
  fromAyah?: number;
  toSurah?: number;
  toAyah?: number;
  grade?: Grade;
}

/** SubmitLessonCardDto. */
export interface SubmitLessonCardInput {
  homework?: string;
  parentNote?: string;
  portions: LessonPortionInput[];
}

/** UpdateLessonCardDto. */
export interface UpdateLessonCardInput {
  homework?: string;
  parentNote?: string;
  portions?: LessonPortionInput[];
  reason?: string;
}

/** `GET /classes/:classId/lesson-card/prefill` (LessonCardsService.prefill). */
export interface LessonCardPrefill {
  classId: string;
  course: { id: string; name: string };
  teacherName: string;
  classStartedAt: string;
  classEndedAt: string;
  mushafLayout: MushafLayout;
  pagesShown: { lastPage: number } | null;
  attendance: Array<{ studentId: string | null; minutesPresent: number }>;
  students: Array<{
    id: string;
    displayName: string;
    mistakes: PrefillMistake[];
  }>;
  mistakes: PrefillMistake[];
  primaryStudentId: string | null;
  portions: LessonPortionInput[];
  readyToSubmit: boolean;
}

export interface PrefillMistake {
  id: string;
  studentId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
}

export interface StoredPortion {
  id: string;
  kind: PortionKind;
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  grade: Grade | null;
}

/** `POST /classes/:classId/lesson-card` (LessonCardsService.submit select). */
export interface SubmittedLessonCard {
  id: string;
  submittedAt: string;
  portions: Array<StoredPortion & { lessonCardId: string; position: number }>;
}

/** `GET /lesson-cards/:id` (LessonCardsService.get). */
export interface LessonCard {
  id: string;
  classId: string;
  studentId: string;
  homework: string | null;
  parentNote: string | null;
  /** `null` for guardians until approved (FR-REC-05). */
  aiSummaryDraft: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  sharedAt: string | null;
  lockedAt: string | null;
  student: { id: string; displayName: string };
  /** The teacher's *user* (not teacher profile). */
  teacher: { id: string; name: string };
  portions: StoredPortion[];
  mistakes: Array<{
    id: string;
    surah: number;
    ayah: number;
    wordIndex: number;
    type: MistakeType;
    tajweedRule: string | null;
  }>;
  class: {
    id: string;
    startsAt: string;
    endsAt: string;
    mushafLayout: MushafLayout;
    tajweedColours: boolean;
    recording: { id: string; storageKey: string; status: string } | null;
  };
  locked: boolean;
}

/** `PATCH /lesson-cards/:id`. */
export interface UpdatedLessonCard {
  id: string;
  homework: string | null;
  parentNote: string | null;
  submittedAt: string | null;
  lockedAt: string | null;
  locked: boolean;
  loggedAsSupervisorEdit: boolean;
}

interface EditSnapshot {
  homework: string | null;
  parentNote: string | null;
  portions: Array<Partial<StoredPortion> & { kind: PortionKind }>;
}

/** `GET /lesson-cards/:id/edit-log` row. */
export interface LessonEditLogEntry {
  id: string;
  before: EditSnapshot | null;
  after: EditSnapshot | null;
  reason: string | null;
  editedAt: string;
  editor: { id: string; name: string };
}

export interface AiDraftResult {
  id: string;
  aiSummaryDraft: string | null;
  summaryApprovedAt: string | null;
}

const cls = (classId: string) => `/classes/${encodeURIComponent(classId)}`;
const card = (id: string) => `/lesson-cards/${encodeURIComponent(id)}`;

export const lessonsApi = {
  markMistake: (classId: string, body: MarkMistakeInput) =>
    http.post<MarkedMistake>(`${cls(classId)}/mistakes`, body),
  classMistakes: (classId: string) => http.get<ClassMistake[]>(`${cls(classId)}/mistakes`),
  studentMistakes: (studentId: string, query: StudentMistakeQuery = {}) =>
    http.get<StudentMistake[]>(`/students/${encodeURIComponent(studentId)}/mistakes`, { query: { ...query } }),
  dismissMistake: (mistakeId: string, reason?: string) =>
    http.post<DismissMistakeResult>(
      `/mistakes/${encodeURIComponent(mistakeId)}/dismiss`,
      reason ? { reason } : {},
    ),
  confirmMistake: (mistakeId: string) =>
    http.post<ConfirmMistakeResult>(`/mistakes/${encodeURIComponent(mistakeId)}/confirm`, {}),

  prefill: (classId: string) => http.get<LessonCardPrefill>(`${cls(classId)}/lesson-card/prefill`),
  submit: (classId: string, body: SubmitLessonCardInput) =>
    http.post<SubmittedLessonCard>(`${cls(classId)}/lesson-card`, body),
  get: (lessonCardId: string) => http.get<LessonCard>(card(lessonCardId)),
  update: (lessonCardId: string, body: UpdateLessonCardInput) =>
    http.patch<UpdatedLessonCard>(card(lessonCardId), body),
  editLog: (lessonCardId: string) => http.get<LessonEditLogEntry[]>(`${card(lessonCardId)}/edit-log`),
  saveAiDraft: (lessonCardId: string, draft: string) =>
    http.patch<AiDraftResult>(`${card(lessonCardId)}/ai-draft`, { draft }),
  approveAiDraft: (lessonCardId: string) =>
    http.post<{ approvedAt: string }>(`${card(lessonCardId)}/ai-draft/approve`, {}),
};

// ── Client-side validation (mirrors the class-validator DTOs) ────────────────

export type FieldErrors = Record<string, string>;

function parseIntStrict(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export interface MistakeDraft {
  studentId: string;
  surah: string;
  ayah: string;
  wordIndex: string;
  type: MistakeType | '';
  tajweedRule: string;
}

/** MarkMistakeDto + MistakesService.validatePosition. */
export function validateMistakeDraft(
  draft: MistakeDraft,
): { errors: FieldErrors; payload?: MarkMistakeInput } {
  const errors: FieldErrors = {};
  if (!draft.studentId) errors.studentId = 'Choose the student who made the mistake';

  const surah = parseIntStrict(draft.surah);
  if (surah === null || surah < 1 || surah > 114) errors.surah = 'Surah must be between 1 and 114';
  const ayah = parseIntStrict(draft.ayah);
  if (ayah === null || ayah < 1) errors.ayah = 'Ayah must be 1 or greater';
  const wordIndex = parseIntStrict(draft.wordIndex);
  if (wordIndex === null || wordIndex < 0) errors.wordIndex = 'Word position must be 0 or greater';

  if (!draft.type || !MISTAKE_TYPES.includes(draft.type)) errors.type = 'Choose a mistake type';
  const rule = draft.tajweedRule.trim();
  if (rule.length > TAJWEED_RULE_MAX) errors.tajweedRule = `Keep the rule under ${TAJWEED_RULE_MAX} characters`;

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    payload: {
      studentId: draft.studentId,
      surah: surah!,
      ayah: ayah!,
      wordIndex: wordIndex!,
      type: draft.type as MistakeType,
      ...(rule ? { tajweedRule: rule } : {}),
    },
  };
}

export interface PortionDraft {
  kind: PortionKind | '';
  fromSurah: string;
  fromAyah: string;
  toSurah: string;
  toAyah: string;
  grade: Grade | '';
}

export interface LessonCardDraft {
  homework: string;
  parentNote: string;
  portions: PortionDraft[];
}

export function portionToDraft(p: Partial<LessonPortionInput> | Partial<StoredPortion>): PortionDraft {
  const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return {
    kind: (p.kind as PortionKind) ?? '',
    fromSurah: s(p.fromSurah),
    fromAyah: s(p.fromAyah),
    toSurah: s(p.toSurah),
    toAyah: s(p.toAyah),
    grade: (p.grade as Grade) ?? '',
  };
}

export function emptyPortion(kind: PortionKind | '' = ''): PortionDraft {
  return { kind, fromSurah: '', fromAyah: '', toSurah: '', toAyah: '', grade: '' };
}

/**
 * SubmitLessonCardDto / PortionDto + LessonCardsService.validatePortions. One extra
 * sanity rule beyond the DTO: a range may not end before it starts.
 * Error keys: `portions`, `portions.<i>.<field>`, `homework`, `parentNote`.
 */
export function validateLessonCardDraft(
  draft: LessonCardDraft,
): { errors: FieldErrors; payload?: SubmitLessonCardInput } {
  const errors: FieldErrors = {};
  if (draft.homework.length > LESSON_TEXT_MAX) errors.homework = `Homework must be ${LESSON_TEXT_MAX} characters or fewer`;
  if (draft.parentNote.length > LESSON_TEXT_MAX) errors.parentNote = `The note must be ${LESSON_TEXT_MAX} characters or fewer`;
  if (draft.portions.length === 0) errors.portions = 'Add at least one portion (Sabaq, Sabqi or Manzil)';

  const portions: LessonPortionInput[] = [];
  draft.portions.forEach((p, i) => {
    const key = (f: string) => `portions.${i}.${f}`;
    if (!p.kind || !PORTION_KINDS.includes(p.kind)) errors[key('kind')] = 'Choose the portion type';

    const out: LessonPortionInput = { kind: p.kind as PortionKind };
    const nums: Array<[keyof PortionDraft & ('fromSurah' | 'toSurah' | 'fromAyah' | 'toAyah'), boolean]> = [
      ['fromSurah', true],
      ['fromAyah', false],
      ['toSurah', true],
      ['toAyah', false],
    ];
    for (const [field, isSurah] of nums) {
      const raw = p[field];
      if (raw.trim() === '') continue;
      const n = parseIntStrict(raw);
      if (isSurah) {
        if (n === null || n < 1 || n > 114) {
          errors[key(field)] = 'Surah must be between 1 and 114';
          continue;
        }
      } else if (n === null || n < 1) {
        errors[key(field)] = 'Ayah must be 1 or greater';
        continue;
      }
      out[field] = n;
    }
    if (p.grade) {
      if (!GRADES.includes(p.grade)) errors[key('grade')] = 'Choose a valid grade';
      else out.grade = p.grade;
    }

    if (
      out.fromSurah !== undefined &&
      out.toSurah !== undefined &&
      !errors[key('toSurah')] &&
      (out.toSurah < out.fromSurah ||
        (out.toSurah === out.fromSurah &&
          out.fromAyah !== undefined &&
          out.toAyah !== undefined &&
          out.toAyah < out.fromAyah))
    ) {
      errors[key('toSurah')] = 'The range ends before it starts';
    }
    portions.push(out);
  });

  if (Object.keys(errors).length > 0) return { errors };
  const homework = draft.homework.trim();
  const parentNote = draft.parentNote.trim();
  return {
    errors,
    payload: {
      ...(homework ? { homework } : {}),
      ...(parentNote ? { parentNote } : {}),
      portions,
    },
  };
}

/** `2:5` → `Surah 2, ayah 5`; tolerant of missing parts. */
export function formatRange(p: Partial<LessonPortionInput> | Partial<StoredPortion>): string {
  const pos = (s?: number | null, a?: number | null) =>
    s ? (a ? `${s}:${a}` : `Surah ${s}`) : a ? `ayah ${a}` : '';
  const from = pos(p.fromSurah, p.fromAyah);
  const to = pos(p.toSurah, p.toAyah);
  if (from && to && from !== to) return `${from} – ${to}`;
  return from || to || 'No range recorded';
}

/** Hours until the 48-hour lock, or 0 once locked. */
export function hoursUntilLock(submittedAt: string | null, now: number = Date.now()): number {
  if (!submittedAt) return LESSON_CARD_LOCK_HOURS;
  const lockAt = new Date(submittedAt).getTime() + LESSON_CARD_LOCK_HOURS * 3_600_000;
  return Math.max(0, Math.ceil((lockAt - now) / 3_600_000));
}

/**
 * The submitted lesson card for a class, or `null` when none has been submitted yet. The
 * list route (`GET /students/:id/lesson-cards`) doesn't return `classId`, so this asks the
 * staff-readable prefill route, which answers 409 with the card's id once one exists.
 */
export async function submittedLessonCardIdForClass(classId: string): Promise<string | null> {
  try {
    await lessonsApi.prefill(classId);
    return null;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 409) {
      const id = (error.details as { lessonCardId?: unknown } | undefined)?.lessonCardId;
      if (typeof id === 'string' && id) return id;
    }
    throw error;
  }
}
