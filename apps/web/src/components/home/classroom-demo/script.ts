/**
 * Scripted timeline for the homepage live-classroom demo (a passive, looping "video").
 * Verse text lives verbatim in ./verses.ts. Every step mirrors a real classroom feature:
 * Recheck mistakes (Mark fixed), logging a mistake by tapping a word, word meanings in
 * English / Urdu, and the lesson card with homework and a practice set for home.
 */

import { AL_IKHLAS_AYAT } from './verses';

export type Speaker = 'teacher' | 'student';
export type Scene = 'recheck' | 'log' | 'card';

export interface Word {
  /** Index across the surah (0-based). */
  index: number;
  ayah: number;
  text: string;
}

/** 4 + 2 + 4 + 5 = 15 words, split on spaces from the verbatim ayat. */
export const WORDS: Word[] = AL_IKHLAS_AYAT.flatMap((ayah, i) => ayah.split(' ').map((text) => ({ text, ayah: i + 1 }))).map(
  (w, index) => ({ ...w, index }),
);

/** Which ayahs share a line on the demo page (the two short ayahs share the first). */
export const LINES: number[][] = [[1, 2], [3], [4]];

export const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤'];

/** One tick = one word step of the class highlight. */
export const TICK_MS = 600;
/** 44 ticks × 600ms ≈ 26s loop. */
export const LOOP_TICKS = 44;
/** The word the teacher taps to log a mistake today (last word of ayah 2). */
export const MISTAKE_SLOT = 5;
/** A mistake from the previous class, rechecked first (كُفُوًا, ayah 4). */
export const RECHECK_SLOT = 13;
/** Tick shown when animation is disabled (prefers-reduced-motion): mistake logged, meaning open. */
export const STATIC_TICK = 19;
/** Session timer starts at 18:42. */
export const TIMER_START_SECONDS = 18 * 60 + 42;

export const TODAY_MISTAKE = { slot: MISTAKE_SLOT, ref: '112:2', type: 'Vowel / harakah' } as const;
export const EARLIER_MISTAKE = { slot: RECHECK_SLOT, ref: '112:4', type: 'Letter / makhraj' } as const;
/** Word meaning shown for the tapped word (English and Urdu, as in the classroom). */
export const MEANING = { en: 'the Eternal Refuge', ur: 'بے نیاز' } as const;

export interface DemoFrame {
  /** Word the class highlight is on (teacher and student see the same page). */
  pointer: number | null;
  speaker: Speaker;
  /** What the teacher's side panel shows. */
  scene: Scene;
  /** "Mark fixed" is being pressed on the earlier mistake. */
  pressing: boolean;
  /** The earlier mistake has been marked fixed. */
  fixed: boolean;
  /** Teacher just tapped the word (ripple). */
  tapping: boolean;
  /** Today's mistake is logged. */
  logged: boolean;
  /** Word meaning strip is open for the tapped word. */
  meaning: boolean;
  /** How many lesson-card rows are filled in (0–4). */
  cardRows: number;
}

/**
 * Timeline (t = tick within loop):
 *  0–1   teacher greets; panel shows Recheck mistakes from the last class
 *  2–4   student re-reads the earlier mistake (highlight on كُفُوًا)
 *   5    teacher presses Mark fixed → fixed from t=6
 * 10–15  sabaq: highlight walks ayah 1–2 (words 0–5)
 *  16    teacher taps ٱلصَّمَدُ → mistake logged (Vowel / harakah)
 * 17–24  word meaning (English / Urdu) open for the tapped word
 * 21–29  student finishes ayah 3–4 (words 6–14)
 * 30–43  lesson card fills in: sabaq, mistakes, homework, practice set
 */
export function frameAt(t: number): DemoFrame {
  let pointer: number | null = null;
  if (t >= 2 && t <= 5) pointer = RECHECK_SLOT;
  else if (t >= 10 && t <= 15) pointer = t - 10;
  else if (t >= 16 && t <= 20) pointer = MISTAKE_SLOT;
  else if (t >= 21 && t <= 29) pointer = t - 15;

  const teacherSpeaking = t < 2 || t === 5 || (t >= 16 && t <= 20) || t >= 30;

  return {
    pointer,
    speaker: teacherSpeaking ? 'teacher' : 'student',
    scene: t < 10 ? 'recheck' : t < 30 ? 'log' : 'card',
    pressing: t === 5,
    fixed: t >= 6,
    tapping: t === 16,
    logged: t >= 16,
    meaning: t >= 17 && t <= 24,
    cardRows: t < 30 ? 0 : Math.min(4, 1 + Math.floor((t - 30) / 2)),
  };
}

export function formatTimer(totalTicks: number): string {
  const secs = TIMER_START_SECONDS + Math.floor((totalTicks * TICK_MS) / 1000);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
