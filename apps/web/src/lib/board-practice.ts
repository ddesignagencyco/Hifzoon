import type { DuaCategory, DuaItem } from '@/lib/api/modules/duas';
import type { AssignPracticeInput, PracticeBoard, PracticePassage } from '@/lib/api/modules/practice';
import { QAIDA_LESSONS, type QaidaLesson } from '@/lib/data/lesson-boards';
import { dateInDays, isMushafMistake, isOpenMistake, type MistakeLike } from '@/lib/mistakes-practice';

/**
 * Practice that is a board item instead of a surah/ayah range (see apps/api/src/modules/practice/
 * board.ts): a Hisn al-Muslim chapter, or one dua of it, for Duas; a Noorani Qaida lesson for Qaida.
 * Item references (on mistakes) are written the way the classroom's mistake logger writes them,
 * so marks from practice and from class read and match the same.
 */

export const NO_BOARD_AUDIO = 'No recitation audio for this lesson.';

/** The kind a board practice starts with: duas are learnt by heart, Qaida is read. */
export const BOARD_DEFAULT_MODE = { DUAS: 'MEMORISATION', QAIDA: 'READING' } as const;

/** The duas a practice covers: the one dua, or every dua of the chapter. */
export function practiceDuas(
  a: Pick<PracticePassage, 'board' | 'boardLesson' | 'boardItem'>,
  categories: DuaCategory[] | null | undefined,
): { chapter: DuaCategory; duas: DuaItem[] } | null {
  if (a.board !== 'DUAS' || !categories) return null;
  const chapter = categories.find((c) => c.id === a.boardLesson);
  if (!chapter) return null;
  if (a.boardItem === null || a.boardItem === undefined) return { chapter, duas: chapter.duas };
  const one = chapter.duas[a.boardItem];
  return one ? { chapter, duas: [one] } : null;
}

export function practiceQaidaLesson(a: Pick<PracticePassage, 'board' | 'boardLesson'>): QaidaLesson | null {
  if (a.board !== 'QAIDA' || !a.boardLesson) return null;
  return QAIDA_LESSONS[a.boardLesson - 1] ?? null;
}

/** "Before eating (2) · word 3 (بِسْمِ)": a tapped dua word, as the classroom names it. */
export function duaWordRef(dua: Pick<DuaItem, 'title'>, word: number, text: string): string {
  return `${dua.title} · word ${word} (${text})`;
}

/** "Tanween: بً": a Qaida tile, as the classroom names it. */
export function qaidaItemRef(lesson: Pick<QaidaLesson, 'title'>, item: string): string {
  return `${lesson.title}: ${item}`;
}

/** The word number (1-based) of a dua mark on this dua, or null (a whole-dua mark, another dua). */
export function markedDuaWord(itemRef: string | null | undefined, dua: Pick<DuaItem, 'title'>): number | null {
  if (!itemRef?.startsWith(`${dua.title} · word `)) return null;
  const n = /· word (\d+)/.exec(itemRef);
  return n ? Number(n[1]) : null;
}

/** The board lesson (and for Duas the dua index) a lesson-item mistake was logged on, or null. */
export function boardRefOfMistake(
  board: PracticeBoard,
  itemRef: string | null | undefined,
  categories: DuaCategory[] | null | undefined,
): { lesson: number; item: number | null } | null {
  const ref = itemRef?.trim();
  if (!ref) return null;
  if (board === 'QAIDA') {
    const index = QAIDA_LESSONS.findIndex((l) => ref === l.title || ref.startsWith(`${l.title}:`));
    return index >= 0 ? { lesson: index + 1, item: null } : null;
  }
  const title = ref.split(' · ')[0].trim();
  for (const c of categories ?? []) {
    const d = c.duas.findIndex((x) => x.title === title);
    if (d >= 0) return { lesson: c.id, item: d };
    if (c.title === title) return { lesson: c.id, item: null };
  }
  return null;
}

/**
 * "Make practice from mistakes" for a Qaida or Duas student: the lesson (dua chapter) with the most
 * open board mistakes (ties: the newest mistake). For Duas, when every one of them is on a single
 * dua, just that dua. Null when no open mistake names a lesson of this board.
 */
export function boardPracticeFromMistakes(
  studentId: string,
  board: PracticeBoard,
  rows: MistakeLike[],
  categories: DuaCategory[] | null | undefined,
  now = new Date(),
): AssignPracticeInput | null {
  const byLesson = new Map<number, { items: Set<number | null>; count: number; latest: number }>();
  for (const m of rows) {
    if (!isOpenMistake(m) || isMushafMistake(m)) continue;
    const ref = boardRefOfMistake(board, m.itemRef, categories);
    if (!ref) continue;
    const g = byLesson.get(ref.lesson) ?? { items: new Set<number | null>(), count: 0, latest: 0 };
    g.items.add(ref.item);
    g.count += 1;
    g.latest = Math.max(g.latest, Date.parse(m.occurredAt) || 0);
    byLesson.set(ref.lesson, g);
  }
  const best = [...byLesson.entries()].sort(([, a], [, b]) => b.count - a.count || b.latest - a.latest)[0];
  if (!best) return null;
  const [lesson, g] = best;
  const only = g.items.size === 1 ? [...g.items][0] : null;
  return {
    studentId,
    board,
    boardLesson: lesson,
    ...(board === 'DUAS' && only !== null && only !== undefined ? { boardItem: only } : {}),
    mode: BOARD_DEFAULT_MODE[board],
    targetMinutes: 15,
    dueOn: dateInDays(3, now),
  };
}

/** The title of a board practice before it is saved (the API stores the same as `label`). */
export function boardDraftLabel(
  board: PracticeBoard,
  lesson: number,
  item: number | null | undefined,
  categories: DuaCategory[] | null | undefined,
): string | null {
  if (board === 'QAIDA') return QAIDA_LESSONS[lesson - 1]?.title ?? null;
  const chapter = categories?.find((c) => c.id === lesson);
  if (!chapter) return null;
  return item === null || item === undefined ? chapter.title : (chapter.duas[item]?.title ?? null);
}
