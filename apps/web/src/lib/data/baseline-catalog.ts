import { Course, CourseType, Currency, TeacherProfile } from '@/lib/types';

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

export const BASELINE_COURSES: Course[] = [
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

export const VERIFIED_FACULTY_PROFILES: TeacherProfile[] = [
  {
    id: 'tch-1',
    name: 'Sheikh Bilal Al-Azhari',
    title: 'Senior Quran & Qira’at Instructor',
    gender: 'MALE',
    photoUrl: '/teachers/bilal.jpg',
    videoUrl: 'https://www.youtube.com/watch?v=sample1',
    audioSampleUrl: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/001.mp3',
    experienceYears: 12,
    studentsTaught: 380,
    rating: 4.98,
    reviewCount: 142,
    languages: ['English', 'Arabic', 'Urdu'],
    qualifications: [
      'B.A. Islamic Studies, Al-Azhar University (Cairo)',
      'Ijazah in Hafs & Shu’bah with continuous Sanad',
      '12+ years teaching diaspora youth across UK & USA'
    ],
    specializations: ['Applied Tajweed', 'Hifz Mentorship', 'Ijazah Track'],
    bio: 'A patient and scholarly teacher focused on building phonetic precision and a profound spiritual connection to the Quran. Known for his calm encouragement with teenage and adult students.',
    country: 'Egypt / UK Remote',
    isAvailableForTrial: true,
    featured: true
  },
  {
    id: 'tch-2',
    name: 'Ustadha Fatima Zahra',
    title: 'Head of Early Years & Nazra Program',
    gender: 'FEMALE',
    photoUrl: '/teachers/fatima.jpg',
    audioSampleUrl: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/112.mp3',
    experienceYears: 8,
    studentsTaught: 290,
    rating: 4.96,
    reviewCount: 118,
    languages: ['English', 'Urdu'],
    qualifications: [
      'Hafiza of the Holy Quran (Wafaq-ul-Madaris)',
      'Certified Child Psychology in Early Islamic Education',
      'Specialist in Interactive Digital Noorani Qaida'
    ],
    specializations: ['Noorani Qaida for Kids', 'Nazra Fluency', 'Female Adult Classes'],
    bio: 'Specializes in making foundational Arabic letters clear, gentle, and engaging for young minds aged 4–10. Employs patient phonetics and positive reinforcement.',
    country: 'Pakistan / Global',
    isAvailableForTrial: true,
    featured: true
  },
  {
    id: 'tch-3',
    name: 'Ustadh Muhammad Farooq',
    title: 'Lead Hifz Coach & Tajweed Specialist',
    gender: 'MALE',
    photoUrl: '/teachers/farooq.jpg',
    audioSampleUrl: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/113.mp3',
    experienceYears: 10,
    studentsTaught: 410,
    rating: 4.95,
    reviewCount: 164,
    languages: ['English', 'Urdu', 'Arabic'],
    qualifications: [
      'Sanad in 10 Sughra Qira’at (Jamia Ashrafia)',
      'Former Judge of National Quran Recitation Competitions',
      'Trained in Spaced Repetition Memorization Methods'
    ],
    specializations: ['Full Hifz', 'Muraja’ah for Retention', 'Makharij Correction'],
    bio: 'Expert at designing tailored memorization schedules that prevent retention burnout. Dedicated to instilling self-discipline and tajweed rigor in aspiring Huffaz.',
    country: 'Pakistan / Canada Remote',
    isAvailableForTrial: true,
    featured: true
  },
  {
    id: 'tch-4',
    name: 'Ustadha Maryam Siddiqui',
    title: 'Senior Tajweed & Tafsir Instructor',
    gender: 'FEMALE',
    photoUrl: '/teachers/maryam.jpg',
    audioSampleUrl: 'https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/114.mp3',
    experienceYears: 7,
    studentsTaught: 220,
    rating: 4.99,
    reviewCount: 95,
    languages: ['English', 'Arabic'],
    qualifications: [
      'M.A. Quranic Exegesis, Islamic University of Madinah',
      'Ijazah in Hafs ‘an ‘Asim (Tareeq al-Shatibiyyah)',
      'Bilingual educator with Cambridge certification'
    ],
    specializations: ['Sister Classes', 'Tafsir & Meaning', 'Advanced Tajweed'],
    bio: 'Warm, approachable, and thorough. Fosters deep reflective connection (Tadabbur) alongside correct pronunciation for women and older girls.',
    country: 'Saudi Arabia / UK Remote',
    isAvailableForTrial: true,
    featured: true
  }
];

export const CURRENCY_EXCHANGE_CONFIG: Record<Currency, { symbol: string; rateMultiplier: number; currencyName: string }> = {
  [Currency.USD]: { symbol: '$', rateMultiplier: 1.0, currencyName: 'US Dollar' },
  [Currency.GBP]: { symbol: '£', rateMultiplier: 0.80, currencyName: 'British Pound' },
  [Currency.CAD]: { symbol: 'CA$', rateMultiplier: 1.35, currencyName: 'Canadian Dollar' },
  [Currency.AUD]: { symbol: 'AU$', rateMultiplier: 1.52, currencyName: 'Australian Dollar' },
  [Currency.AED]: { symbol: 'AED ', rateMultiplier: 3.67, currencyName: 'UAE Dirham' },
  [Currency.PKR]: { symbol: 'Rs. ', rateMultiplier: 278.0, currencyName: 'Pakistani Rupee' },
};

export interface TuitionPlanTier {
  id: string;
  name: string;
  classesPerWeek: number;
  classDurationMins: number;
  type: 'ONE_TO_ONE' | 'CIRCLE';
  popular?: boolean;
  recommendedFor: string;
  baseUsdPrice: number;
  features: string[];
}

export const TUITION_PLANS_CATALOG: TuitionPlanTier[] = [
  {
    id: 'plan-starter',
    name: 'Starter Pace',
    classesPerWeek: 2,
    classDurationMins: 30,
    type: 'ONE_TO_ONE',
    recommendedFor: 'Beginners starting Qaida or busy adults',
    baseUsdPrice: 48,
    features: [
      '2 private 1-on-1 live classes per week (8 / month)',
      '30 minutes per class with dedicated vetted teacher',
      'Synchronized Mushaf with instant mistake tagging',
      'Parent portal with audio notes & attendance log',
      'Free rescheduling up to 4 hours in advance'
    ]
  },
  {
    id: 'plan-standard',
    name: 'Standard Momentum',
    classesPerWeek: 3,
    classDurationMins: 30,
    type: 'ONE_TO_ONE',
    popular: true,
    recommendedFor: 'Consistent Nazra & Tajweed mastery',
    baseUsdPrice: 69,
    features: [
      '3 private 1-on-1 live classes per week (12 / month)',
      '30 minutes per class with dedicated vetted teacher',
      'Complete lesson cards & monthly 5-rating report card',
      'Daily AI Practice assignments between lessons',
      'Spaced repetition tracking for retention',
      'Free sibling account linking with 15% discount'
    ]
  },
  {
    id: 'plan-intensive',
    name: 'Hifz Intensive',
    classesPerWeek: 5,
    classDurationMins: 45,
    type: 'ONE_TO_ONE',
    recommendedFor: 'Active Quran memorization & Muraja’ah',
    baseUsdPrice: 135,
    features: [
      '5 private 1-on-1 live classes per week (20 / month)',
      '45 minutes extended class for Sabaq, Sabqi & Manzil',
      '604-page interactive Hifz heatmap & milestone exams',
      'Quarterly formal oral examinations with external senior examiner',
      'Direct in-app messaging with teacher & academic supervisor',
      'Accredited Certificate of Hifz completion upon graduation'
    ]
  },
  {
    id: 'plan-circle',
    name: 'Group Halqa (Circle)',
    classesPerWeek: 3,
    classDurationMins: 45,
    type: 'CIRCLE',
    recommendedFor: 'Peer learning in small cohorts (max 6-8)',
    baseUsdPrice: 38,
    features: [
      '3 group sessions per week (45 minutes each)',
      'Small cohorts grouped strictly by age & level (max 8)',
      'Turn-based recitation queue & peer listening',
      'Shared interactive Mushaf & teacher pointer board',
      'Cost-effective option with engaging cohort dynamics'
    ]
  }
];

export const KNOWLEDGE_BASE_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'How does the free trial class work?',
    a: 'Your trial is a private, 30-minute 1-on-1 evaluation with a vetted Quran teacher. We assess your or your child’s current reading level, demonstrate the live synchronized Mushaf classroom, and provide an honest placement recommendation. No payment card is required.'
  },
  {
    q: 'Can we request a female teacher (Ustadha)?',
    a: 'Yes. We have vetted male (Ustadh) and female (Ustadha) teachers. You can select your gender preference during trial booking, and female-only classes are strictly assigned to female scholars.'
  },
  {
    q: 'What is your rescheduling and cancellation policy?',
    a: 'You can reschedule or cancel any class through the parent portal up to 4 hours before class time to automatically receive a make-up credit. You can also pause your subscription for up to 30 days without losing your teacher slot.'
  },
  {
    q: 'How does Hifzoon differ from Zoom or Skype lessons?',
    a: 'Hifzoon uses a purpose-built classroom with an authorized vector Mushaf where the teacher turns pages and highlights exact words with under 500ms synchronization. Vocal errors are categorized into 6 Tajweed types, lesson summaries are delivered in 15 minutes, and memorization is tracked across all 604 pages.'
  },
  {
    q: 'How are teachers vetted for child safety?',
    a: 'Every teacher completes a 5-stage vetting pipeline: recitation audit, live demo class examination, academic credential check, reference check, and mandatory child safeguarding training meeting COPPA and UK GDPR Children’s Code standards. Contact information is masked to ensure all communication stays safe and recorded on-platform.'
  },
  {
    q: 'What equipment is needed to attend classes?',
    a: 'Any laptop, tablet (iPad or Android), or desktop with a modern browser (Chrome, Edge, Safari, Firefox), a microphone, and a webcam. No software installation is required.'
  }
];

