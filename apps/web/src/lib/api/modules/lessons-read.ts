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
  | 'STOP_WAQF';

export const MISTAKE_TYPES: Array<{ value: MistakeType; label: string }> = [
  { value: 'LETTER_MAKHRAJ', label: 'Letter pronunciation (makhraj)' },
  { value: 'VOWEL_HARAKAH', label: 'Vowel (harakah)' },
  { value: 'TAJWEED_RULE', label: 'Tajweed rule' },
  { value: 'SKIPPED_WORD', label: 'Skipped word' },
  { value: 'ADDED_WORD', label: 'Added word' },
  { value: 'STOP_WAQF', label: 'Stopping (waqf)' },
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
    mushafLayout: string;
    tajweedColours: boolean;
    recording: { id: string; storageKey: string; status: string } | null;
  };
}

/** Row from `GET /students/:studentId/mistakes`. */
export interface MistakeRecord {
  id: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule: string | null;
  source: 'CLASS' | 'AI';
  confirmed: boolean;
  dismissedAt: string | null;
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

/** `2:255` or `2:255 – 3:10`; null-safe for portions without a range. */
export function formatPortionRange(p: Pick<LessonPortion, 'fromSurah' | 'fromAyah' | 'toSurah' | 'toAyah'>): string {
  const from = p.fromSurah ? `${p.fromSurah}:${p.fromAyah ?? 1}` : null;
  const to = p.toSurah ? `${p.toSurah}:${p.toAyah ?? ''}`.replace(/:$/, '') : null;
  if (from && to && from !== to) return `${from} – ${to}`;
  return from ?? to ?? '—';
}
