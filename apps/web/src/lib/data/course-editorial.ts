import { Course, CourseType } from '@/lib/types';

/*
 * Editorial copy for the course catalogue. This is marketing content, not data: the
 * course list itself always comes from `GET /courses`, and these entries only add a
 * tagline, duration, audience and feature list to an API course with the same `code`.
 * A course that is not in the API is never shown.
 */

export const COURSE_IMAGE_ASSETS: Record<string, { url: string; alt: string }> = {
  'crs-1': {
    url: 'https://images.unsplash.com/photo-1609599006353-e629aaabfeae?auto=format&fit=crop&w=800&q=80',
    alt: 'Young student learning Arabic letters with patient guidance'
  },
  'crs-2': {
    url: 'https://images.unsplash.com/photo-1584281722572-c283fb58c8ec?auto=format&fit=crop&w=800&q=80',
    alt: 'Student practicing fluent Quran recitation from printed Mushaf'
  },
  'crs-3': {
    url: 'https://images.unsplash.com/photo-1585036156171-384164a8c675?auto=format&fit=crop&w=800&q=80',
    alt: 'Open Quran with traditional calligraphy on wooden rehal stand'
  },
  'crs-4': {
    url: 'https://images.unsplash.com/photo-1532012164546-f432f2e37b73?auto=format&fit=crop&w=800&q=80',
    alt: 'Student in focused Quran memorization study session'
  },
  'crs-5': {
    url: 'https://images.unsplash.com/photo-1590073844006-33379778ae09?auto=format&fit=crop&w=800&q=80',
    alt: 'Long-term revision and consolidation session'
  },
  'crs-6': {
    url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?auto=format&fit=crop&w=800&q=80',
    alt: 'Sacred classical Arabic Quranic text and scholarly heritage'
  }
};

