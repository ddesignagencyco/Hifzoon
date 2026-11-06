/**
 * Imports Hisn al-Muslim ("Fortress of the Muslim", Sa'id ibn Ali ibn Wahf al-Qahtani) from the
 * public JSON API of hisnmuslim.com into a versioned file the API serves as GET /content/duas.
 *
 * Run once, by hand, when the content should be refreshed (the output is committed):
 *   npx ts-node scripts/import-hisn-al-muslim.ts
 *
 * The source publishes Arabic and English only (Arabic text, English transliteration, English
 * translation, repeat count). Nothing is translated or written here: the text is copied as
 * published, with only the wrapping brackets and stray whitespace removed. Urdu is left out
 * because no Urdu edition with clear terms could be found.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = 'https://www.hisnmuslim.com/api';
const OUT = join(__dirname, '..', 'src', 'content', 'duas', 'hisn-al-muslim.json');

interface IndexEntry {
  ID: number;
  TITLE: string;
  TEXT: string;
}
interface SourceDua {
  ID: number;
  ARABIC_TEXT: string;
  LANGUAGE_ARABIC_TRANSLATED_TEXT: string;
  TRANSLATED_TEXT: string;
  REPEAT: number;
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url.replace(/^http:/, 'https:'));
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      // The files start with a byte-order mark and some carry trailing commas or tabs.
      const text = (await res.text()).replace(/^\uFEFF/, '');
      try {
        return JSON.parse(text) as T;
      } catch {
        // One chapter file (en/126) has its title key left unterminated: `{ "Title: \n [`.
        return JSON.parse(text.replace(/^\s*\{\s*"([^"\r\n]*?):?\s*\r?\n/, '{"$1":\n')) as T;
      }
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** True when every bracket in `text` is closed in order. */
function balanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Drops the brackets the source wraps each text in, and normalises whitespace. */
export function clean(text: string | null | undefined): string {
  let t = (text ?? '').replace(/\s+/g, ' ').trim();
  // "( ... )", "( ... ).", "(. ... )", "(( ... ))."
  for (let i = 0; i < 3; i++) {
    const m = /^\(\s*\.?\s*([\s\S]*?)\s*\)\s*\.?$/.exec(t);
    if (!m || !balanced(m[1])) break;
    t = m[1].trim();
  }
  return t;
}

/**
 * Corrections to slips in the source files, each checked against the Arabic. A translation that
 * contradicts the Arabic is dropped rather than rewritten: we do not write our own.
 */
/** Entries whose English translation sits in the transliteration field (a duplicated key). */
const TRANSLATION_IN_TRANSLITERATION = new Set([133, 185]);

const DROP_TRANSLATION = new Set([
  // Arabic: "If one of you is invited, let him respond…"; the source English says "not invited".
  185,
]);

/**
 * The transliteration field sometimes holds a pointer to the Quran instead
 * ("From Verse 3:190 till the end of the chapter Al-Imran"); that is a reference, not a reading.
 */
function isQuranPointer(text: string): boolean {
  return (
    /\b(verse|verses|surah|surat|chapter)\b/i.test(text) && /\d/.test(text) && text.length < 200
  );
}

async function main() {
  const [enIndex, arIndex] = await Promise.all([
    getJson<{ English: IndexEntry[] }>(`${BASE}/en/husn_en.json`),
    getJson<Record<string, IndexEntry[]>>(`${BASE}/ar/husn_ar.json`),
  ]);
  const arEntries = Object.values(arIndex)[0];
  const arTitles = new Map(arEntries.map((e) => [e.ID, e.TITLE.trim()]));
  const chapters = [...enIndex.English].sort((a, b) => a.ID - b.ID);

  const categories = [];
  for (const chapter of chapters) {
    const [en, ar] = await Promise.all([
      getJson<Record<string, SourceDua[]>>(`${BASE}/en/${chapter.ID}.json`),
      getJson<Record<string, SourceDua[]>>(`${BASE}/ar/${chapter.ID}.json`),
    ]);
    const enDuas = Object.values(en)[0] ?? [];
    const arById = new Map((Object.values(ar)[0] ?? []).map((d) => [d.ID, d]));
    const title = clean(chapter.TITLE);
    categories.push({
      id: chapter.ID,
      title: {
        en: title.charAt(0).toUpperCase() + title.slice(1),
        ar: arTitles.get(chapter.ID) ?? '',
      },
      duas: enDuas.map((d) => {
        let translit = clean(d.LANGUAGE_ARABIC_TRANSLATED_TEXT);
        let translation = clean(d.TRANSLATED_TEXT);
        // Two entries (133, 185) carry the English translation in the transliteration field.
        if (TRANSLATION_IN_TRANSLITERATION.has(d.ID) && !translation) {
          translation = translit;
          translit = '';
        }
        if (DROP_TRANSLATION.has(d.ID)) translation = '';
        const pointer = isQuranPointer(translit);
        return {
          id: d.ID,
          arabic: clean(arById.get(d.ID)?.ARABIC_TEXT || d.ARABIC_TEXT),
          // The source writes the letter ʿayn as "AA" (as Tanzil does).
          transliteration: pointer ? '' : translit.replace(/AA/g, 'ʿ'),
          translation: { en: translation },
          repeat: d.REPEAT || 1,
          reference: pointer ? `Hisn al-Muslim ${d.ID} · ${translit}` : `Hisn al-Muslim ${d.ID}`,
        };
      }),
    });
  }

  const out = {
    source: {
      name: 'Hisn al-Muslim (Fortress of the Muslim)',
      author: "Sa'id ibn Ali ibn Wahf al-Qahtani",
      url: 'https://www.hisnmuslim.com/api/husn.json',
      languages: ['ar', 'en'],
      importedAt: new Date().toISOString().slice(0, 10),
    },
    categories,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n', 'utf8');
  const count = categories.reduce((n, c) => n + c.duas.length, 0);
  console.log(`Wrote ${categories.length} categories, ${count} duas to ${OUT}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
