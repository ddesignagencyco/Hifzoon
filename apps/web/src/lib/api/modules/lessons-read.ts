import { http } from '../http';

/** Guardian read access to lesson cards and mistakes (apps/api/src/modules/lessons). */

export type PortionKind = 'SABAQ' | 'SABQI' | 'MANZIL' | 'OTHER';
export type Grade = 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK' | 'REPEAT';
export type MistakeType =
  | 'LETTER_MAKHRAJ'
  | 'VOWEL_HARAKAH'
  | 'TAJWEED_RULE'
  | 'SKIPPED_WORD'
  | 'ADDED_WORD'
  | 'STOP_WAQF'
  | 'LETTER_RECOGNITION'
  | 'LETTER_JOINING'
  | 'READING_FLUENCY'
  | 'MEMORY'
  | 'MEANING'
  | 'VOCABULARY'
  | 'GRAMMAR'
  | 'UNDERSTANDING'
  | 'OTHER';

export const MISTAKE_TYPES: Array<{ value: MistakeType; label: string }> = [
  { value: 'LETTER_MAKHRAJ', label: 'Letter pronunciation (makhraj)' },
  { value: 'VOWEL_HARAKAH', label: 'Vowel (harakah)' },
  { value: 'TAJWEED_RULE', label: 'Tajweed rule' },
  { value: 'SKIPPED_WORD', label: 'Skipped word' },
  { value: 'ADDED_WORD', label: 'Added word' },
  { value: 'STOP_WAQF', label: 'Stopping (waqf)' },
  // Qaida, Duas, Arabic and Islamic Studies.
  { value: 'LETTER_RECOGNITION', label: 'Letter recognition' },
  { value: 'LETTER_JOINING', label: 'Joining letters' },
  { value: 'READING_FLUENCY', label: 'Reading fluency' },
  { value: 'MEMORY', label: 'Memory / recall' },
  { value: 'MEANING', label: 'Meaning' },
  { value: 'VOCABULARY', label: 'Vocabulary' },
  { value: 'GRAMMAR', label: 'Grammar' },
  { value: 'UNDERSTANDING', label: 'Understanding' },
  { value: 'OTHER', label: 'Other' },
];

export const PORTION_LABELS: Record<PortionKind, string> = {
  SABAQ: 'Sabaq (new lesson)',
  SABQI: 'Sabqi (recent revision)',
  MANZIL: 'Manzil (long revision)',
  OTHER: 'Other',
};

export interface LessonPortion {
  kind: PortionKind;
  fromSurah: number | null;
  fromAyah: number | null;
  toSurah: number | null;
  toAyah: number | null;
  grade: Grade | null;
  /** The Qaida lesson or dua chapter, for portions that are not an ayah range. */
  label?: string | null;
}

/** Row from `GET /students/:studentId/lesson-cards` (guardians only see shared cards). */
export interface LessonCardListItem {
  id: string;
  submittedAt: string | null;
  sharedAt: string | null;
  lockedAt: string | null;
  homework: string | null;
  student: { displayName: string };
  teacher: { name: string };
  /** The class the card is for; optional because older API builds did not send it. */
  class?: { startsAt: string; course: { id: string; name: string; code: string } | null };
  portions: LessonPortion[];
}

/** `GET /lesson-cards/:lessonCardId` (LessonCardsService.get). */
export interface LessonCardDetail {
  id: string;
  classId: string;
  studentId: string;
  homework: string | null;
  parentNote: string | null;
  /** Always null for guardians (FR-REC-05). */
  aiSummaryDraft: string | null;
  summaryApprovedAt: string | null;
  submittedAt: string | null;
  sharedAt: string | null;
  lockedAt: string | null;
  locked: boolean;
  student: { id: string; displayName: string };
  teacher: { id: string; name: string };
  portions: Array<LessonPortion & { id: string }>;
  mistakes: Array<{
    id: string;
    surah: number | null;
    ayah: number | null;
    wordIndex: number | null;
    itemRef?: string | null;
    note?: string | null;
    type: MistakeType;
    tajweedRule: string | null;
    /** Set once the teacher marked it fixed; older API builds omit it. */
    resolvedAt?: string | null;
  }>;
  class: {
    id: string;
    startsAt: string;
    endsAt: string;
    mushafLayout: string;
    tajweedColours: boolean;
    /** The course type (Qaida and Duas read from a board, not the Mushaf); older APIs omit it. */
    course?: { type: string } | null;
    recording: { id: string; storageKey: string; status: string } | null;
  };
}

/** Row from `GET /students/:studentId/mistakes`. */
export interface MistakeRecord {
  id: string;
  surah: number | null;
  ayah: number | null;
  wordIndex: number | null;
  itemRef?: string | null;
  note?: string | null;
  type: MistakeType;
  tajweedRule: string | null;
  source: 'CLASS' | 'AI';
  confirmed: boolean;
  dismissedAt: string | null;
  /** Set when the teacher heard it read correctly in a later class. */
  resolvedAt?: string | null;
  occurredAt: string;
  lessonCardId: string | null;
  classId: string | null;
}

export interface MistakeFilters {
  /** ISO date strings. */
  from?: string;
  to?: string;
  type?: MistakeType;
  limit?: number;
}

const enc = encodeURIComponent;

export const lessonsReadApi = {
  /** Teacher: the mistake was read correctly in a later class (`reopen`: it came back). */
  resolveMistake: (mistakeId: string, reopen = false) =>
    http.post<{ id: string; resolvedAt: string | null }>(
      `/mistakes/${encodeURIComponent(mistakeId)}/${reopen ? 'reopen' : 'resolve'}`,
      {},
    ),
  listForStudent: (studentId: string) =>
    http.get<LessonCardListItem[]>(`/students/${enc(studentId)}/lesson-cards`),
  get: (lessonCardId: string) => http.get<LessonCardDetail>(`/lesson-cards/${enc(lessonCardId)}`),
  mistakes: (studentId: string, filters: MistakeFilters = {}) =>
    http.get<MistakeRecord[]>(`/students/${enc(studentId)}/mistakes`, {
      query: { from: filters.from, to: filters.to, type: filters.type, limit: filters.limit },
    }),
};

export function mistakeLabel(type: string): string {
  return MISTAKE_TYPES.find((m) => m.value === type)?.label ?? type;
}

/** `2:255` or `2:255 – 3:10`, or the lesson's name (Qaida, Duas); null-safe for portions without a range. */
export function formatPortionRange(
  p: Pick<LessonPortion, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'> & { label?: string | null },
): string {
  if (p.label) return p.label;
  const from = p.fromSurah ? `${p.fromSurah}:${p.fromAyah ?? 1}` : null;
  const to = p.toSurah ? `${p.toSurah}:${p.toAyah ?? ''}`.replace(/:$/, '') : null;
  if (from && to && from !== to) return `${from} – ${to}`;
  return from ?? to ?? '—';
}
