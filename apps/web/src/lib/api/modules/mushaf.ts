import { http } from '../http';

/**
 * Mushaf content (apps/api/src/modules/mushaf). Quran text only ever comes from the
 * licensed provider through these endpoints — the web app never generates, stores or
 * substitutes it (CR-11).
 */

/** `MushafLayout` from @hifzoon/shared. */
export type MushafLayout = 'MADANI_15' | 'INDOPAK_13' | 'INDOPAK_16';

export const MUSHAF_LAYOUTS: readonly MushafLayout[] = ['MADANI_15', 'INDOPAK_13', 'INDOPAK_16'];
export const MUSHAF_MIN_PAGE = 1;
export const MUSHAF_MAX_PAGE = 604;

/** Row from `GET /mushaf/layouts` (MushafService.layouts). */
export interface MushafLayoutInfo {
  layout: MushafLayout;
  linesPerPage: number;
  pageCount: number;
  minPage: number;
  maxPage: number;
}

export interface AyahRef {
  surah: number;
  ayah: number;
}

/** `GET /mushaf/pages/:layout/:page` (MushafService.getPage). */
export interface MushafPage {
  layout: MushafLayout;
  page: number;
  /** Each line lists the ayahs that *start* on it. */
  lines: Array<{ lineNumber: number; ayahs: AyahRef[] }>;
  surahStart: number;
  ayahStart: number;
  /** `false` = no content licence: render structure only, never substitute text. */
  licensed: boolean;
  source: string;
  cachedUntil: string;
}

/** `AyahWord` from the QuranContentProvider. */
export interface AyahWord {
  index: number;
  /** Licensed text, rendered verbatim. */
  text: string;
  tajweedRules: string[];
}

/** `GET /mushaf/ayah-words` (MushafService.getAyahWords). */
export interface AyahWords {
  surah: number;
  ayah: number;
  words: AyahWord[];
  licensed: boolean;
  source: string;
}

export const mushafApi = {
  layouts: () => http.get<MushafLayoutInfo[]>('/mushaf/layouts'),
  page: (layout: MushafLayout, page: number) =>
    http.get<MushafPage>(`/mushaf/pages/${encodeURIComponent(layout)}/${page}`),
  ayahWords: (params: { layout: MushafLayout; surah: number; ayah: number }) =>
    http.get<AyahWords>('/mushaf/ayah-words', { query: { ...params } }),
};

const LAYOUT_LABELS: Record<MushafLayout, string> = {
  MADANI_15: 'Madani (15-line)',
  INDOPAK_13: 'IndoPak (13-line)',
  INDOPAK_16: 'IndoPak (16-line)',
};

export function layoutLabel(layout: string | null | undefined): string {
  if (!layout) return '—';
  return LAYOUT_LABELS[layout as MushafLayout] ?? layout;
}

export function isValidPage(page: number): boolean {
  return Number.isInteger(page) && page >= MUSHAF_MIN_PAGE && page <= MUSHAF_MAX_PAGE;
}

/** Clamps any number into the Mushaf page range. */
export function clampPage(page: number): number {
  if (!Number.isFinite(page)) return MUSHAF_MIN_PAGE;
  return Math.min(MUSHAF_MAX_PAGE, Math.max(MUSHAF_MIN_PAGE, Math.trunc(page)));
}

/**
 * Distinct, valid ayah references on a page, in reading order. Invalid references
 * (surah outside 1..114, ayah < 1) are dropped because the words endpoint would 400.
 */
export function ayahsOnPage(page: Pick<MushafPage, 'lines'> | null | undefined): AyahRef[] {
  if (!page) return [];
  const seen = new Set<string>();
  const out: AyahRef[] = [];
  for (const line of page.lines) {
    for (const ref of line.ayahs) {
      if (!Number.isInteger(ref.surah) || ref.surah < 1 || ref.surah > 114) continue;
      if (!Number.isInteger(ref.ayah) || ref.ayah < 1) continue;
      const key = `${ref.surah}:${ref.ayah}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ surah: ref.surah, ayah: ref.ayah });
    }
  }
  return out;
}

/** Western digits → Arabic-Indic digits for ayah end markers. */
export function toArabicDigits(value: number): string {
  return String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}
