/**
 * Starter curriculum for the placeholder course levels (scripts/seed-curriculum.ts).
 *
 * TEACHERS SHOULD REVIEW THIS. It is a sensible first draft written so the lesson pickers show
 * real lesson names instead of "Beginner — lesson 1"; the owner and the teachers are expected
 * to rename, reorder, add and delete lessons under Admin → Courses.
 *
 * Kept free of Nest and @hifzoon/shared imports so the script can load it with plain ts-node.
 */

/** Titles the original seed wrote (prisma/seed.ts): "<level name> — lesson <n>". */
export const PLACEHOLDER_TITLE = /— lesson \d+$/;

export interface CurriculumLesson {
  title: string;
  objectives?: string[];
  materials?: Record<string, string>;
}

/** Hisn al-Muslim chapter as stored in src/content/duas/hisn-al-muslim.json. */
export interface DuaChapter {
  id: number;
  title: { en: string };
  duas: unknown[];
}

// ── Noorani Qaida: the 17 lessons of the Qaida board (apps/web/src/lib/data/lesson-boards.ts) ──

const QAIDA: Array<[string, string]> = [
  [
    'Huroof mufradat (single letters)',
    'Name and pronounce each letter from its point of articulation (makhraj).',
  ],
  [
    'Huroof murakkabat (joined letters)',
    'Recognise each letter in its joined forms: at the start, in the middle and at the end.',
  ],
  [
    'Huroof muqattaʿat',
    'Read the disjointed letters that open some surahs, each letter by its name.',
  ],
  [
    'Harakat (zabar, zer, pesh)',
    'Read each letter with fatha (a), kasra (i) and damma (u), short and without pulling.',
  ],
  ['Tanween', 'Read the double vowels: do zabar (an), do zer (in), do pesh (un).'],
  [
    'Harakat and tanween practice',
    'Read letters with mixed vowels and tanween smoothly, one after another.',
  ],
  [
    'Khari harakat (standing vowels)',
    'Khari zabar, khari zer and ulta pesh are read long, for the length of one alif.',
  ],
  [
    'Huroof maddah (madd letters)',
    'Alif after zabar, ya saakin after zer and waw saakin after pesh: pull for one alif.',
  ],
  [
    'Huroof leen (soft letters)',
    'Waw saakin and ya saakin after zabar are read softly and quickly (aw, ay).',
  ],
  ['Sukoon (jazm) practice', 'Join the letter with sukoon to the vowelled letter before it.'],
  [
    'Tashdeed',
    'A letter with shadda is read twice: once joined to the letter before it, once with its own vowel.',
  ],
  ['Tashdeed with tashdeed', 'Words with two letters carrying shadda: give each its full weight.'],
  [
    'Tashdeed and sukoon',
    'Words with both a saakin letter and a shadda: rest on the sukoon, then double the shadda.',
  ],
  [
    'Sukoon after tashdeed',
    'A saakin letter straight after a shadda: double the shadda, then stop on the sukoon.',
  ],
  [
    'Tashdeed after madd',
    'A shadda straight after a madd letter: pull the madd long, then double the shadda.',
  ],
  [
    'Noon saakin and tanween',
    'Izhar, ikhfa, iqlab and idgham: how noon saakin and tanween are read before each letter.',
  ],
  [
    'Letters written but not read',
    'In the Quran’s script some alifs and waws are written but not pronounced when reading on.',
  ],
];

/** "Qaida 5: Tanween" — the Qaida number is kept because teachers and books use it. */
function qaida(from: number, to: number): CurriculumLesson[] {
  return QAIDA.slice(from - 1, to).map(([title, aim], i) => ({
    title: `Qaida ${from + i}: ${title}`,
    objectives: [aim],
    materials: { workbook: `Noorani Qaida, lesson ${from + i}` },
  }));
}

// ── Nazra and Hifz ───────────────────────────────────────────────────────────

function reading(title: string, focus: string): CurriculumLesson {
  return { title, objectives: [`Read ${focus} from the mushaf with correct makharij and fluency`] };
}

function sabaq(title: string, focus: string): CurriculumLesson {
  return {
    title,
    objectives: [
      `Memorise ${focus} as new sabaq`,
      'Keep the previous lessons in daily sabqi; recite the full portion without help',
    ],
  };
}