export const COURSE_EDITORIAL: Course[] = [
  {
    id: 'crs-1',
    code: CourseType.QAIDA,
    title: 'Noorani & Madani Qaida',
    tagline: 'Foundational Arabic phonetics for young children & beginners',
    description: 'A gentle, systematic introduction to Arabic letters, correct articulation points (Makharij), short vowels (Harakat), Tanween, and Sukoon using our interactive classroom board.',
    levelCount: 3,
    durationMonths: '3 to 6 months',
    targetAudience: 'Children (ages 4–9) and adults beginning Arabic reading from scratch',
    features: [
      'Interactive letter pointer guiding proper eye-tracking',
      'Individual Makharij vocal practice with gentle patience',
      'Step-by-step phonetics from single letters to connected words',
      'Weekly progress audio summaries shared with parents'
    ],
    prerequisites: 'No prior Arabic knowledge required',
    category: 'Foundation',
    badge: 'Beginner Essential',
    iconName: 'BookOpen'
  },
  {
    id: 'crs-2',
    code: CourseType.NAZRA,
    title: 'Nazra Quran (Fluent Reading)',
    tagline: 'Continuous reading directly from the Mushaf with ease and flow',
    description: 'Transition from single-word reading to smooth, rhythmic recitation of complete Surahs. Develops breath pacing, eye coordination, and respectful Waqf (stopping) rules.',
    levelCount: 4,
    durationMonths: '6 to 12 months',
    targetAudience: 'Students who recognize Arabic letters and seek fluent recitation',
    features: [
      'Synchronized digital Mushaf in Madani 15-line & IndoPak scripts',
      'Real-time ayah and word tracking synchronized with teacher',
      'Correction of vocal errors recorded in personal study journal',
      'Structured daily reading portions (Sabaq) recorded every class'
    ],
    prerequisites: 'Completion of Qaida or elementary reading evaluation',
    category: 'Recitation',
    badge: 'Core Program',
    iconName: 'BookMarked'
  },
  {
    id: 'crs-3',
    code: CourseType.TAJWEED,
    title: 'Applied Tajweed Rules',
    tagline: 'Master the rules of recitation according to Hafs ‘an ‘Asim',
    description: 'In-depth practical study of Noon Sakinah, Meem Sakinah, Mudood (elongations), Qalqalah, heavy and light letter traits (Sifaat), with color-coded Tajweed overlays in class.',
    levelCount: 3,
    durationMonths: '4 to 8 months',
    targetAudience: 'Readers seeking precision, correct pronunciation, and vocal beauty',
    features: [
      'Optional Tajweed color overlay activated by teacher',
      'Careful oral drills distinguishing similar Arabic letters',
      'Independent milestone evaluations by senior examiners',
      'Formal academic certificate of completion upon graduation'
    ],
    prerequisites: 'Ability to read Quranic script at a steady pace',
    category: 'Recitation',
    badge: 'Scholarly Track',
    iconName: 'Sparkles'
  },
  {
    id: 'crs-4',
    code: CourseType.HIFZ,
    title: 'Comprehensive Hifz Program',
    tagline: 'Full and partial Quran memorization with disciplined daily pacing',
    description: 'A traditional three-tiered methodology balancing new memorization (Sabaq), recent consolidation (Sabqi), and long-term retention (Manzil), monitored page by page.',
    levelCount: 30,
    durationMonths: '2 to 3 years',
    targetAudience: 'Committed students dedicated to preserving the Quran in memory',
    features: [
      'Interactive 604-page heatmap tracking individual page retention states',
      'Automated daily revision scheduler preventing retention burnout',
      'Quarterly formal oral examinations with external senior examiner',
      'Personalized pacing: Full-time (1 page/day) or Part-time (half page/day)'
    ],
    prerequisites: 'Fluent Nazra reading with applied Tajweed proficiency',
    category: 'Memorization',
    badge: 'Flagship Academy',
    iconName: 'Target'
  },
  {
    id: 'crs-5',
    code: CourseType.MURAJAAH,
    title: 'Muraja’ah (Hifz Retention)',
    tagline: 'Systematic consolidation and stabilization for existing Huffaz',
    description: 'Designed specifically for students who completed memorization and need structured revision routines to solidify weak Surahs and eliminate hesitation.',
    levelCount: 30,
    durationMonths: 'Ongoing / 6 to 12 months',
    targetAudience: 'Huffaz experiencing retention gaps or preparing for formal certification',
    features: [
      'Customized 5-Juz / 10-Juz weekly rotational cycle',
      'Frequent spontaneous oral tests mimicking formal Sanad conditions',
      'Special focus on Mutashabihat (verses with similar phrasing)',
      'Detailed tracking of fragile pages until certified solid'
    ],
    prerequisites: 'Completion of 15+ Juz or full Quran memorization',
    category: 'Memorization',
    badge: 'Retention Guard',
    iconName: 'CheckCircle2'
  },
  {
    id: 'crs-6',
    code: CourseType.IJAZAH,
    title: 'Ijazah Program (Sanad Track)',
    tagline: 'Attain an authentic oral license linked to the Prophet ﷺ',
    description: 'The highest academic honor: complete oral recitation of the entire Quran from memory or verified text to an authorized Shaykh with continuous chain (Sanad) of transmission.',
    levelCount: 30,
    durationMonths: '1 to 2 years',
    targetAudience: 'Advanced Huffaz and teachers seeking formal scholarly accreditation',
    features: [
      'Direct one-to-one mentorship with certified Azhari/Madani Shuyookh',
      'Complete Quran oral recitation from memory or verified Mushaf',
      'Formal stamped and signed Sanad document upon successful completion'
    ],
    prerequisites: 'Full memorization + comprehensive mastery of classical Tajweed texts',
    category: 'Certification',
    badge: 'Highest Honor',
    iconName: 'Award'
  }
];

/** Teacher tier a billing plan guarantees. */
export interface PlanTier {
  code: string;
  name: string;
  badgeIcon: string | null;
  description: string | null;
}

/** A billing plan as rendered on the public plans pages (from `GET /billing/plans`). */
export interface TuitionPlanTier {
  id: string;
  code?: string;
  name: string;
  classesPerWeek: number;
  classDurationMins: number;
  type: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod?: string;
  tier: PlanTier | null;
  popular?: boolean;
  recommendedFor?: string;
  features: string[];
  source?: 'api';
}
