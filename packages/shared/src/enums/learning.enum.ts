/**
 * Learning-domain enums: Hifz engine, mistakes, lesson records (ERD sections 2.7, 2.8).
 */

export enum PageState {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  FRAGILE = 'FRAGILE',
  SOLID = 'SOLID',
}

export enum Grade {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  NEEDS_WORK = 'NEEDS_WORK',
  REPEAT = 'REPEAT',
}

export enum PortionKind {
  SABAQ = 'SABAQ',
  SABQI = 'SABQI',
  MANZIL = 'MANZIL',
  OTHER = 'OTHER',
}

export enum MistakeType {
  LETTER_MAKHRAJ = 'LETTER_MAKHRAJ',
  VOWEL_HARAKAH = 'VOWEL_HARAKAH',
  TAJWEED_RULE = 'TAJWEED_RULE',
  SKIPPED_WORD = 'SKIPPED_WORD',
  ADDED_WORD = 'ADDED_WORD',
  STOP_WAQF = 'STOP_WAQF',
}

/** FR-REC-01 — the six in-class mistake categories teachers can log. */
export const MISTAKE_TYPES: readonly MistakeType[] = [
  MistakeType.LETTER_MAKHRAJ,
  MistakeType.VOWEL_HARAKAH,
  MistakeType.TAJWEED_RULE,
  MistakeType.SKIPPED_WORD,
  MistakeType.ADDED_WORD,
  MistakeType.STOP_WAQF,
];

export enum MistakeSource {
  CLASS = 'CLASS',
  AI = 'AI',
}

export enum DailyPlanStatus {
  PROPOSED = 'PROPOSED',
  ACCEPTED = 'ACCEPTED',
  CHANGED = 'CHANGED',
}

export enum HifzAlertType {
  BEHIND_GOAL = 'BEHIND_GOAL',
  MANZIL_DROP = 'MANZIL_DROP',
}

export enum GoalStatus {
  ACTIVE = 'ACTIVE',
  ACHIEVED = 'ACHIEVED',
  BEHIND = 'BEHIND',
  CANCELLED = 'CANCELLED',
}

/** FR-HFZ-01 — the Madani mushaf has exactly 604 pages. */
export const MUSHAF_PAGE_COUNT = 604;
export const MUSHAF_MIN_PAGE = 1;
export const MUSHAF_MAX_PAGE = MUSHAF_PAGE_COUNT;

export enum PracticeMode {
  READING = 'READING',
  MEMORISATION = 'MEMORISATION',
}