function revision(title: string, objectives: string[]): CurriculumLesson {
  return { title, objectives };
}

// ── Duas: chapters of Hisn al-Muslim, matched by their exact English title ───

export const DUAS_CHAPTERS: Record<string, string[]> = {
  'daily duas': [
    'Supplications for when you wake up',
    'Invocation when getting dressed',
    'Invocation for entering the restroom',
    'Invocation for leaving the restroom',
    'What to say before performing ablution',
    'What to say upon completing ablution',
    'What to say when leaving the home',
    'What to say when entering the home',
    'Invocation for going to the mosque',
    'Invocation for entering the mosque',
    'Invocation for leaving the mosque',
    'Invocations before eating',
    'Invocations after eating',
    'Invocation for sneezing',
    'What to say before sleeping',
  ],
  'duas of salah': [
    'What to say upon hearing the Athan (call to prayer)',
    'Invocations for the beginning of the prayer',
    "Invocations during Ruki' (bowing in prayer)",
    "Invocations for rising from the Ruki'",
    'Invocations during Sujood',
    'Invocations for sitting between two prostrations',
    'Invocation for At-Tashahhud (sitting in prayer)',
    'How to recite blessings on the Prophet after the Tashahhud',
    'Invocations after the final Tash-ahhud and before ending the prayer',
    'What to say after completing the prayer',
    'Invocations for Qunut in the Witr prayer',
  ],
  'occasions & travel': [
    'Invocation for riding in a vehicle or on an animal',
    'Invocation for traveling',
    'Invocation for entering a town or city',
    'What to say upon returning from a Journey',
    'Invocations for when the wind blows',
    'Invocation for when it rains',
    'Supplication after it rains',
    'Invocation for sighting the new moon',
    'Invocations for breaking the fast',
    'Invocations in times of worry and grief',
    'Invocations for anguish',
    'What to say when you feel a pain in your body',
    'Invocations for visiting the sick',
    'Invocation for when tragedy strikes',
    'Invocation for anger',
  ],
};

/**
 * Dua lessons for one level from the Hisn al-Muslim chapters. A title missing from the file
 * is reported, not invented, so a typo shows up in the script output instead of the app.
 */
export function duaLessons(
  titles: string[],
  chapters: DuaChapter[],
): { lessons: CurriculumLesson[]; missing: string[] } {
  const byTitle = new Map(chapters.map((c) => [c.title.en.trim().toLowerCase(), c]));
  const lessons: CurriculumLesson[] = [];
  const missing: string[] = [];
  for (const title of titles) {
    const chapter = byTitle.get(title.trim().toLowerCase());
    if (!chapter) {
      missing.push(title);
      continue;
    }
    const count = chapter.duas.length;
    lessons.push({
      title: chapter.title.en.trim(),
      objectives: [
        `Memorise the ${count === 1 ? 'dua' : `${count} duas`} of this chapter with their meaning`,
        'Know when to say it and say it at the right time',
      ],
      materials: { 'Hisn al-Muslim': `Chapter ${chapter.id}` },
    });
  }
  return { lessons, missing };
}

/**
 * Lessons per course type and level name (lower case). Level names are the ones the original
 * seed created; a level the owner has renamed is not matched, and so is left alone.
 */
