import hisnAlMuslim from '../../content/duas/hisn-al-muslim.json';

/**
 * Titles of the Noorani Qaida lessons, 1-based by position. Kept in step with QAIDA_LESSONS in
 * apps/web/src/lib/data/lesson-boards.ts, which also holds each lesson's items.
 */
export const QAIDA_LESSON_TITLES: readonly string[] = [
  'Huroof mufradat (single letters)',
  'Huroof murakkabat (joined letters)',
  'Huroof muqattaʿat',
  'Harakat (zabar, zer, pesh)',
  'Tanween',
  'Harakat and tanween practice',
  'Khari harakat (standing vowels)',
  'Huroof maddah (madd letters)',
  'Huroof leen (soft letters)',
  'Sukoon (jazm) practice',
  'Tashdeed',
  'Tashdeed with tashdeed',
  'Tashdeed and sukoon',
  'Sukoon after tashdeed',
  'Tashdeed after madd',
  'Noon saakin and tanween',
  'Letters written but not read',
];

const DUA_CHAPTERS: readonly string[] = [
  ...(hisnAlMuslim.categories as Array<{ id: number; title: { en: string } }>),
]
  .sort((a, b) => a.id - b.id)
  .map((c) => c.title.en);

/**
 * The title of a board lesson (1-based): the Qaida lesson, or the Hisn al-Muslim chapter as the
 * Duas board numbers them (by position, as GET /content/duas lists them). Undefined when unknown.
 */
export function boardLessonTitle(board: 'QAIDA' | 'DUAS', lesson: number): string | undefined {
  const titles = board === 'QAIDA' ? QAIDA_LESSON_TITLES : DUA_CHAPTERS;
  return titles[lesson - 1];
}
