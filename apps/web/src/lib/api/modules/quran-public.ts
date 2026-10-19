/**
 * Public Quran text for environments without a licensed provider (backend M44 deferred).
 *
 * The API's development provider ("fake") returns page *structure* only, so the classroom
 * showed ayah numbers without text. Until the licensed `quran_foundation` adapter is
 * configured, the web reads the Madani (604-page, 15-line) page from the public Quran.com
 * API — Uthmani script with the real line layout. It is clearly attributed on screen, and
 * it switches off by itself as soon as the API reports `licensed: true`.
 *
 * Disable with NEXT_PUBLIC_QURAN_TEXT_FALLBACK=off.
 */

export const QURAN_PUBLIC_SOURCE = 'Quran.com';
const ENDPOINT = 'https://api.quran.com/api/v4/verses/by_page';

export function publicQuranTextEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QURAN_TEXT_FALLBACK !== 'off';
}

export interface PublicQuranWord {
  surah: number;
  ayah: number;
  /** 0-based position within the ayah — the same index mistakes are logged against. */
  wordIndex: number;
  text: string;
  /** The ayah-end marker (number in a circle) rather than a word. */
  isAyahEnd: boolean;
}

export interface PublicQuranPage {
  page: number;
  /** Lines in reading order; surah-name / bismillah lines carry no words and are omitted. */
  lines: Array<{ lineNumber: number; words: PublicQuranWord[] }>;
  source: typeof QURAN_PUBLIC_SOURCE;
}

interface ApiWord {
  position: number;
  char_type_name: string;
  text_uthmani: string;
  line_number: number;
}
interface ApiVerse {
  verse_key: string;
  words: ApiWord[];
}

export function toPublicPage(page: number, verses: ApiVerse[]): PublicQuranPage {
  const byLine = new Map<number, PublicQuranWord[]>();
  for (const v of verses) {
    const [surah, ayah] = v.verse_key.split(':').map(Number);
    for (const w of v.words) {
      if (w.char_type_name !== 'word' && w.char_type_name !== 'end') continue;
      const list = byLine.get(w.line_number) ?? [];
      list.push({ surah, ayah, wordIndex: w.position - 1, text: w.text_uthmani, isAyahEnd: w.char_type_name === 'end' });
      byLine.set(w.line_number, list);
    }
  }
  const lines = [...byLine.entries()].sort(([a], [b]) => a - b).map(([lineNumber, words]) => ({ lineNumber, words }));
  return { page, lines, source: QURAN_PUBLIC_SOURCE };
}

export async function fetchPublicQuranPage(page: number): Promise<PublicQuranPage> {
  const url = `${ENDPOINT}/${page}?words=true&word_fields=text_uthmani,line_number&per_page=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Quran.com returned ${res.status} for page ${page}`);
  const json = (await res.json()) as { verses?: ApiVerse[] };
  return toPublicPage(page, json.verses ?? []);
}