export function curriculumPlan(chapters: DuaChapter[]): {
  plan: Record<string, Record<string, CurriculumLesson[]>>;
  missing: string[];
} {
  const missing: string[] = [];
  const duas: Record<string, CurriculumLesson[]> = {};
  for (const [level, titles] of Object.entries(DUAS_CHAPTERS)) {
    const result = duaLessons(titles, chapters);
    duas[level] = result.lessons;
    missing.push(...result.missing);
  }

  return {
    missing,
    plan: {
      QAIDA: {
        beginner: qaida(1, 4),
        'letter forms': qaida(5, 8),
        'word reading': qaida(9, 13),
        'short surahs': qaida(14, 17),
      },
      DUAS: duas,
      NAZRA: {
        'partial surahs': [
          reading('Surah Al-Fatihah', 'Surah Al-Fatihah'),
          reading('Ayat al-Kursi (Al-Baqarah 2:255)', 'Ayat al-Kursi'),
          reading('Last two ayat of Al-Baqarah (2:285–286)', 'Al-Baqarah 2:285–286'),
          reading('Al-Kahf 18:1–10', 'the first ten ayat of Surah Al-Kahf'),
          reading('Al-Hashr 59:22–24', 'the last three ayat of Surah Al-Hashr'),
          reading('Ya-Sin 36:1–12', 'the opening ayat of Surah Ya-Sin'),
        ],
        'short surahs': [
          reading('An-Nas – Al-Ikhlas', 'Surahs An-Nas, Al-Falaq and Al-Ikhlas'),
          reading('Al-Masad – Al-Kawthar', 'Surahs Al-Masad, An-Nasr, Al-Kafirun and Al-Kawthar'),
          reading("Al-Ma'un – Al-Fil", "Surahs Al-Ma'un, Quraysh and Al-Fil"),
          reading('Al-Humazah – At-Takathur', "Surahs Al-Humazah, Al-'Asr and At-Takathur"),
          reading("Al-Qari'ah – Al-'Adiyat", "Surahs Al-Qari'ah and Al-'Adiyat"),
          reading('Az-Zalzalah – Al-Bayyinah', 'Surahs Az-Zalzalah and Al-Bayyinah'),
          reading("Al-Qadr – Al-'Alaq", "Surahs Al-Qadr and Al-'Alaq"),
        ],
        'juz amma': [
          reading('At-Tin – Ad-Duha', 'Surahs At-Tin, Ash-Sharh and Ad-Duha'),
          reading('Al-Layl – Ash-Shams', 'Surahs Al-Layl and Ash-Shams'),
          reading('Al-Balad – Al-Fajr', 'Surahs Al-Balad and Al-Fajr'),
          reading("Al-Ghashiyah – Al-A'la", "Surahs Al-Ghashiyah and Al-A'la"),
          reading('At-Tariq – Al-Buruj', 'Surahs At-Tariq and Al-Buruj'),
          reading('Al-Inshiqaq – Al-Mutaffifin', 'Surahs Al-Inshiqaq and Al-Mutaffifin'),
          reading('Al-Infitar – At-Takwir', 'Surahs Al-Infitar and At-Takwir'),
          reading('Abasa – An-Naba', "Surahs Abasa, An-Nazi'at and An-Naba"),
        ],
        'full mushaf': [
          reading('Juz 1–5', 'Juz 1 to 5'),
          reading('Juz 6–10', 'Juz 6 to 10'),
          reading('Juz 11–15', 'Juz 11 to 15'),
          reading('Juz 16–20', 'Juz 16 to 20'),
          reading('Juz 21–25', 'Juz 21 to 25'),
          reading('Juz 26–30', 'Juz 26 to 30, completing the khatm'),
        ],
      },
      HIFZ: {
        'sabaq start': [
          sabaq('Juz 30: An-Nas – Al-Kawthar', 'Surahs An-Nas to Al-Kawthar (114–108)'),
          sabaq("Juz 30: Al-Ma'un – At-Takathur", "Surahs Al-Ma'un to At-Takathur (107–102)"),
          sabaq("Juz 30: Al-Qari'ah – Al-Qadr", "Surahs Al-Qari'ah to Al-Qadr (101–97)"),
          sabaq("Juz 30: Al-'Alaq – Ad-Duha", "Surahs Al-'Alaq to Ad-Duha (96–93)"),
          sabaq('Juz 30: Al-Layl – Al-Fajr', 'Surahs Al-Layl to Al-Fajr (92–89)'),
          sabaq(
            'Juz 30: Al-Ghashiyah – Al-Buruj',
            "Surahs Al-Ghashiyah, Al-A'la, At-Tariq and Al-Buruj (88–85)",
          ),
          sabaq('Juz 30: Al-Inshiqaq – At-Takwir', 'Surahs Al-Inshiqaq to At-Takwir (84–81)'),
          sabaq('Juz 30: Abasa – An-Naba', "Surahs Abasa, An-Nazi'at and An-Naba (80–78)"),
        ],
        'building momentum': [
          sabaq('Juz 29: Al-Mulk', 'Surah Al-Mulk'),
          sabaq('Juz 29: Al-Qalam – Al-Haqqah', 'Surahs Al-Qalam and Al-Haqqah'),
          sabaq("Juz 29: Al-Ma'arij – Nuh", "Surahs Al-Ma'arij and Nuh"),
          sabaq('Juz 29: Al-Jinn – Al-Muzzammil', 'Surahs Al-Jinn and Al-Muzzammil'),
          sabaq('Juz 29: Al-Muddaththir – Al-Qiyamah', 'Surahs Al-Muddaththir and Al-Qiyamah'),
          sabaq('Juz 29: Al-Insan – Al-Mursalat', 'Surahs Al-Insan and Al-Mursalat'),
          sabaq('Juz 28: Al-Mujadilah', 'Surah Al-Mujadilah'),
          sabaq('Juz 28: Al-Hashr', 'Surah Al-Hashr'),
          sabaq('Juz 28: Al-Mumtahanah – As-Saff', 'Surahs Al-Mumtahanah and As-Saff'),
          sabaq(
            "Juz 28: Al-Jumu'ah – At-Taghabun",
            "Surahs Al-Jumu'ah, Al-Munafiqun and At-Taghabun",
          ),
          sabaq('Juz 28: At-Talaq – At-Tahrim', 'Surahs At-Talaq and At-Tahrim'),
        ],
        'revision mastery': [
          revision('Juz 1: sabaq, sabqi and manzil', [
            'New sabaq from Juz 1 each class',
            'Sabqi: the last few days of sabaq; manzil: one juz of Juz 28–30',
          ]),
          revision('Juz 2: sabaq, sabqi and manzil', [
            'New sabaq from Juz 2 each class',
            'Manzil rotates through Juz 1 and Juz 28–30',
          ]),
          revision('Juz 3: sabaq, sabqi and manzil', [
            'New sabaq from Juz 3 each class',
            'Manzil rotates through Juz 1–2 and Juz 28–30',
          ]),
          revision('Juz 4: sabaq, sabqi and manzil', [
            'New sabaq from Juz 4 each class',
            'Manzil rotates through Juz 1–3 and Juz 28–30',
          ]),
          revision('Juz 5: sabaq, sabqi and manzil', [
            'New sabaq from Juz 5 each class',
            'Manzil rotates through Juz 1–4 and Juz 28–30',
          ]),
          revision('Manzil: Juz 1–5 in one sitting', [
            'Recite Juz 1–5 from memory with no more than a few prompts per juz',
          ]),
          revision('Manzil: Juz 28–30 and 1–5 consolidation', [
            'Recite every memorised juz across the week; note weak pages for sabqi',
          ]),
        ],
      },
    },
  };
}

