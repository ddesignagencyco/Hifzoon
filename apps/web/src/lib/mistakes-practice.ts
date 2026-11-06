import { http } from '@/lib/api/http';
import type { AssignPracticeInput } from '@/lib/api/modules/practice';

/**
 * The "mistake → practise at home → recite again → resolved" loop.
 *
 * A mistake is open while it is confirmed, not dismissed and not resolved. Mushaf mistakes
 * (surah and ayah set) are practised by listening and reading; the rest (Qaida, Duas, Arabic)
 * carry an item reference or a note.
 */
export interface MistakeLike {
  id: string;
  surah: number | null;
  ayah: number | null;
  wordIndex: number | null;
  itemRef?: string | null;
  note?: string | null;
  type: string;
  confirmed: boolean;
  dismissedAt: string | null;
  resolvedAt?: string | null;
  occurredAt: string;
  classId: string | null;
}

export type MushafMistake<M extends MistakeLike = MistakeLike> = M & { surah: number; ayah: number };

export function isOpenMistake(m: MistakeLike): boolean {
  return m.confirmed && !m.dismissedAt && !m.resolvedAt;
}

export function isMushafMistake<M extends MistakeLike>(m: M): m is MushafMistake<M> {
  return m.surah !== null && m.ayah !== null;
}

const newestFirst = (a: MistakeLike, b: MistakeLike) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt);

/** Open Mushaf mistakes and open lesson-item mistakes, each newest first. */
export function splitOpenMistakes<M extends MistakeLike>(rows: M[]) {
  const open = rows.filter(isOpenMistake).sort(newestFirst);
  return {
    mushaf: open.filter(isMushafMistake) as Array<MushafMistake<M>>,
    items: open.filter((m) => !isMushafMistake(m)),
  };
}

/** `surah:ayah` as one comparable number (no surah has 1000 ayahs). */
const ayahOrder = (surah: number, ayah: number) => surah * 1000 + ayah;

/**
 * The open mistakes a recitation of this passage can settle, oldest first: Mushaf mistakes whose
 * surah:ayah falls inside the range. With no usable surah range, every open mistake.
 */
export function mistakesInPassage<M extends MistakeLike>(
  rows: M[],
  range: { fromSurah?: number | null; fromAyah?: number | null; toSurah?: number | null; toAyah?: number | null } | null,
): M[] {
  const open = rows.filter(isOpenMistake).sort((a, b) => -newestFirst(a, b));
  const { fromSurah, fromAyah, toSurah, toAyah } = range ?? {};
  if (!fromSurah || !fromAyah || !toSurah || !toAyah) return open;
  const from = ayahOrder(fromSurah, fromAyah);
  const to = ayahOrder(toSurah, toAyah);
  return open.filter((m) => isMushafMistake(m) && ayahOrder(m.surah, m.ayah) >= from && ayahOrder(m.surah, m.ayah) <= to);
}

export interface AyahGroup<M extends MistakeLike = MistakeLike> {
  surah: number;
  ayah: number;
  /** Newest first. */
  mistakes: Array<MushafMistake<M>>;
  latestAt: string;
}

/** One row per ayah, the ayah with the newest mistake first. */
export function groupByAyah<M extends MistakeLike>(rows: Array<MushafMistake<M>>): Array<AyahGroup<M>> {
  const groups = new Map<string, AyahGroup<M>>();
  for (const m of [...rows].sort(newestFirst)) {
    const key = `${m.surah}:${m.ayah}`;
    const g = groups.get(key);
    if (g) g.mistakes.push(m);
    else groups.set(key, { surah: m.surah, ayah: m.ayah, mistakes: [m], latestAt: m.occurredAt });
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

/** Most ayahs a "practice from mistakes" passage covers: one short sitting. */
export const MISTAKE_PRACTICE_MAX_AYAHS = 10;

/**
 * The passage to practise for a set of open Mushaf mistakes.
 *
 * The surah with the most open mistakes (ties: the one with the newest mistake), then the
 * 10-ayah stretch of it holding the most mistakes (ties: the one with the newest mistake),
 * trimmed to the first and last mistaken ayah in it. So a passage never crosses surahs and is
 * never longer than one sitting, however scattered the mistakes are.
 */
export function practiceRangeFromMistakes(
  rows: MistakeLike[],
  maxAyahs = MISTAKE_PRACTICE_MAX_AYAHS,
): { fromSurah: number; fromAyah: number; toSurah: number; toAyah: number } | null {
  const open = rows.filter(isOpenMistake).filter(isMushafMistake);
  if (open.length === 0) return null;

  const latest = (ms: MistakeLike[]) => Math.max(...ms.map((m) => Date.parse(m.occurredAt)));
  const bySurah = new Map<number, Array<MushafMistake>>();
  for (const m of open) bySurah.set(m.surah, [...(bySurah.get(m.surah) ?? []), m]);
  const [surah, inSurah] = [...bySurah.entries()].sort(
    ([, a], [, b]) => b.length - a.length || latest(b) - latest(a),
  )[0];

  let best: { from: number; to: number; count: number; latest: number } | null = null;
  for (const start of new Set(inSurah.map((m) => m.ayah))) {
    const inWindow = inSurah.filter((m) => m.ayah >= start && m.ayah < start + maxAyahs);
    const candidate = {
      from: start,
      to: Math.max(...inWindow.map((m) => m.ayah)),
      count: inWindow.length,
      latest: latest(inWindow),
    };
    if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.latest > best.latest)) {
      best = candidate;
    }
  }
  return { fromSurah: surah, fromAyah: best!.from, toSurah: surah, toAyah: best!.to };
}

/** `YYYY-MM-DD`, `days` from `now` in the viewer's calendar (what the API's dueOn expects). */
export function dateInDays(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The practice assignment the "Make practice from mistakes" button creates, or null. */
export function practiceFromMistakes(studentId: string, rows: MistakeLike[], now = new Date()): AssignPracticeInput | null {
  const range = practiceRangeFromMistakes(rows);
  if (!range) return null;
  return { studentId, ...range, mode: 'READING', targetMinutes: 15, dueOn: dateInDays(3, now) };
}

/** The reader link for an ayah, with the open mistakes underlined. */
export function readerHref(base: '/parent/quran' | '/student/quran', surah: number, ayah: number, studentId?: string) {
  const q = new URLSearchParams({ surah: String(surah), ayah: String(ayah), marks: '1' });
  if (studentId) q.set('student', studentId);
  return `${base}?${q.toString()}`;
}

export const mistakesPracticeApi = {
  /** 501 when the deployment has no licensed Quran provider. */
  ayahAudio: (surah: number, ayah: number) =>
    http.get<{ surah: number; ayah: number; url: string }>('/mushaf/ayah-audio', {
      query: { surah: String(surah), ayah: String(ayah) },
    }),
  pageOf: (surah: number, ayah: number) =>
    http.get<{ page: number }>('/mushaf/page-of', { query: { surah: String(surah), ayah: String(ayah) } }),
};
