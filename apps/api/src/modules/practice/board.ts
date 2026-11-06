import { COURSE_MISTAKE_TYPES } from '@hifzoon/shared';
import type { PracticeBoard } from '@prisma/client';

import hisnAlMuslim from '../../content/duas/hisn-al-muslim.json';
import { QAIDA_LESSON_TITLES } from '../content/board-lessons';

/**
 * Practice that is a board item instead of a surah/ayah range: a Hisn al-Muslim chapter (or one
 * dua of it) for Duas, a Noorani Qaida lesson for Qaida. Numbering follows the class board
 * (apps/web/src/lib/data/lesson-boards.ts): the Duas lesson is the chapter id, the dua is its
 * 0-based index in the chapter; the Qaida lesson is 1-based.
 */
export interface BoardRef {
  board: PracticeBoard;
  boardLesson: number;
  boardItem?: number | null;
}

interface Chapter {
  id: number;
  title: string;
  duas: string[];
}

const CHAPTERS: ReadonlyMap<number, Chapter> = new Map(
  (hisnAlMuslim.categories as Array<{ id: number; title: { en: string }; duas: unknown[] }>).map(
    (c) => [
      c.id,
      {
        id: c.id,
        title: c.title.en,
        // As GET /content/duas titles them: numbered when the chapter has several.
        duas: c.duas.map((_, i) => (c.duas.length > 1 ? `${c.title.en} (${i + 1})` : c.title.en)),
      },
    ],
  ),
);

/**
 * The label stored with a board practice: the dua (or chapter) title, or the Qaida lesson title.
 * Undefined when the reference does not exist.
 */
export function boardLabel(ref: BoardRef): string | undefined {
  if (ref.board === 'QAIDA') {
    if (ref.boardItem !== null && ref.boardItem !== undefined) return undefined;
    return QAIDA_LESSON_TITLES[ref.boardLesson - 1];
  }
  const chapter = CHAPTERS.get(ref.boardLesson);
  if (!chapter) return undefined;
  if (ref.boardItem === null || ref.boardItem === undefined) return chapter.title;
  return chapter.duas[ref.boardItem];
}

/** "Duas: Before eating", "Qaida: Lesson 3 — Huroof muqattaʿat", for notifications. */
export function boardDisplay(a: {
  board: PracticeBoard;
  boardLesson: number | null;
  label: string | null;
}) {
  return a.board === 'QAIDA'
    ? `Qaida: Lesson ${a.boardLesson ?? '?'}${a.label ? ` — ${a.label}` : ''}`
    : `Duas: ${a.label ?? `chapter ${a.boardLesson ?? '?'}`}`;
}

/**
 * The item references a teacher's mark may carry on this board practice. They name the dua (or
 * the Qaida lesson) the way the classroom's mistake logger does, e.g. "Before eating (2) · word 3
 * (بِسْمِ)" or "Tanween: بً", so marks from practice and from class read the same.
 */
export function allowedItemPrefixes(ref: BoardRef): string[] {
  if (ref.board === 'QAIDA') {
    const title = QAIDA_LESSON_TITLES[ref.boardLesson - 1];
    return title ? [title] : [];
  }
  const chapter = CHAPTERS.get(ref.boardLesson);
  if (!chapter) return [];
  if (ref.boardItem !== null && ref.boardItem !== undefined) {
    const one = chapter.duas[ref.boardItem];
    return one ? [one] : [];
  }
  return [...new Set([...chapter.duas, chapter.title])];
}

export function itemRefInBoard(itemRef: string, ref: BoardRef): boolean {
  const text = itemRef.trim();
  return allowedItemPrefixes(ref).some(
    (p) => text === p || text.startsWith(`${p} · `) || text.startsWith(`${p}: `),
  );
}

/** The mistake categories a board practice is marked with (the course's own). */
export function boardMistakeTypes(board: PracticeBoard): readonly string[] {
  return COURSE_MISTAKE_TYPES[board] ?? [];
}
