/**
 * Scripted timeline for the homepage live-classroom demo (a passive, looping "video").
 * Verse text lives verbatim in ./verses.ts.
 */

import { AL_IKHLAS_AYAT } from './verses';

export type TajweedRule = 'qalqalah' | 'ghunnah' | 'idgham' | 'ikhfa' | 'madd';
export type MushafLayout = 'madani' | 'indopak';
export type Speaker = 'teacher' | 'student';

export interface Word {
  /** Index across the surah (0-based). */
  index: number;
  ayah: number;
  text: string;
  rule?: TajweedRule;
}

/** Tajweed colouring per word index (simplified for the demo overlay). */
const RULES: Record<number, TajweedRule> = {
  0: 'qalqalah',
  3: 'qalqalah',
  5: 'qalqalah',
  7: 'qalqalah',
  9: 'qalqalah',
  11: 'idgham',
  12: 'madd',
  14: 'qalqalah',
};

/** 4 + 2 + 4 + 5 = 15 words, split on spaces from the verbatim ayat. */
export const WORDS: Word[] = AL_IKHLAS_AYAT.flatMap((ayah, i) => ayah.split(' ').map((text) => ({ text, ayah: i + 1 })))
  .map((w, index) => ({ ...w, index, rule: RULES[index] }));

/** Which ayahs share a line, per Mushaf layout (gives the toggle a visible effect). */
export const LINES: Record<MushafLayout, number[][]> = {
  madani: [[1, 2], [3, 4]],
  indopak: [[1], [2, 3], [4]],
};

export const TAJWEED_LEGEND: { rule: TajweedRule; label: string }[] = [
  { rule: 'qalqalah', label: 'Qalqalah' },
  { rule: 'idgham', label: 'Idgham' },
  { rule: 'madd', label: 'Madd' },
];

export const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤'];

/** One tick = one word step of the teacher pointer. */
export const TICK_MS = 600;
/** 40 ticks × 600ms = 24s loop. */
export const LOOP_TICKS = 40;
/** The word the teacher taps to tag a mistake (last word of ayah 2). */
export const MISTAKE_SLOT = 5;
/** Tick shown when animation is disabled (prefers-reduced-motion). */
export const STATIC_TICK = 9;
/** Session timer starts at 18:42. */
export const TIMER_START_SECONDS = 18 * 60 + 42;

const LATENCIES = [142, 168, 131, 210, 186, 154, 239, 177, 128, 196, 312, 158, 221, 147];

export interface ChatMessage {
  /** Tick at which the message appears. */
  at: number;
  from: 'teacher' | 'parent';
  text: string;
}

export const CHAT_SCRIPT: ChatMessage[] = [
  { at: 1, from: 'teacher', text: "Assalamu alaikum Yusuf, let's revise Al-Ikhlas." },
  { at: 12, from: 'teacher', text: 'Mind the harakah on verse 2. Tagged it for you.' },
  { at: 22, from: 'parent', text: 'MashaAllah, much smoother today!' },
];


export interface DemoFrame {
  pointer: number | null;
  speaker: Speaker;
  layout: MushafLayout;
  tajweed: boolean;
  /** Teacher just tapped the slot (ripple) */
  tapping: boolean;
  popover: boolean;
  corrections: number;
  /** Parent's "MashaAllah" reaction bubble. */
  reaction: boolean;
  /** How many scripted chat messages are visible. */
  chatCount: number;
}

/**
 * Timeline (t = tick within loop):
 *  0–1   teacher greets, pointer idle
 *  2–7   student recites ayah 1–2, pointer walks slots 0–5
 *  8–11  teacher taps slot 5 → "mistake tagged" popover; logged at t=9
 * 12–20  student continues ayah 3–4 (slots 6–14)
 * 21–23  teacher speaks, switches to IndoPak 16-line at t=23
 * 24–38  revision pass over all slots (tajweed overlay off for 30–34)
 * 21–25  parent sends a "MashaAllah" reaction
 *   39   idle, layout back to Madani → loop restarts
 */
export function frameAt(t: number): DemoFrame {
  let pointer: number | null = null;
  if (t >= 2 && t <= 7) pointer = t - 2;
  else if (t >= 8 && t <= 11) pointer = MISTAKE_SLOT;
  else if (t >= 12 && t <= 20) pointer = t - 6;
  else if (t >= 24 && t <= 38) pointer = t - 24;

  const teacherSpeaking = t < 2 || (t >= 8 && t <= 11) || (t >= 21 && t <= 23) || t === 39;

  return {
    pointer,
    speaker: teacherSpeaking ? 'teacher' : 'student',
    layout: t >= 23 && t <= 38 ? 'indopak' : 'madani',
    tajweed: !(t >= 30 && t <= 34),
    tapping: t === 8,
    popover: t >= 8 && t <= 11,
    corrections: t >= 9 ? 1 : 0,
    reaction: t >= 21 && t <= 25,
    chatCount: CHAT_SCRIPT.filter((m) => t >= m.at).length,
  };
}

export function formatTimer(totalTicks: number): string {
  const secs = TIMER_START_SECONDS + Math.floor((totalTicks * TICK_MS) / 1000);
  const mm = Math.floor(secs / 60);
  const ss = secs % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Latency readout changes every ~2.4s, always 120–380ms. */
export function latencyAt(totalTicks: number): number {
  return LATENCIES[Math.floor(totalTicks / 4) % LATENCIES.length];
}

/** A correction logged on the lesson card. */
export interface SlotTag {
  id: number;
  slot: number;
  label: string;
  ayah: number;
}
