/**
 * What a Qaida or Duas class reads from, in place of the Mushaf.
 *
 * DRAFT CONTENT, written to make these classes real end to end. Before launch the academy's
 * teachers must check every item (spelling, harakat, the duas and their meanings) or replace
 * this with their own curriculum; nothing here is generated at run time.
 */

export type LessonBoardKind = 'QAIDA' | 'DUAS';

export interface QaidaLesson {
  title: string;
  /** What the lesson teaches, in a line, for the teacher and parents. */
  aim: string;
  /** Arabic items read one at a time; each is one tile on the board. */
  items: string[];
}

export interface Dua {
  title: string;
  arabic: string;
  transliteration: string;
  meaning: { en: string; ur: string };
  /** Where it comes from, when it is a Quranic ayah. */
  source?: string;
}

export interface DuaLesson {
  title: string;
  aim: string;
  items: Dua[];
}

const LETTERS = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'و', 'ه', 'ء', 'ي'];
/** Letters that take a vowel in the drills (alif carries none). */
const VOWELLED = LETTERS.filter((l) => l !== 'ا' && l !== 'ء');
const mark = (mark: string) => VOWELLED.map((l) => `${l}${mark}`);

export const QAIDA_LESSONS: QaidaLesson[] = [
  { title: 'Single letters', aim: 'Name and pronounce each letter from its point of articulation.', items: LETTERS },
  {
    title: 'Joined letters',
    aim: 'Recognise letters in their joined forms.',
    items: ['بت', 'ثج', 'حخ', 'سش', 'صض', 'طظ', 'عغ', 'فق', 'كل', 'من', 'هي', 'لا', 'بتث', 'جحخ', 'سشص', 'عغف', 'قكل', 'منه'],
  },
  {
    title: 'Huroof muqatta‘at',
    aim: 'Read the disjointed letters that open some surahs, each letter by its name.',
    items: ['الم', 'الر', 'المر', 'المص', 'كهيعص', 'طه', 'طسم', 'طس', 'يس', 'ص', 'حم', 'عسق', 'ق', 'ن'],
  },
  { title: 'Fatha (zabar)', aim: 'Read each letter with a short “a”.', items: mark('َ') },
  { title: 'Kasra (zer)', aim: 'Read each letter with a short “i”.', items: mark('ِ') },
  { title: 'Damma (pesh)', aim: 'Read each letter with a short “u”.', items: mark('ُ') },
  { title: 'Tanween', aim: 'Read the doubled vowels: “an”, “in”, “un”.', items: VOWELLED.flatMap((l) => [`${l}ً`, `${l}ٍ`, `${l}ٌ`]).slice(0, 36) },
  { title: 'Sukoon (jazm)', aim: 'Join a vowelled letter to a resting one.', items: VOWELLED.slice(1).map((l) => `اَ${l}ْ`) },
];

