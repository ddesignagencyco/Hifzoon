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
  LETTER_RECOGNITION = 'LETTER_RECOGNITION',
  LETTER_JOINING = 'LETTER_JOINING',
  READING_FLUENCY = 'READING_FLUENCY',
  MEMORY = 'MEMORY',
  MEANING = 'MEANING',
  VOCABULARY = 'VOCABULARY',
  GRAMMAR = 'GRAMMAR',
  UNDERSTANDING = 'UNDERSTANDING',
  OTHER = 'OTHER',
}

/** FR-REC-01 — the six in-class mistake categories for recitation from the Mushaf. */
export const MISTAKE_TYPES: readonly MistakeType[] = [
  MistakeType.LETTER_MAKHRAJ,
  MistakeType.VOWEL_HARAKAH,
  MistakeType.TAJWEED_RULE,
  MistakeType.SKIPPED_WORD,
  MistakeType.ADDED_WORD,
  MistakeType.STOP_WAQF,
];

/**
 * Courses whose mistakes sit on a surah, ayah and word. Every other course logs against its
 * own lesson item or topic, with the categories in COURSE_MISTAKE_TYPES.
 */
export const MUSHAF_COURSE_TYPES: readonly string[] = [
  'HIFZ',
  'NAZRA',
  'TAJWEED',
  'MURAJAAH',
  'IJAZAH',
  'INTENSIVE',
  'TAFSIR',
];

/** The mistake categories a teacher may choose for each course that is not read from the Mushaf. */
export const COURSE_MISTAKE_TYPES: Readonly<Record<string, readonly MistakeType[]>> = {
  QAIDA: [
    MistakeType.LETTER_RECOGNITION,
    MistakeType.LETTER_MAKHRAJ,
    MistakeType.VOWEL_HARAKAH,
    MistakeType.LETTER_JOINING,
    MistakeType.READING_FLUENCY,
    MistakeType.OTHER,
  ],
  DUAS: [
    MistakeType.MEMORY,
    MistakeType.LETTER_MAKHRAJ,
    MistakeType.VOWEL_HARAKAH,
    MistakeType.MEANING,
    MistakeType.OTHER,
  ],
  ARABIC: [
    MistakeType.VOCABULARY,
    MistakeType.GRAMMAR,
    MistakeType.LETTER_MAKHRAJ,
    MistakeType.READING_FLUENCY,
    MistakeType.OTHER,
  ],
  ISLAMIC_STUDIES: [MistakeType.UNDERSTANDING, MistakeType.MEMORY, MistakeType.OTHER],
  NEW_MUSLIM: [
    MistakeType.UNDERSTANDING,
    MistakeType.MEMORY,
    MistakeType.LETTER_MAKHRAJ,
    MistakeType.OTHER,
  ],
};

/** Whether a course's mistakes are logged on the Mushaf (surah, ayah, word). Unknown types are. */
export function isMushafCourse(courseType: string | null | undefined): boolean {
  return !courseType || !(courseType in COURSE_MISTAKE_TYPES);
}

/** The categories offered for a course. */
export function mistakeTypesForCourse(
  courseType: string | null | undefined,
): readonly MistakeType[] {
  return isMushafCourse(courseType) ? MISTAKE_TYPES : COURSE_MISTAKE_TYPES[courseType as string];
}

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
