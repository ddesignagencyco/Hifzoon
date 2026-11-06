/**
 * What a Qaida or Duas class reads from, in place of the Mushaf.
 *
 * QAIDA: the 17 lessons (takhtis) of the Noorani Qaida as taught in class. Letter and syllable
 * drills are built here from the alphabet and the vowel marks, so every tile is correct by
 * construction; the word lessons use well-known Quranic words, each with its surah:ayah.
 * Lesson names after 14 differ between printed editions; ours follow the common Urdu-medium order.
 *
 * DUAS: Hisn al-Muslim, served by the API (`GET /content/duas`, see lib/api/modules/duas.ts).
 * A dua lesson is a chapter (1-based) and the item is the dua's index within it.
 */
import type { DuaCategory } from '@/lib/api/modules/duas';

export type LessonBoardKind = 'QAIDA' | 'DUAS';

export interface QaidaLesson {
  title: string;
  /** What the lesson teaches, in a line, for the teacher and parents. */
  aim: string;
  /** Arabic items read one at a time; each is one tile on the board. */
  items: string[];
  /** Where each word item is found in the Quran (same order as `items`), for word lessons. */
  refs?: string[];
  /** Tile size: large for single letters, small for words. */
  size?: 'lg' | 'md' | 'sm';
}

// The marks, by name, so the drills read clearly.
const FATHA = 'َ';
const KASRA = 'ِ';
const DAMMA = 'ُ';
const FATHATAN = 'ً';
const KASRATAN = 'ٍ';
const DAMMATAN = 'ٌ';
const SUKOON = 'ْ';
const SHADDA = 'ّ';
/** Khari zabar (standing fatha), khari zer (standing kasra), ulta pesh (inverted damma). */
const KHARI_ZABAR = 'ٰ';
const KHARI_ZER = 'ٖ';
const ULTA_PESH = 'ٗ';

/** The 29 letters of Lesson 1, in Qaida order. */
export const QAIDA_LETTERS = [
  'ا',
  'ب',
  'ت',
  'ث',
  'ج',
  'ح',
  'خ',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ع',
  'غ',
  'ف',
  'ق',
  'ك',
  'ل',
  'م',
  'ن',
  'و',
  'ه',
  'ء',
  'ي',
];
/** Letters that carry a vowel (alif carries none; hamza does). */
const VOWELLED = QAIDA_LETTERS.filter((l) => l !== 'ا');
/** Letters that join on to the next one. */
const CONNECTORS = QAIDA_LETTERS.filter((l) => !['ا', 'د', 'ذ', 'ر', 'ز', 'و', 'ء'].includes(l));
/** Letters used before a madd, leen, sukoon or shadda drill (hamza and alif sit out). */
const BASE = QAIDA_LETTERS.filter((l) => l !== 'ا' && l !== 'ء');

const eachWith = (letters: string[], marks: string[]) =>
  letters.flatMap((l) => marks.map((m) => `${l}${m}`));

/** Three letters in a row, each with its own vowel and tanween on the last: harakat + tanween practice. */
function harakatTanweenDrill(): string[] {
  const vowels = [FATHA, KASRA, DAMMA];
  const tanween = [FATHATAN, KASRATAN, DAMMATAN];
  return VOWELLED.map((_, i) => {
    const [a, b, c] = [0, 1, 2].map((k) => VOWELLED[(i + k) % VOWELLED.length]);
    return `${a}${vowels[i % 3]}${b}${vowels[(i + 1) % 3]}${c}${tanween[(i + 2) % 3]}`;
  });
}

/** Lesson items with their Quran references, kept side by side. */
function words(list: Array<[string, string]>): Pick<QaidaLesson, 'items' | 'refs'> {
  return { items: list.map(([w]) => w), refs: list.map(([, r]) => r) };
}