export const DUA_LESSONS: DuaLesson[] = [
  {
    title: 'Daily duas',
    aim: 'The duas of the day, said at the right moment.',
    items: [
      { title: 'Before eating', arabic: 'بِسْمِ اللَّهِ', transliteration: 'Bismillah', meaning: { en: 'In the name of Allah.', ur: 'اللہ کے نام سے۔' } },
      {
        title: 'If you forgot at the start',
        arabic: 'بِسْمِ اللَّهِ أَوَّلَهُ وَآخِرَهُ',
        transliteration: 'Bismillahi awwalahu wa akhirahu',
        meaning: { en: 'In the name of Allah, at its beginning and at its end.', ur: 'اللہ کے نام سے، اس کے شروع میں اور آخر میں۔' },
      },
      {
        title: 'After eating',
        arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ',
        transliteration: 'Alhamdu lillahil-ladhi at‘amana wa saqana wa ja‘alana muslimin',
        meaning: {
          en: 'All praise is for Allah, who fed us, gave us drink and made us Muslims.',
          ur: 'تمام تعریف اللہ کے لیے ہے جس نے ہمیں کھلایا، پلایا اور مسلمان بنایا۔',
        },
      },
      {
        title: 'Before sleeping',
        arabic: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
        transliteration: 'Bismika Allahumma amutu wa ahya',
        meaning: { en: 'In Your name, O Allah, I die and I live.', ur: 'اے اللہ! تیرے نام کے ساتھ میں مرتا اور جیتا ہوں۔' },
      },
      {
        title: 'On waking up',
        arabic: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
        transliteration: 'Alhamdu lillahil-ladhi ahyana ba‘da ma amatana wa ilayhin-nushur',
        meaning: {
          en: 'All praise is for Allah, who gave us life after causing us to die, and to Him is the return.',
          ur: 'تمام تعریف اللہ کے لیے ہے جس نے ہمیں موت کے بعد زندگی دی، اور اسی کی طرف لوٹ کر جانا ہے۔',
        },
      },
      {
        title: 'Leaving home',
        arabic: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ وَلَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
        transliteration: 'Bismillahi tawakkaltu ‘alallah, wa la hawla wa la quwwata illa billah',
        meaning: {
          en: 'In the name of Allah; I rely on Allah; there is no might and no power except with Allah.',
          ur: 'اللہ کے نام سے، میں نے اللہ پر بھروسہ کیا، اور اللہ کے بغیر نہ کوئی طاقت ہے نہ قوت۔',
        },
      },
      {
        title: 'Entering the toilet',
        arabic: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْخُبُثِ وَالْخَبَائِثِ',
        transliteration: 'Allahumma inni a‘udhu bika minal-khubuthi wal-khaba’ith',
        meaning: { en: 'O Allah, I seek refuge in You from evil and evil ones.', ur: 'اے اللہ! میں ناپاک جنوں اور جنیوں سے تیری پناہ مانگتا ہوں۔' },
      },
      { title: 'Leaving the toilet', arabic: 'غُفْرَانَكَ', transliteration: 'Ghufranak', meaning: { en: 'I ask Your forgiveness.', ur: 'میں تیری بخشش چاہتا ہوں۔' } },
    ],
  },
  {
    title: 'Duas of salah',
    aim: 'What is said in each position of the prayer.',
    items: [
      {
        title: 'Opening (thana)',
        arabic: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالَى جَدُّكَ وَلَا إِلَهَ غَيْرُكَ',
        transliteration: 'Subhanakal-lahumma wa bihamdika wa tabarakasmuka wa ta‘ala jadduka wa la ilaha ghayruk',
        meaning: {
          en: 'Glory be to You, O Allah, and praise; blessed is Your name, exalted Your majesty, and there is no god but You.',
          ur: 'اے اللہ! تو پاک ہے اور تیری ہی تعریف ہے، تیرا نام بابرکت ہے، تیری شان بلند ہے اور تیرے سوا کوئی معبود نہیں۔',
        },
      },
      { title: 'In ruku', arabic: 'سُبْحَانَ رَبِّيَ الْعَظِيمِ', transliteration: 'Subhana rabbiyal-‘azim', meaning: { en: 'Glory be to my Lord, the Most Great.', ur: 'پاک ہے میرا رب جو بڑی عظمت والا ہے۔' } },
      {
        title: 'Rising from ruku',
        arabic: 'سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ، رَبَّنَا وَلَكَ الْحَمْدُ',
        transliteration: 'Sami‘allahu liman hamidah, rabbana wa lakal-hamd',
        meaning: { en: 'Allah hears whoever praises Him. Our Lord, to You is all praise.', ur: 'اللہ نے اس کی سن لی جس نے اس کی تعریف کی۔ اے ہمارے رب! تمام تعریف تیرے ہی لیے ہے۔' },
      },
      { title: 'In sujood', arabic: 'سُبْحَانَ رَبِّيَ الْأَعْلَى', transliteration: 'Subhana rabbiyal-a‘la', meaning: { en: 'Glory be to my Lord, the Most High.', ur: 'پاک ہے میرا رب جو سب سے بلند ہے۔' } },
      { title: 'Between the two sajdas', arabic: 'رَبِّ اغْفِرْ لِي', transliteration: 'Rabbighfir li', meaning: { en: 'My Lord, forgive me.', ur: 'اے میرے رب! مجھے بخش دے۔' } },
      { title: 'After salah', arabic: 'أَسْتَغْفِرُ اللَّهَ', transliteration: 'Astaghfirullah (three times)', meaning: { en: 'I seek Allah’s forgiveness.', ur: 'میں اللہ سے بخشش مانگتا ہوں۔' } },
    ],
  },
  {
    title: 'Occasions & travel',
    aim: 'Duas for journeys, the masjid and everyday moments.',
    items: [
      {
        title: 'Starting a journey',
        arabic: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ',
        transliteration: 'Subhanal-ladhi sakhkhara lana hadha wa ma kunna lahu muqrinin, wa inna ila rabbina lamunqalibun',
        meaning: {
          en: 'Glory be to the One who placed this at our service, which we could not have done ourselves; and to our Lord we will surely return.',
          ur: 'پاک ہے وہ ذات جس نے اسے ہمارے بس میں کر دیا، ہم اسے قابو میں لانے والے نہ تھے، اور ہم اپنے رب ہی کی طرف لوٹنے والے ہیں۔',
        },
        source: 'Az-Zukhruf 43:13–14',
      },
      { title: 'Entering the masjid', arabic: 'اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ', transliteration: 'Allahummaftah li abwaba rahmatik', meaning: { en: 'O Allah, open for me the doors of Your mercy.', ur: 'اے اللہ! میرے لیے اپنی رحمت کے دروازے کھول دے۔' } },
      { title: 'Leaving the masjid', arabic: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ', transliteration: 'Allahumma inni as’aluka min fadlik', meaning: { en: 'O Allah, I ask You of Your bounty.', ur: 'اے اللہ! میں تجھ سے تیرا فضل مانگتا ہوں۔' } },
      { title: 'After sneezing', arabic: 'الْحَمْدُ لِلَّهِ', transliteration: 'Alhamdulillah', meaning: { en: 'All praise is for Allah.', ur: 'تمام تعریف اللہ کے لیے ہے۔' } },
      { title: 'Hearing someone sneeze', arabic: 'يَرْحَمُكَ اللَّهُ', transliteration: 'Yarhamukallah', meaning: { en: 'May Allah have mercy on you.', ur: 'اللہ تم پر رحم کرے۔' } },
      {
        title: 'For parents',
        arabic: 'رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
        transliteration: 'Rabbir-hamhuma kama rabbayani saghira',
        meaning: { en: 'My Lord, have mercy on them as they raised me when I was small.', ur: 'اے میرے رب! ان دونوں پر رحم فرما جیسے انہوں نے بچپن میں میری پرورش کی۔' },
        source: 'Al-Isra 17:24',
      },
      { title: 'For knowledge', arabic: 'رَبِّ زِدْنِي عِلْمًا', transliteration: 'Rabbi zidni ‘ilma', meaning: { en: 'My Lord, increase me in knowledge.', ur: 'اے میرے رب! میرے علم میں اضافہ فرما۔' }, source: 'Ta-Ha 20:114' },
    ],
  },
];

/** The board a course reads from: Qaida and Duas have their own; every other course uses the Mushaf. */
export function boardForCourse(type: string | null | undefined): LessonBoardKind | null {
  return type === 'QAIDA' || type === 'DUAS' ? type : null;
}