export const PARENT_TESTIMONIALS = [
  {
    quote: 'The difference between Hifzoon and our previous Zoom lessons is night and day. The synchronized Mushaf keeps my 7-year-old completely engaged, and the monthly report card gives my husband and me genuine clarity on his Tajweed progress.',
    parent: 'Dr. Aisha Rahman',
    location: 'London, United Kingdom',
    children: 'Parent of Rayan (Age 7) & Zoya (Age 9)',
    rating: 5
  },
  {
    quote: 'Finding a reliable, punctual Quran teacher in our local US Central timezone was difficult. With Hifzoon, Sheikh Bilal is consistently on time, the classroom opens right in our browser, and I can review lesson notes from my phone.',
    parent: 'Tariq Al-Mansoor',
    location: 'Dallas, Texas, USA',
    children: 'Parent of Hamza (Age 11, Hifz Student)',
    rating: 5
  },
  {
    quote: 'The 604-page Hifz heatmap is an incredible motivator. My daughter loves seeing her pages transition to solid green. The teachers are gentle, patient, and deeply knowledgeable.',
    parent: 'Maryam & Farhan Qureshi',
    location: 'Toronto, Canada',
    children: 'Parents of Sarah (Age 13, 12 Juz Memorized)',
    rating: 5
  }
];