export const QAIDA_LESSONS: QaidaLesson[] = [
  {
    title: 'Huroof mufradat (single letters)',
    aim: 'Name and pronounce each letter from its point of articulation (makhraj).',
    items: QAIDA_LETTERS,
    size: 'lg',
  },
  {
    title: 'Huroof murakkabat (joined letters)',
    aim: 'Recognise each letter in its joined forms: at the start, in the middle and at the end.',
    items: [
      ...CONNECTORS.map((l) => `${l}${l}${l}`),
      'لا',
      ...[
        'بت',
        'ثج',
        'حخ',
        'سش',
        'صض',
        'طظ',
        'عغ',
        'فق',
        'كل',
        'من',
        'هي',
        'بتث',
        'جحخ',
        'سشص',
        'عغف',
        'قكل',
        'منه',
      ],
    ],
  },
  {
    title: 'Huroof muqattaʿat',
    aim: 'Read the disjointed letters that open some surahs, each letter by its name.',
    items: [
      'الم',
      'المص',
      'الر',
      'المر',
      'كهيعص',
      'طه',
      'طسم',
      'طس',
      'يس',
      'ص',
      'حم',
      'عسق',
      'ق',
      'ن',
    ],
  },
  {
    title: 'Harakat (zabar, zer, pesh)',
    aim: 'Read each letter with fatha (a), kasra (i) and damma (u), short and without pulling.',
    items: eachWith(VOWELLED, [FATHA, KASRA, DAMMA]),
    size: 'lg',
  },
  {
    title: 'Tanween',
    aim: 'Read the double vowels: do zabar (an), do zer (in), do pesh (un).',
    items: eachWith(VOWELLED, [FATHATAN, KASRATAN, DAMMATAN]),
    size: 'lg',
  },
  {
    title: 'Harakat and tanween practice',
    aim: 'Read letters with mixed vowels and tanween smoothly, one after another.',
    items: harakatTanweenDrill(),
  },
  {
    title: 'Khari harakat (standing vowels)',
    aim: 'Khari zabar, khari zer and ulta pesh are read long, for the length of one alif.',
    items: eachWith(BASE, [KHARI_ZABAR, KHARI_ZER, ULTA_PESH]),
    size: 'lg',
  },
  {
    title: 'Huroof maddah (madd letters)',
    aim: 'Alif after zabar, ya saakin after zer and waw saakin after pesh: pull for one alif.',
    items: BASE.flatMap((l) => [
      `${l}${FATHA}ا`,
      `${l}${KASRA}ي${SUKOON}`,
      `${l}${DAMMA}و${SUKOON}`,
    ]),
  },
  {
    title: 'Huroof leen (soft letters)',
    aim: 'Waw saakin and ya saakin after zabar are read softly and quickly (aw, ay).',
    items: BASE.flatMap((l) => [`${l}${FATHA}و${SUKOON}`, `${l}${FATHA}ي${SUKOON}`]),
  },
  {
    title: 'Sukoon (jazm) practice',
    aim: 'Join the letter with sukoon to the vowelled letter before it.',
    items: BASE.flatMap((l) => [
      `ا${FATHA}${l}${SUKOON}`,
      `ا${KASRA}${l}${SUKOON}`,
      `ا${DAMMA}${l}${SUKOON}`,
    ]),
  },
  {
    title: 'Tashdeed',
    aim: 'A letter with shadda is read twice: once joined to the letter before it, once with its own vowel.',
    items: BASE.flatMap((l) => [
      `ا${FATHA}${l}${SHADDA}${FATHA}`,
      `ا${KASRA}${l}${SHADDA}${KASRA}`,
      `ا${DAMMA}${l}${SHADDA}${DAMMA}`,
    ]),
  },
  {
    title: 'Tashdeed with tashdeed',
    aim: 'Words with two letters carrying shadda: give each its full weight.',
    ...words([
      ['الرَّحْمٰنِ الرَّحِيمِ', '1:3'],
      ['الضَّالِّينَ', '1:7'],
      ['إِنَّ الَّذِينَ', '2:6'],
      ['الْمُزَّمِّلُ', '73:1'],
      ['الْمُدَّثِّرُ', '74:1'],
      ['الطَّامَّةُ', '79:34'],
      ['الصَّاخَّةُ', '80:33'],
      ['الْجِنَّةِ وَالنَّاسِ', '114:6'],
    ]),
    size: 'sm',
  },
  {
    title: 'Tashdeed and sukoon',
    aim: 'Words with both a saakin letter and a shadda: rest on the sukoon, then double the shadda.',
    ...words([
      ['الْجَنَّةَ', '2:35'],
      ['مُسْتَقَرٌّ', '2:36'],
      ['الْحَقُّ', '2:147'],
      ['الْحَجَّ', '2:196'],
      ['الْقَيُّومُ', '2:255'],
      ['كُرْسِيُّهُ', '2:255'],
      ['الْعَلِيُّ', '2:255'],
    ]),
    size: 'sm',
  },
  {
    title: 'Sukoon after tashdeed',
    aim: 'A saakin letter straight after a shadda: double the shadda, then stop on the sukoon.',
    ...words([
      ['إِنَّهُمْ', '2:12'],
      ['نَزَّلْنَا', '2:23'],
      ['عَلَّمْتَنَا', '2:32'],
      ['فَصَّلْنَا', '6:97'],
      ['حَرَّمْنَا', '6:146'],
      ['كَذَّبْتُمْ', '25:77'],
      ['يَسَّرْنَا', '54:17'],
      ['فَذَكِّرْ', '87:9'],
      ['قَدَّمْتُ', '89:24'],
    ]),
    size: 'sm',
  },
  {
    title: 'Tashdeed after madd',
    aim: 'A shadda straight after a madd letter: pull the madd long, then double the shadda.',
    ...words([
      ['الضَّالِّينَ', '1:7'],
      ['دَابَّةٍ', '2:164'],
      ['حَاجَّكَ', '3:61'],
      ['الدَّوَابِّ', '8:22'],
      ['جَانٌّ', '55:39'],
      ['الْحَاقَّةُ', '69:1'],
      ['الطَّامَّةُ', '79:34'],
      ['الصَّاخَّةُ', '80:33'],
    ]),
    size: 'sm',
  },
  {
    title: 'Noon saakin and tanween',
    aim: 'Izhar, ikhfa, iqlab and idgham: how noon saakin and tanween are read before each letter.',
    ...words([
      ['مَنْ آمَنَ', '2:62 · izhar'],
      ['عَذَابٌ أَلِيمٌ', '2:10 · izhar'],
      ['مِنْ قَبْلِكَ', '2:4 · ikhfa'],
      ['أَنْفُسَهُمْ', '2:9 · ikhfa'],
      ['كُنْتُمْ', '2:23 · ikhfa'],
      ['أَنْبِئْهُمْ', '2:33 · iqlab'],
      ['مِنْ بَعْدِ', '2:27 · iqlab'],
      ['سَمِيعٌ بَصِيرٌ', '22:61 · iqlab'],
      ['مِنْ رَبِّهِمْ', '2:5 · idgham'],
      ['هُدًى لِلْمُتَّقِينَ', '2:2 · idgham'],
      ['مَنْ يَقُولُ', '2:8 · idgham'],
      ['مِنْ مَاءٍ', '2:164 · idgham'],
    ]),
    size: 'sm',
  },
  {
    title: 'Letters written but not read',
    aim: 'In the Quran’s script some alifs and waws are written but not pronounced when reading on.',
    ...words([
      ['أَنَا', '2:258 · alif not read'],
      ['قَالُوا', '2:11 · final alif not read'],
      ['آمَنُوا', '2:9 · final alif not read'],
      ['كَفَرُوا', '2:6 · final alif not read'],
      ['أُولٰئِكَ', '2:5 · waw not read'],
      ['أُولُو الْأَلْبَابِ', '2:269 · first waw not read'],
      ['مِائَةَ', '2:259 · alif not read'],
      ['سَلَاسِلَا', '76:4 · final alif not read when reading on'],
      ['قَوَارِيرَا', '76:15 · final alif not read when reading on'],
    ]),
    size: 'sm',
  },
];

