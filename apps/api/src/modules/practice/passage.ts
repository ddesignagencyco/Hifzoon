/** Ayahs in each surah, Hafs numbering (6,236 in all). Index 0 is Al-Fatihah. */
export const AYAH_COUNTS: readonly number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/**
 * A practice session covers one sitting, so scoring and the reference recitation stop here
 * however long the assigned passage is. Whisper takes up to 25 MB, roughly this much.
 */
export const MAX_PRACTICE_AYAHS = 40;

export interface PassageRange {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
}

/** The ayahs of a passage in reading order, across surah boundaries, at most `max` of them. */
export function ayahsInRange(
  range: PassageRange,
  max = MAX_PRACTICE_AYAHS,
): { ayahs: Array<{ surah: number; ayah: number }>; truncated: boolean } {
  const ayahs: Array<{ surah: number; ayah: number }> = [];
  let surah = range.fromSurah;
  let ayah = range.fromAyah;
  while (surah < range.toSurah || (surah === range.toSurah && ayah <= range.toAyah)) {
    const count = AYAH_COUNTS[surah - 1];
    if (count === undefined) break;
    if (ayah > count) {
      surah += 1;
      ayah = 1;
      continue;
    }
    if (ayahs.length === max) return { ayahs, truncated: true };
    ayahs.push({ surah, ayah });
    ayah += 1;
  }
  return { ayahs, truncated: false };
}
