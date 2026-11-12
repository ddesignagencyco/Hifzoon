import type { RedisService } from '../../redis/redis.service';

/**
 * What a live class actually went through — pages opened, the first and last ayah the
 * teacher highlighted, the board lessons shown — so the lesson card starts filled in
 * instead of blank. Kept beside the live state, but for three days: the card is written
 * after the class, and may be finished the next day.
 */
export interface ClassCoverage {
  pages: number[];
  /** surah * 1000 + ayah, so a plain min/max orders ayahs across surahs. */
  firstAyah: number | null;
  lastAyah: number | null;
  lessons: Array<{ board: 'QAIDA' | 'DUAS'; lesson: number }>;
}

const TTL_SECONDS = 3 * 86_400;

export const ayahOrder = (surah: number, ayah: number) => surah * 1000 + ayah;
export const fromAyahOrder = (value: number) => ({
  surah: Math.floor(value / 1000),
  ayah: value % 1000,
});

function coverageKey(redis: RedisService, classId: string) {
  return redis.key('classroom', classId, 'covered');
}

export async function readCoverage(
  redis: RedisService,
  classId: string,
): Promise<ClassCoverage | null> {
  return redis.getJson<ClassCoverage>(coverageKey(redis, classId));
}

/** Folds one event into the record. Best effort: a lost update costs a suggestion, never data. */
export async function recordCoverage(
  redis: RedisService,
  classId: string,
  event: { page?: number; ayah?: number; lesson?: { board: 'QAIDA' | 'DUAS'; lesson: number } },
): Promise<void> {
  const current = (await readCoverage(redis, classId)) ?? {
    pages: [],
    firstAyah: null,
    lastAyah: null,
    lessons: [],
  };
  if (event.page !== undefined && !current.pages.includes(event.page))
    current.pages.push(event.page);
  if (event.ayah !== undefined) {
    current.firstAyah =
      current.firstAyah === null ? event.ayah : Math.min(current.firstAyah, event.ayah);
    current.lastAyah =
      current.lastAyah === null ? event.ayah : Math.max(current.lastAyah, event.ayah);
  }
  const lesson = event.lesson;
  if (
    lesson &&
    !current.lessons.some((l) => l.board === lesson.board && l.lesson === lesson.lesson)
  ) {
    current.lessons.push(lesson);
  }
  await redis.setJson(coverageKey(redis, classId), current, TTL_SECONDS);
}