/** The board a course reads from: Qaida and Duas have their own; every other course uses the Mushaf. */
export function boardForCourse(type: string | null | undefined): LessonBoardKind | null {
  return type === 'QAIDA' || type === 'DUAS' ? type : null;
}

/** Title of a board lesson (1-based). Dua lessons need the chapters from `useDuaCollection`. */
export function boardLessonTitle(
  board: LessonBoardKind,
  lesson: number,
  duas: DuaCategory[] | null | undefined,
): string | undefined {
  return board === 'QAIDA' ? QAIDA_LESSONS[lesson - 1]?.title : duas?.[lesson - 1]?.title;
}

/** "Lesson: item" for what the board shows, or just the lesson when no item is picked. */
export function describeBoardItem(
  position: { board: LessonBoardKind; lesson: number; item: number | null } | null,
  duas: DuaCategory[] | null | undefined,
): string | null {
  if (!position) return null;
  if (position.board === 'QAIDA') {
    const lesson = QAIDA_LESSONS[position.lesson - 1];
    if (!lesson) return null;
    const item = position.item !== null ? lesson.items[position.item] : undefined;
    return item ? `${lesson.title}: ${item}` : lesson.title;
  }
  const chapter = duas?.[position.lesson - 1];
  if (!chapter) return null;
  const dua = position.item !== null ? chapter.duas[position.item] : undefined;
  // A dua's title already names its chapter ("Chapter (2)").
  return dua ? dua.title : chapter.title;
}