// ── Planning: what to change in one level, touching only placeholder data ────

export interface ExistingLesson {
  id: string;
  position: number;
  title: string;
}

export type LessonChange =
  | { kind: 'rename'; id: string; position: number; from: string; lesson: CurriculumLesson }
  | { kind: 'create'; position: number; lesson: CurriculumLesson };

/**
 * The changes for one level:
 *  - a lesson whose title still matches PLACEHOLDER_TITLE takes the planned lesson for its
 *    place in the level (title, objectives, materials; teacher notes are never touched);
 *  - planned lessons beyond the existing ones are added only when every existing lesson was a
 *    placeholder (or the level was empty), so a level the owner has edited never grows;
 *  - nothing is deleted. Positions are not changed, so enrolment pointers stay valid.
 *
 * Running it again finds no placeholders and a non-empty level, so it changes nothing.
 */
export function planLevel(
  existing: ExistingLesson[],
  planned: CurriculumLesson[],
): { changes: LessonChange[]; leftAlone: number } {
  const sorted = [...existing].sort((a, b) => a.position - b.position);
  const allPlaceholders = sorted.every((l) => PLACEHOLDER_TITLE.test(l.title));
  const changes: LessonChange[] = [];
  let leftAlone = 0;

  sorted.forEach((lesson, index) => {
    if (!PLACEHOLDER_TITLE.test(lesson.title)) return;
    const next = planned[index];
    if (!next) {
      leftAlone += 1;
      return;
    }
    changes.push({
      kind: 'rename',
      id: lesson.id,
      position: lesson.position,
      from: lesson.title,
      lesson: next,
    });
  });

  if (allPlaceholders && planned.length > sorted.length) {
    const top = sorted.length ? sorted[sorted.length - 1].position : 0;
    planned.slice(sorted.length).forEach((lesson, i) => {
      changes.push({ kind: 'create', position: top + 1 + i, lesson });
    });
  }
  return { changes, leftAlone };
}
