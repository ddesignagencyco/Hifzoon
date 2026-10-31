import { type PrismaClient, type Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomBytes } from 'crypto';
import { applyLessonCardToPages } from '../src/modules/hifz/page-engine';

/**
 * A working academy for development and demos: teachers, families, children, eight weeks
 * of classes behind and three ahead, lesson cards, Hifz page states, subscriptions and
 * invoices, CRM leads and tasks, cases, QA reviews, payroll, messages and notifications.
 *
 * Every record is consistent with the others (a lesson card exists only for a class that
 * happened, an invoice only for a period a subscription covered, a lead points at the
 * family it became). Names are real-sounding; e-mail addresses stay on the non-routable
 * `hifzoon.test` domain so nothing can ever be sent to a real person.
 *
 * Runs once: if the academy is already there, it does nothing.
 */

type Db = PrismaClient;
const DAY = 86_400_000;
const LONDON = 'Europe/London';

// Deterministic "randomness", so a re-seed produces the same academy.
let state = 20261030;
const rand = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

const HOMEWORK: Record<string, string[]> = {
  HIFZ: [
    'Recite the new page 5 times from memory before Fajr, and once to a parent.',
    'Revise the last 5 pages (sabqi) twice each day.',
    'Listen to Sheikh Husary for the new page, then recite it 3 times.',
    'Write down the two places you stopped and repeat them 10 times.',
  ],
  QAIDA: [
    'Practise the letters with fatha, kasra and damma from today’s page, 10 minutes a day.',
    'Read the joined letters on page 14 slowly to a parent each evening.',
    'Trace the heavy letters (خ ص ض غ ط ق ظ) and say each one out loud.',
  ],
  NAZRA: [
    'Read Surah An-Naba ayahs 1–20 daily, pointing at each word.',
    'Practise madd (stretching) in today’s ayahs — two counts, no more.',
    'Read the same page twice a day, once slowly and once at normal pace.',
  ],
  TAJWEED: [
    'Mark every ikhfa in Surah Al-Mulk 1–10 and recite them with ghunnah.',
    'Record yourself reading Al-Fatiha and listen for the qalqalah letters.',
    'Revise the rules of noon sakinah with the chart we used in class.',
  ],
};

const PARENT_NOTES = [
  'Very focused today, mashaAllah.',
  'Good effort — a little tired towards the end of class.',
  'Excellent revision; the new portion needs a little more practice at home.',
  'Please help with the daily revision; it shows in class when it is done.',
  'Lovely recitation today, keep it up.',
];

const MISTAKE_TYPES = ['TAJWEED_RULE', 'LETTER_MAKHRAJ', 'VOWEL_HARAKAH', 'SKIPPED_WORD', 'STOP_WAQF'] as const;

interface TeacherSeed {
  email: string;
  name: string;
  gender: 'MALE' | 'FEMALE';
  zone: string;
  languages: string[];
  subjects: string[];
  ageGroups: string[];
  tier: 'STANDARD' | 'CERTIFIED' | 'SENIOR';
  bio: string;
  qualifications: Record<string, unknown>;
  /** Weekly availability in the teacher's own zone: [weekday 0=Sun..6, "HH:mm", "HH:mm"]. */
  hours: Array<[number, string, string]>;
}

const TEACHERS: TeacherSeed[] = [
  {
    email: 'ustadhah.maryam@hifzoon.test',
    name: 'Ustadhah Maryam Farooq',
    gender: 'FEMALE',
    zone: LONDON,
    languages: ['en', 'ur', 'ar'],
    subjects: ['QAIDA', 'NAZRA', 'TAJWEED'],
    ageGroups: ['4-6', '6-9', '10-13'],
    tier: 'CERTIFIED',
    bio: 'Ustadhah Maryam has taught Noorani Qaida and Nazra to young girls and boys for nine years. She holds an ijazah in Hafs ʿan ʿAsim and is known for patient, gentle classes.',
    qualifications: { ijazah: 'Hafs ʿan ʿAsim', yearsTeaching: 9, education: 'Alimah course, Jamia Al-Kauthar' },
    hours: [[1, '16:00', '19:00'], [2, '16:00', '19:00'], [3, '16:00', '19:00'], [4, '16:00', '19:00']],
  },
  {
    email: 'ustadh.abdulrahman@hifzoon.test',
    name: 'Ustadh Abdul Rahman Qasmi',
    gender: 'MALE',
    zone: 'Asia/Karachi',
    languages: ['ur', 'en', 'ar'],
    subjects: ['HIFZ', 'MURAJAAH', 'IJAZAH', 'NAZRA'],
    ageGroups: ['10-13', '14+'],
    tier: 'SENIOR',
    bio: 'A hafiz since the age of twelve, Ustadh Abdul Rahman taught Hifz at a madrasa in Lahore for fourteen years before teaching online. He specialises in strong manzil revision.',
    qualifications: { ijazah: 'Hafs ʿan ʿAsim with sanad', yearsTeaching: 14, education: 'Dars-e-Nizami, Jamia Ashrafia Lahore' },
    hours: [[0, '17:00', '21:00'], [1, '17:00', '21:00'], [3, '17:00', '21:00'], [5, '17:00', '21:00'], [6, '17:00', '21:00']],
  },
  {
    email: 'ustadhah.hafsa@hifzoon.test',
    name: 'Ustadhah Hafsa Ahmed',
    gender: 'FEMALE',
    zone: LONDON,
    languages: ['en'],
    subjects: ['QAIDA', 'NAZRA', 'ISLAMIC_STUDIES'],
    ageGroups: ['6-9', '10-13'],
    tier: 'STANDARD',
    bio: 'Ustadhah Hafsa teaches reading the Qur’an from the Mushaf and Islamic Studies for children, with clear structure and plenty of encouragement.',
    qualifications: { yearsTeaching: 5, education: 'BA Islamic Studies, University of Birmingham' },
    hours: [[1, '17:30', '20:00'], [2, '17:30', '23:59'], [4, '17:30', '20:00'], [5, '17:30', '23:59'], [6, '09:00', '12:00']],
  },
  {
    email: 'ustadh.idris@hifzoon.test',
    name: 'Ustadh Idris Mahmood',
    gender: 'MALE',
    zone: LONDON,
    languages: ['en', 'ar'],
    subjects: ['TAJWEED', 'ARABIC', 'NAZRA'],
    ageGroups: ['10-13', '14+'],
    tier: 'CERTIFIED',
    bio: 'Ustadh Idris studied Arabic in Cairo and teaches Tajweed rules in context, so students hear and feel each rule as they recite.',
    qualifications: { ijazah: 'Tuhfat al-Atfal and Al-Jazariyyah', yearsTeaching: 7, education: 'Arabic diploma, Al-Azhar language centre' },
    hours: [[1, '18:00', '21:00'], [3, '18:00', '21:00'], [4, '18:00', '21:00']],
  },
];

/** A weekly slot in a zone: luxon weekday (1 = Monday) and local time. */
type Slot = { weekday: number; time: string };

export async function seedAcademy(prisma: Db, passwordHash: string): Promise<void> {
  if (await prisma.family.findFirst({ where: { name: 'Chaudhry Family' }, select: { id: true } })) {
    console.log('  academy: already seeded');
    return;
  }

  const now = DateTime.now();
  const historyFrom = now.minus({ weeks: 8 }).startOf('day');
  const horizon = now.plus({ weeks: 3 }).endOf('day');

  const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true, name: true } });
  const admin = await user('admin@hifzoon.test');
  const superAdmin = await user('superadmin@hifzoon.test');
  const supervisor = await user('supervisor@hifzoon.test');
  const safeguardingLead = await user('safeguarding@hifzoon.test');

  const courses = new Map(
    (await prisma.course.findMany({ select: { id: true, code: true, name: true, levels: { orderBy: { position: 'asc' }, select: { id: true } } } })).map((c) => [c.code, c]),
  );
  const plans = new Map((await prisma.plan.findMany({ select: { id: true, code: true, name: true, classMinutes: true, roomType: true, tierId: true } })).map((p) => [p.code, p]));
  const tiers = new Map((await prisma.teacherTier.findMany({ select: { id: true, code: true } })).map((t) => [t.code, t.id]));
  const price = async (planCode: string, currency: string) =>
    (await prisma.planPrice.findFirst({ where: { planId: plans.get(planCode)!.id, currency: currency as never }, select: { amountMinor: true } }))?.amountMinor ?? 0;

  // ── Teachers ───────────────────────────────────────────────────────────────
  const teacherIds = new Map<string, { profileId: string; userId: string; zone: string }>();

  const bilal = await prisma.teacherProfile.findFirstOrThrow({ where: { user: { email: 'teacher@hifzoon.test' } }, select: { id: true, userId: true } });
  await prisma.teacherProfile.update({
    where: { id: bilal.id },
    data: {
      tierId: tiers.get('SENIOR'),
      bio: 'Ustadh Bilal completed his Hifz in Bradford and has taught Hifz and Tajweed in the UK for twelve years. Calm, structured, and strict about daily revision.',
      qualifications: { ijazah: 'Hafs ʿan ʿAsim', yearsTeaching: 12, education: 'Alim course, Darul Uloom Bury' },
      ageGroups: ['6-9', '10-13', '14+'],
    },
  });
  teacherIds.set('teacher@hifzoon.test', { profileId: bilal.id, userId: bilal.userId, zone: LONDON });
  await setAvailability(prisma, bilal.id, LONDON, [[1, '16:00', '20:00'], [2, '16:00', '20:00'], [3, '16:00', '20:00'], [4, '16:00', '20:00'], [5, '16:00', '19:00']]);

  // The trainee is a woman; the base seed creates every teacher as male.
  await prisma.teacherProfile.updateMany({ where: { user: { email: 'teacher.trainee@hifzoon.test' } }, data: { gender: 'FEMALE', ageGroups: ['4-6', '6-9'] } });

  for (const t of TEACHERS) {
    const created = await createClearedTeacher(prisma, t, passwordHash, tiers.get(t.tier) ?? null);
    teacherIds.set(t.email, { ...created, zone: t.zone });
    await setAvailability(prisma, created.profileId, t.zone, t.hours);
  }
  const T = (email: string) => teacherIds.get(email)!;

  // A pending profile change, so Admin → Teachers → Profile changes has work in it.
  await prisma.teacherProfile.update({
    where: { id: T('ustadhah.hafsa@hifzoon.test').profileId },
    data: {
      pendingProfileChanges: {
        bio: 'Ustadhah Hafsa teaches reading from the Mushaf, Noorani Qaida and Islamic Studies for children aged 6–13, with clear structure and plenty of encouragement.',
        ageGroups: ['4-6', '6-9', '10-13'],
      },
      pendingProfileChangesAt: now.minus({ days: 1 }).toJSDate(),
    },
  });

  // Applicants still in the hiring pipeline.
  await createApplicant(prisma, 'Ustadh Yahya Karim', 'yahya.karim@hifzoon.test', 'GB', 'RECITATION_REVIEW', []);
  await createApplicant(prisma, 'Ustadhah Ruqayyah Begum', 'ruqayyah.begum@hifzoon.test', 'GB', 'DEMO_CLASS', ['SUBMITTED', 'RECITATION_REVIEW']);
  await createApplicant(prisma, 'Ustadh Zakariya Osman', 'zakariya.osman@hifzoon.test', 'CA', 'REJECTED', ['SUBMITTED', 'RECITATION_REVIEW', 'DEMO_CLASS'], 'ID_CHECK');

  // ── Families ──────────────────────────────────────────────────────────────
  const khan = await prisma.family.findUniqueOrThrow({ where: { id: '00000000-0000-7000-8000-000000000001' }, select: { id: true } });
  const maryamKhan = '00000000-0000-7000-8000-000000000011';
  const yusufKhan = '00000000-0000-7000-8000-000000000012';
  await addGuardian(prisma, khan.id, { email: 'faisal.khan@hifzoon.test', name: 'Faisal Khan', phone: '+447700900456', relationship: 'PARENT' }, passwordHash, LONDON);

  const chaudhry = await createFamily(prisma, passwordHash, {
    name: 'Chaudhry Family', country: 'GB', currency: 'GBP', zone: LONDON, billingName: 'Sadia Chaudhry',
    guardians: [
      { email: 'sadia.chaudhry@hifzoon.test', name: 'Sadia Chaudhry', phone: '+447700900611', relationship: 'PARENT' },
      { email: 'tariq.chaudhry@hifzoon.test', name: 'Tariq Chaudhry', phone: '+447700900612', relationship: 'PARENT' },
    ],
    children: [
      { name: 'Ibrahim', age: 11, gender: 'MALE', language: 'en' },
      { name: 'Zainab', age: 7, gender: 'FEMALE', language: 'en', kidsMode: true },
    ],
  });
  const hussain = await createFamily(prisma, passwordHash, {
    name: 'Hussain Family', country: 'GB', currency: 'GBP', zone: LONDON, billingName: 'Nadia Hussain',
    guardians: [{ email: 'nadia.hussain@hifzoon.test', name: 'Nadia Hussain', phone: '+447700900733', relationship: 'PARENT' }],
    children: [{ name: 'Adam', age: 13, gender: 'MALE', language: 'en' }],
  });
  const alAmin = await createFamily(prisma, passwordHash, {
    name: 'Al-Amin Family', country: 'AE', currency: 'AED', zone: 'Asia/Dubai', billingName: 'Omar Al-Amin',
    guardians: [{ email: 'omar.alamin@hifzoon.test', name: 'Omar Al-Amin', phone: '+971501234567', relationship: 'PARENT' }],
    children: [{ name: 'Aisha', age: 10, gender: 'FEMALE', language: 'ar' }],
  });
  const malik = await createFamily(prisma, passwordHash, {
    name: 'Malik Family', country: 'US', currency: 'USD', zone: 'America/Chicago', billingName: 'Rubina Malik',
    guardians: [{ email: 'rubina.malik@hifzoon.test', name: 'Rubina Malik', phone: '+17135550142', relationship: 'PARENT' }],
    children: [{ name: 'Hamza', age: 8, gender: 'MALE', language: 'en', kidsMode: true }],
  });
  const sheikh = await createFamily(prisma, passwordHash, {
    name: 'Sheikh Family', country: 'PK', currency: 'PKR', zone: 'Asia/Karachi', billingName: 'Asif Sheikh',
    guardians: [{ email: 'asif.sheikh@hifzoon.test', name: 'Asif Sheikh', phone: '+923001234567', relationship: 'PARENT' }],
    children: [
      { name: 'Fatima', age: 12, gender: 'FEMALE', language: 'ur' },
      { name: 'Usman', age: 14, gender: 'MALE', language: 'ur' },
    ],
  });
  const begum = await createFamily(prisma, passwordHash, {
    name: 'Begum Family', country: 'GB', currency: 'GBP', zone: LONDON, billingName: 'Shazia Begum',
    guardians: [{ email: 'shazia.begum@hifzoon.test', name: 'Shazia Begum', phone: '+447700900844', relationship: 'PARENT' }],
    children: [{ name: 'Musa', age: 9, gender: 'MALE', language: 'en', kidsMode: true }],
  });

  // ── Enrolments, subscriptions, schedules and classes ──────────────────────
  const ctx: Ctx = { prisma, now, historyFrom, horizon, courses, plans, price, admin: admin.id, invoiceNo: { n: 0 }, cardsForHifz: [] };

  // Khan: Yusuf (Hifz with Ustadh Bilal), Maryam (Qaida with Ustadhah Maryam — a woman for a young girl).
  await prisma.enrolment.update({ where: { id: '00000000-0000-7000-8000-000000000101' }, data: { teacherId: T('ustadhah.maryam@hifzoon.test').profileId } });
  const yusuf = await programme(ctx, {
    familyId: khan.id, studentId: yusufKhan, enrolmentId: '00000000-0000-7000-8000-000000000102', course: 'HIFZ', teacher: T('teacher@hifzoon.test'),
    zone: LONDON, slots: [{ weekday: 1, time: '17:00' }, { weekday: 3, time: '17:00' }], plan: 'ONE_TO_ONE_2X', currency: 'GBP',
    startedWeeksAgo: 10, level: 1, lessonPosition: 6, trialTime: '16:30', startPage: 562, latestUncarded: true,
  });
  const maryam = await programme(ctx, {
    familyId: khan.id, studentId: maryamKhan, enrolmentId: '00000000-0000-7000-8000-000000000101', course: 'QAIDA', teacher: T('ustadhah.maryam@hifzoon.test'),
    zone: LONDON, slots: [{ weekday: 2, time: '16:30' }], plan: 'ONE_TO_ONE_1X', currency: 'GBP',
    startedWeeksAgo: 9, level: 1, lessonPosition: 9, trialTime: '16:00', familyCancelAt: 3,
  });
  // Chaudhry: Ibrahim (Nazra, 2/week), Zainab (trial last week — continuing, plan not chosen yet).
  const ibrahim = await programme(ctx, {
    familyId: chaudhry.id, studentId: chaudhry.children.Ibrahim, course: 'NAZRA', teacher: T('ustadhah.hafsa@hifzoon.test'),
    zone: LONDON, slots: [{ weekday: 1, time: '18:00' }, { weekday: 4, time: '18:00' }], plan: 'ONE_TO_ONE_2X', currency: 'GBP',
    startedWeeksAgo: 7, level: 1, lessonPosition: 11, trialTime: '17:30', teacherCancelAt: 5, usedCredit: true,
  });
  const zainabTrial = await trialOnly(ctx, {
    familyId: chaudhry.id, studentId: chaudhry.children.Zainab, course: 'QAIDA', teacher: T('ustadhah.maryam@hifzoon.test'),
    at: zoned(now.minus({ days: 8 }), LONDON, '16:00'), outcome: 'WON', recommendedPlan: 'ONE_TO_ONE_1X',
  });
  // Hussain: Adam (Tajweed, 1/week) — the latest renewal was not paid.
  const adam = await programme(ctx, {
    familyId: hussain.id, studentId: hussain.children.Adam, course: 'TAJWEED', teacher: T('ustadh.idris@hifzoon.test'),
    zone: LONDON, slots: [{ weekday: 3, time: '19:00' }], plan: 'ONE_TO_ONE_1X', currency: 'GBP',
    startedWeeksAgo: 8, level: 1, lessonPosition: 7, trialTime: '18:30', pastDue: true,
  });
  // Al-Amin: Aisha (Hifz with Ustadh Abdul Rahman, weekends in Dubai time).
  const aisha = await programme(ctx, {
    familyId: alAmin.id, studentId: alAmin.children.Aisha, course: 'HIFZ', teacher: T('ustadh.abdulrahman@hifzoon.test'),
    zone: 'Asia/Dubai', slots: [{ weekday: 6, time: '17:00' }, { weekday: 7, time: '17:00' }], plan: 'ONE_TO_ONE_2X', currency: 'AED',
    startedWeeksAgo: 9, level: 1, lessonPosition: 5, trialTime: '16:30', startPage: 582, teacherCancelAt: 4, refundTeacherCancel: true,
  });
  // Malik: Hamza (Qaida, Houston evenings) — the family cancelled; classes run to the period end.
  const hamza = await programme(ctx, {
    familyId: malik.id, studentId: malik.children.Hamza, course: 'QAIDA', teacher: T('ustadhah.hafsa@hifzoon.test'),
    zone: 'America/Chicago', slots: [{ weekday: 2, time: '17:00' }, { weekday: 5, time: '17:00' }], plan: 'ONE_TO_ONE_2X', currency: 'USD',
    startedWeeksAgo: 6, level: 1, lessonPosition: 8, trialTime: '16:30', endingAtPeriodEnd: true,
  });
  // Begum: Musa (Nazra) — paused for two weeks while the family travels.
  const musa = await programme(ctx, {
    familyId: begum.id, studentId: begum.children.Musa, course: 'NAZRA', teacher: T('ustadhah.maryam@hifzoon.test'),
    zone: LONDON, slots: [{ weekday: 4, time: '16:30' }], plan: 'ONE_TO_ONE_1X', currency: 'GBP',
    startedWeeksAgo: 8, level: 1, lessonPosition: 6, trialTime: '16:00', pausedWeeksAgo: 1,
  });
  // Sheikh: two trials with Ustadh Abdul Rahman — Usman's was yesterday (result not saved yet), Fatima's is in two days.
  const usmanTrial = await trialOnly(ctx, {
    familyId: sheikh.id, studentId: sheikh.children.Usman, course: 'HIFZ', teacher: T('ustadh.abdulrahman@hifzoon.test'),
    at: zoned(now.minus({ days: 1 }), 'Asia/Karachi', '19:00'), outcome: null,
  });
  const fatimaTrial = await trialOnly(ctx, {
    familyId: sheikh.id, studentId: sheikh.children.Fatima, course: 'NAZRA', teacher: T('ustadh.abdulrahman@hifzoon.test'),
    at: zoned(now.plus({ days: 2 }), 'Asia/Karachi', '19:00'), outcome: null,
  });

  // Hifz page states follow the lesson cards, oldest first (the same engine the app runs).
  for (const cardId of ctx.cardsForHifz) await applyLessonCardToPages(prisma, cardId);

  // ── Ratings and quality reviews ───────────────────────────────────────────
  await rate(prisma, yusuf.completed.slice(-2), khan.id, yusufKhan, [5, 5]);
  await rate(prisma, ibrahim.completed.slice(-1), chaudhry.id, chaudhry.children.Ibrahim, [5], ['JazakAllah khair, Ibrahim loves these classes.']);
  await rate(prisma, aisha.completed.slice(-1), alAmin.id, alAmin.children.Aisha, [4]);
  await rate(prisma, adam.completed.slice(-1), hussain.id, hussain.children.Adam, [2], ['The class started late again and felt rushed.']);

  const rubric = await prisma.qaRubric.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' }, select: { id: true, criteria: true } });
  if (rubric) {
    const keys = ((rubric.criteria as { items?: Array<{ key: string }> })?.items ?? []).map((i) => i.key);
    const review = async (classId: string | undefined, scores: number[], feedback: string, reply?: string) => {
      if (!classId) return;
      const session = await prisma.classSession.findUniqueOrThrow({ where: { id: classId }, select: { teacherId: true, endsAt: true } });
      await prisma.qaReview.create({
        data: {
          classId, supervisorId: supervisor.id, rubricId: rubric.id, source: 'RANDOM_SAMPLE',
          scores: Object.fromEntries(keys.map((k, i) => [k, scores[i % scores.length]])),
          feedback, teacherReply: reply ?? null, reviewedAt: new Date(session.endsAt.getTime() + 2 * DAY),
        },
      });
      await prisma.qaSample.create({ data: { teacherId: session.teacherId, classId, period: DateTime.fromJSDate(session.endsAt).toFormat('yyyy-MM'), source: 'RANDOM_SAMPLE' } }).catch(() => undefined);
    };
    await review(yusuf.completed.at(-4), [5, 5, 4, 5, 4], 'Strong sabaq and a well-paced revision. Close with the next portion stated clearly.', 'JazakAllah khair — I will state the next portion at the end of every class.');
    await review(aisha.completed.at(-3), [5, 4, 5, 4, 5], 'Excellent manzil checking. Good use of Urdu to explain the stopping signs.');
    await review(adam.completed.at(-2), [3, 3, 4, 2, 3], 'The class started 8 minutes late and homework was not set. Please start on time and close with homework.');
    await review(ibrahim.completed.at(-3), [4, 5, 4, 4, 5], 'Clear corrections and lots of encouragement — Ibrahim was very engaged.');
  }

  // ── CRM: leads and follow-up tasks ────────────────────────────────────────
  const lead = (data: Prisma.LeadUncheckedCreateInput) => prisma.lead.create({ data });
  const ago = (d: number) => now.minus({ days: d }).toJSDate();
  const wonLeads = [
    { family: khan.id, contact: 'Ayesha Khan', email: 'parent@hifzoon.test', phone: '+447700900123', country: 'GB', region: 'England', city: 'London', source: 'website', course: 'HIFZ', age: 15, trial: yusuf.trialClassId, days: 72 },
    { family: hussain.id, contact: 'Nadia Hussain', email: 'nadia.hussain@hifzoon.test', phone: '+447700900733', country: 'GB', region: 'England', city: 'Birmingham', source: 'referral', course: 'TAJWEED', age: 13, trial: adam.trialClassId, days: 58 },
    { family: alAmin.id, contact: 'Omar Al-Amin', email: 'omar.alamin@hifzoon.test', phone: '+971501234567', country: 'AE', region: 'Dubai', city: 'Dubai', source: 'instagram', course: 'HIFZ', age: 10, trial: aisha.trialClassId, days: 65 },
    { family: malik.id, contact: 'Rubina Malik', email: 'rubina.malik@hifzoon.test', phone: '+17135550142', country: 'US', region: 'Texas', city: 'Houston', source: 'google', course: 'QAIDA', age: 8, trial: hamza.trialClassId, days: 44 },
    { family: begum.id, contact: 'Shazia Begum', email: 'shazia.begum@hifzoon.test', phone: '+447700900844', country: 'GB', region: 'England', city: 'Leicester', source: 'event', course: 'NAZRA', age: 9, trial: musa.trialClassId, days: 58 },
    { family: chaudhry.id, contact: 'Sadia Chaudhry', email: 'sadia.chaudhry@hifzoon.test', phone: '+447700900611', country: 'GB', region: 'England', city: 'Manchester', source: 'whatsapp', course: 'NAZRA', age: 11, trial: ibrahim.trialClassId, days: 52 },
  ];
  for (const w of wonLeads) {
    await lead({ status: 'WON', familyId: w.family, contactName: w.contact, email: w.email, phone: w.phone, country: w.country, region: w.region, city: w.city, source: w.source, courseInterest: w.course, childAge: w.age, trialClassId: w.trial, ownerId: admin.id, createdAt: ago(w.days) });
  }
  // Chaudhry again for Zainab: trial done, waiting for the family to choose a plan.
  const zainabLead = await lead({ status: 'TRIAL_DONE', familyId: chaudhry.id, contactName: 'Sadia Chaudhry', email: 'sadia.chaudhry@hifzoon.test', phone: '+447700900611', country: 'GB', region: 'England', city: 'Manchester', source: 'whatsapp', courseInterest: 'QAIDA', childAge: 7, trialClassId: zainabTrial.classId, ownerId: admin.id, createdAt: ago(12) });
  const sheikhLead = await lead({ status: 'TRIAL_BOOKED', familyId: sheikh.id, contactName: 'Asif Sheikh', email: 'asif.sheikh@hifzoon.test', phone: '+923001234567', country: 'PK', region: 'Punjab', city: 'Lahore', postcode: '54000', source: 'facebook', courseInterest: 'HIFZ', childAge: 14, trialClassId: usmanTrial.classId, ownerId: admin.id, createdAt: ago(6) });
  const newLeads = [
    await lead({ status: 'NEW', contactName: 'Halima Yusuf', email: 'halima.yusuf@hifzoon.test', phone: '+447700900951', country: 'GB', region: 'England', city: 'Bradford', source: 'website', courseInterest: 'QAIDA', childAge: 6, createdAt: ago(1), notes: 'Asked about a female teacher for her daughter.' }),
    await lead({ status: 'NEW', contactName: 'Kamran Butt', phone: '+447700900962', country: 'GB', region: 'Scotland', city: 'Glasgow', source: 'whatsapp', courseInterest: 'HIFZ', childAge: 12, createdAt: ago(2), ownerId: admin.id }),
    await lead({ status: 'NEW', contactName: 'Amina Okafor', email: 'amina.okafor@hifzoon.test', country: 'CA', region: 'Ontario', city: 'Toronto', source: 'youtube', courseInterest: 'NEW_MUSLIM', createdAt: ago(3), notes: 'Recently took shahada; wants to learn to read Al-Fatiha.' }),
  ];
  await lead({ status: 'LOST', contactName: 'Saima Rauf', email: 'saima.rauf@hifzoon.test', country: 'GB', region: 'England', city: 'Luton', source: 'facebook', courseInterest: 'NAZRA', childAge: 10, lostReason: 'Chose the local masjid evening class.', createdAt: ago(40) });
  await lead({ status: 'LOST', contactName: 'Junaid Akhtar', phone: '+447700900977', country: 'GB', region: 'England', city: 'Leeds', source: 'google', courseInterest: 'HIFZ', childAge: 15, lostReason: 'Available times did not suit the family (only before school).', createdAt: ago(30) });

  const task = (data: Prisma.TaskUncheckedCreateInput) => prisma.task.create({ data });
  await task({ leadId: newLeads[0].id, type: 'OTHER', assigneeId: admin.id, dueAt: now.plus({ hours: 20 }).toJSDate(), note: 'First contact for Halima Yusuf' });
  await task({ leadId: newLeads[1].id, type: 'OTHER', assigneeId: admin.id, dueAt: now.minus({ days: 1 }).toJSDate(), note: 'First contact for Kamran Butt' });
  await task({ leadId: newLeads[2].id, type: 'OTHER', assigneeId: admin.id, dueAt: now.plus({ days: 1 }).toJSDate(), note: 'Call Amina about the New Muslim course' });
  await task({ leadId: sheikhLead.id, type: 'OTHER', assigneeId: admin.id, dueAt: now.minus({ hours: 2 }).toJSDate(), note: 'Ask Ustadh Abdul Rahman how Usman’s trial went' });
  await task({ leadId: zainabLead.id, type: 'TRIAL_NOT_CONVERTED', assigneeId: admin.id, dueAt: now.plus({ days: 2 }).toJSDate(), note: 'Remind Sadia to choose Zainab’s plan and weekly time' });
  await task({ leadId: sheikhLead.id, type: 'OTHER', assigneeId: admin.id, dueAt: ago(5), status: 'DONE', completedAt: ago(5), note: 'Welcome call before the trials' });

  // ── Billing extras: a teacher change, make-up credits, refunds ────────────
  await prisma.teacherChangeRequest.create({
    data: { familyId: begum.id, studentId: begum.children.Musa, enrolmentId: musa.enrolmentId, reason: 'When we are back, Thursday evenings no longer work. Could Musa move to a teacher with Saturday morning times?', createdAt: ago(2) },
  });
  await prisma.teacherChangeRequest.create({
    data: {
      familyId: khan.id, studentId: yusufKhan, enrolmentId: yusuf.enrolmentId, reason: 'Wondering if a teacher who speaks Urdu would help Yusuf’s grandmother follow along.',
      status: 'DECLINED', resolvedById: admin.id, resolvedAt: ago(30), createdAt: ago(33),
      resolutionNote: 'Ustadh Bilal also speaks Urdu — he has offered to give the end-of-class summary in Urdu as well.',
    },
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  await thread(prisma, khan.id, T('teacher@hifzoon.test'), yusufKhan, yusuf.enrolmentId, [
    ['parent@hifzoon.test', 'Assalamu alaikum Ustadh, Yusuf has exams next week — could we keep the same portion size?', 6],
    ['teacher@hifzoon.test', 'Wa alaikum assalam. Of course — we will keep the sabaq to half a page and focus on revision until his exams finish.', 6],
    ['parent@hifzoon.test', 'JazakAllah khair, that helps a lot.', 5],
    ['teacher@hifzoon.test', 'He did very well today. Please make sure he revises the last five pages before Monday.', 1],
  ]);
  await thread(prisma, chaudhry.id, T('ustadhah.hafsa@hifzoon.test'), chaudhry.children.Ibrahim, ibrahim.enrolmentId, [
    ['sadia.chaudhry@hifzoon.test', 'Salam Ustadhah, Ibrahim says he finds the madd rules confusing.', 4],
    ['ustadhah.hafsa@hifzoon.test', 'Wa alaikum assalam. That is very normal at this stage — I will spend ten minutes on madd with him on Monday and send a short practice sheet.', 4],
  ]);
  await thread(prisma, alAmin.id, T('ustadh.abdulrahman@hifzoon.test'), alAmin.children.Aisha, aisha.enrolmentId, [
    ['ustadh.abdulrahman@hifzoon.test', 'Assalamu alaikum brother Omar. Aisha completed Surah Al-Mulk this week, alhamdulillah.', 2],
    ['omar.alamin@hifzoon.test', 'Alhamdulillah! Thank you Ustadh, she is very happy.', 1],
  ]);

  // ── Cases ─────────────────────────────────────────────────────────────────
  const teacherUser = (email: string) => prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const sg = await prisma.caseRecord.create({
    data: {
      type: 'SAFEGUARDING', severity: 'HIGH', status: 'INVESTIGATING', openedById: (await teacherUser('teacher@hifzoon.test')).id, ownerId: safeguardingLead.id,
      summary: 'During class a student said he is often left alone at home late in the evening and seemed worried. Raised for the safeguarding lead to follow up with the family.',
      dueAt: ago(3), alertedAt: ago(3), createdAt: ago(3),
    },
  });
  await prisma.caseNote.create({ data: { caseId: sg.id, authorId: safeguardingLead.id, note: 'Acknowledged within 10 minutes. Spoke with the teacher; no immediate risk identified.', createdAt: ago(3) } });
  await prisma.caseNote.create({ data: { caseId: sg.id, authorId: safeguardingLead.id, note: 'Call booked with the guardian for tomorrow to understand the evening arrangements.', createdAt: ago(1) } });
  await prisma.caseRecord.create({
    data: {
      type: 'COMPLAINT', severity: 'MEDIUM', status: 'OPEN', openedById: (await teacherUser('nadia.hussain@hifzoon.test')).id, subjectUserId: (await teacherUser('ustadh.idris@hifzoon.test')).id,
      summary: 'Adam’s class has started late twice this month and the last one ended without any homework.', dueAt: now.plus({ days: 2 }).toJSDate(), alertedAt: ago(1), createdAt: ago(1),
    },
  });
  const closed = await prisma.caseRecord.create({
    data: {
      type: 'COMPLAINT', severity: 'LOW', status: 'CLOSED', openedById: (await teacherUser('rubina.malik@hifzoon.test')).id,
      summary: 'Class reminder arrived in UK time instead of Houston time.', dueAt: ago(20), alertedAt: ago(22), closedAt: ago(19), createdAt: ago(22),
    },
  });
  await prisma.caseNote.create({ data: { caseId: closed.id, authorId: admin.id, note: 'The family time zone was set to London. Corrected to America/Chicago and apologised to Mrs Malik.', createdAt: ago(19) } });

  // ── Payroll: last month, paid ─────────────────────────────────────────────
  await payroll(prisma, now, admin.id);

  // ── Practice at home ──────────────────────────────────────────────────────
  for (const [studentId, sessions] of [[yusufKhan, [25, 20, 30, 15]], [alAmin.children.Aisha, [20, 25]], [chaudhry.children.Ibrahim, [10, 15, 10]]] as const) {
    for (let i = 0; i < sessions.length; i += 1) {
      const startedAt = now.minus({ days: i + 1 }).set({ hour: 7, minute: 10 }).toJSDate();
      await prisma.practiceSession.create({ data: { studentId, startedAt, endedAt: new Date(startedAt.getTime() + sessions[i] * 60_000), minutes: sessions[i], wordsRecited: sessions[i] * 18 } });
    }
  }

  // ── Notifications (what each person would have received) ─────────────────
  const notify = async (email: string, type: string, subject: string, body: string, daysAgo: number, read: boolean, extra: Record<string, unknown> = {}) => {
    const u = await teacherUser(email);
    const at = now.minus({ days: daysAgo }).toJSDate();
    await prisma.notification.create({
      data: { userId: u.id, type, channel: 'EMAIL', payload: { subject, body, ...extra } as never, status: 'SENT', sentAt: at, createdAt: at, readAt: read ? at : null },
    });
  };
  await notify('parent@hifzoon.test', 'lesson-card.ready', 'Yusuf’s lesson card is ready', 'Ustadh Bilal shared today’s lesson card: new page, revision and homework.', 1, false, { studentName: 'Yusuf' });
  await notify('parent@hifzoon.test', 'class.reminder.day-before', 'Class tomorrow: Maryam', 'Maryam’s Noorani Qaida class with Ustadhah Maryam Farooq is tomorrow at 16:30.', 2, true);
  await notify('parent@hifzoon.test', 'billing.subscribed', 'Your plan has started', 'One-to-one, 2 classes/week has started for Yusuf on Mondays and Wednesdays at 17:00.', 70, true);
  await notify('sadia.chaudhry@hifzoon.test', 'billing.subscribed', 'Zainab’s trial result', 'Ustadhah Maryam recommends One-to-one, 1 class/week for Zainab. Choose a plan and a weekly time to continue.', 7, false);
  await notify('nadia.hussain@hifzoon.test', 'billing.renewal-failed', 'Payment due for Adam’s plan', 'This month’s payment for One-to-one, 1 class/week has not been received. Classes continue while you pay.', 3, false);
  await notify('rubina.malik@hifzoon.test', 'billing.plan-ending', 'Hamza’s plan ends at the end of this period', 'As requested, classes continue until the end of the paid period. Changed your mind? Keep the plan from Billing.', 9, true);
  await notify('teacher@hifzoon.test', 'qa.review.posted', 'A supervisor reviewed one of your classes', 'Your class with Yusuf was reviewed (average 4.6/5).', 10, true);
  await notify('ustadh.idris@hifzoon.test', 'qa.review.posted', 'A supervisor reviewed one of your classes', 'Your class with Adam was reviewed (average 3/5). Read the feedback and reply.', 4, false);
  await notify('supervisor@hifzoon.test', 'qa.low-rating', 'Low family rating for Ustadh Idris Mahmood', 'A family rated a class with Ustadh Idris Mahmood 2/5: “The class started late again and felt rushed.”', 3, false);
  await notify('safeguarding@hifzoon.test', 'case.safeguarding-alert', 'Safeguarding report received', `A safeguarding report was raised in a class. Reference ${sg.id.slice(0, 8).toUpperCase()}.`, 3, true, { caseId: sg.id });
  await notify('admin@hifzoon.test', 'teacher.profile-change.submitted', 'Profile change to review: Ustadhah Hafsa Ahmed', 'Ustadhah Hafsa Ahmed changed her bio and age groups. Review it in Teachers → Profile changes.', 1, false);

  void [maryam, hamza, fatimaTrial, superAdmin];
  console.log(`  academy: ${TEACHERS.length + 1} cleared teachers, 7 families, ${await prisma.classSession.count()} classes, ${await prisma.lessonCard.count()} lesson cards, ${await prisma.invoice.count()} invoices`);
}

// ── Building blocks ────────────────────────────────────────────────────────

interface Ctx {
  prisma: Db;
  now: DateTime;
  historyFrom: DateTime;
  horizon: DateTime;
  courses: Map<string, { id: string; code: string; name: string; levels: Array<{ id: string }> }>;
  plans: Map<string, { id: string; code: string; name: string; classMinutes: number; roomType: string; tierId: string | null }>;
  price: (planCode: string, currency: string) => Promise<number>;
  admin: string;
  invoiceNo: { n: number };
  cardsForHifz: string[];
}

/** A local wall-clock time on a given day, as a UTC Date. */
function zoned(day: DateTime, zone: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return day.setZone(zone).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();
}

async function setAvailability(prisma: Db, teacherId: string, zone: string, hours: Array<[number, string, string]>) {
  await prisma.availabilitySlot.deleteMany({ where: { teacherId } });
  await prisma.availabilitySlot.createMany({
    data: hours.map(([weekday, from, to]) => ({
      teacherId,
      weekday,
      startTime: new Date(`1970-01-01T${from}:00Z`),
      endTime: new Date(`1970-01-01T${to === '23:59' ? '23:59' : to}:00Z`),
      timeZone: zone,
      effectiveFrom: DateTime.now().minus({ months: 6 }).toJSDate(),
    })),
  });
}

const HIRING_STEPS = ['SUBMITTED', 'RECITATION_REVIEW', 'DEMO_CLASS', 'ID_CHECK', 'REFERENCE_CHECK', 'TRAINING', 'APPROVED'] as const;

async function createClearedTeacher(prisma: Db, t: TeacherSeed, passwordHash: string, tierId: string | null) {
  const user = await prisma.user.create({
    data: {
      email: t.email, passwordHash, name: t.name, timeZone: t.zone, status: 'ACTIVE', emailVerifiedAt: new Date(),
      notificationPreferences: { create: {} }, roles: { create: [{ role: 'TEACHER' }] },
    },
  });
  const appliedAt = DateTime.now().minus({ months: 5 });
  const application = await prisma.teacherApplication.create({
    data: { applicantName: t.name, email: t.email, country: t.zone === 'Asia/Karachi' ? 'PK' : 'GB', qualifications: t.qualifications as never, status: 'APPROVED', userId: user.id, createdAt: appliedAt.toJSDate() },
  });
  await prisma.hiringStep.createMany({
    data: HIRING_STEPS.map((step, i) => ({ applicationId: application.id, step, status: 'PASSED' as const, completedAt: appliedAt.plus({ days: 3 * (i + 1) }).toJSDate() })),
  });
  const profile = await prisma.teacherProfile.create({
    data: {
      userId: user.id, bio: t.bio, gender: t.gender, languages: t.languages, subjects: t.subjects, ageGroups: t.ageGroups,
      qualifications: t.qualifications as never, hiringStatus: 'APPROVED', readyToMatch: true, tierId,
      safeguardingTrainingCompletedAt: appliedAt.plus({ days: 20 }).toJSDate(), ratingAvg: 0, ratingCount: 0,
    },
  });
  return { profileId: profile.id, userId: user.id };
}

async function createApplicant(prisma: Db, name: string, email: string, country: string, status: string, passed: string[], failed?: string) {
  const app = await prisma.teacherApplication.create({
    data: { applicantName: name, email, country, status: status as never, qualifications: { yearsTeaching: 3 } as never, createdAt: DateTime.now().minus({ days: 10 + passed.length * 3 }).toJSDate() },
  });
  await prisma.hiringStep.createMany({
    data: HIRING_STEPS.map((step, i) => ({
      applicationId: app.id, step,
      status: passed.includes(step) ? ('PASSED' as const) : step === failed ? ('FAILED' as const) : ('PENDING' as const),
      completedAt: passed.includes(step) || step === failed ? DateTime.now().minus({ days: 10 - i }).toJSDate() : null,
      notes: step === failed ? 'Identity documents could not be verified.' : null,
    })),
  });
}

async function addGuardian(prisma: Db, familyId: string, g: { email: string; name: string; phone: string; relationship: string }, passwordHash: string, zone: string, primary = false) {
  const user = await prisma.user.create({
    data: {
      email: g.email, passwordHash, name: g.name, phone: g.phone, timeZone: zone, status: 'ACTIVE', emailVerifiedAt: new Date(),
      notificationPreferences: { create: {} }, roles: { create: [{ role: 'GUARDIAN' }] },
    },
  });
  await prisma.familyMember.create({ data: { familyId, userId: user.id, relationship: g.relationship, isPrimary: primary, verifiedAt: new Date() } });
  return user.id;
}

async function createFamily(
  prisma: Db,
  passwordHash: string,
  f: {
    name: string; country: string; currency: string; zone: string; billingName: string;
    guardians: Array<{ email: string; name: string; phone: string; relationship: string }>;
    children: Array<{ name: string; age: number; gender: 'MALE' | 'FEMALE'; language: string; kidsMode?: boolean }>;
  },
) {
  const family = await prisma.family.create({ data: { name: f.name, country: f.country, currency: f.currency as never, timeZone: f.zone, billingName: f.billingName } });
  const guardianIds: string[] = [];
  for (const [i, g] of f.guardians.entries()) guardianIds.push(await addGuardian(prisma, family.id, g, passwordHash, f.zone, i === 0));
  const children: Record<string, string> = {};
  for (const c of f.children) {
    const student = await prisma.student.create({
      data: { familyId: family.id, displayName: c.name, birthYear: DateTime.now().year - c.age, gender: c.gender, language: c.language, timeZone: f.zone, kidsMode: c.kidsMode ?? false },
    });
    children[c.name] = student.id;
    const purposes = c.age < 13 ? (['DATA_COLLECTION', 'CLASS_RECORDING'] as const) : (['DATA_COLLECTION'] as const);
    for (const purpose of purposes) {
      await prisma.consent.create({ data: { familyId: family.id, studentId: student.id, purpose, status: 'GRANTED', method: 'CARD_CHECK', policyVersion: 'v1', grantedByUserId: guardianIds[0] } });
    }
  }
  return { id: family.id, children };
}

/** Weekly occurrences of the slots between two instants, in the family's zone. */
function occurrences(slots: Slot[], zone: string, from: DateTime, to: DateTime): Date[] {
  const out: Date[] = [];
  for (let day = from.setZone(zone).startOf('day'); day <= to; day = day.plus({ days: 1 })) {
    for (const s of slots) if (day.weekday === s.weekday) out.push(zoned(day, zone, s.time));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

async function makeTrial(ctx: Ctx, input: { studentId: string; courseId: string; teacher: { profileId: string; userId: string }; enrolmentId: string; at: Date; completed: boolean }) {
  const { prisma } = ctx;
  const endsAt = new Date(input.at.getTime() + 30 * 60_000);
  const session = await prisma.classSession.create({
    data: { teacherId: input.teacher.profileId, courseId: input.courseId, type: 'TRIAL', startsAt: input.at, endsAt, status: input.completed ? 'COMPLETED' : 'SCHEDULED', startedAt: input.completed ? input.at : null, endedAt: input.completed ? endsAt : null },
  });
  await prisma.classStudent.create({ data: { classId: session.id, studentId: input.studentId, startsAt: input.at, endsAt, enrolmentId: input.enrolmentId } });
  if (input.completed) await participants(ctx, session.id, input.teacher.userId, input.studentId, input.at, 30);
  return session.id;
}

async function participants(ctx: Ctx, classId: string, teacherUserId: string, studentId: string, startsAt: Date, minutes: number) {
  const family = await ctx.prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { family: { select: { members: { where: { isPrimary: true }, select: { userId: true } } } } } });
  const guardian = family.family.members[0]?.userId;
  await ctx.prisma.classParticipant.create({ data: { classId, userId: teacherUserId, role: 'TEACHER', joinedAt: new Date(startsAt.getTime() - 3 * 60_000), leftAt: new Date(startsAt.getTime() + minutes * 60_000), minutesPresent: minutes } });
  if (guardian) {
    await ctx.prisma.classParticipant.create({ data: { classId, userId: guardian, studentId, role: 'STUDENT', joinedAt: new Date(startsAt.getTime() + 60_000), leftAt: new Date(startsAt.getTime() + minutes * 60_000), minutesPresent: minutes - 1 } });
  }
}

async function trialOnly(
  ctx: Ctx,
  input: { familyId: string; studentId: string; course: string; teacher: { profileId: string; userId: string }; at: Date; outcome: 'WON' | null; recommendedPlan?: string },
) {
  const course = ctx.courses.get(input.course)!;
  const done = input.at.getTime() < ctx.now.toMillis();
  const enrolment = await ctx.prisma.enrolment.create({
    data: { studentId: input.studentId, courseId: course.id, teacherId: input.teacher.profileId, status: input.outcome === 'WON' ? 'ACTIVE' : 'TRIAL', currentLevelId: course.levels[0]?.id ?? null, startedAt: input.at },
  });
  const classId = await makeTrial(ctx, { studentId: input.studentId, courseId: course.id, teacher: input.teacher, enrolmentId: enrolment.id, at: input.at, completed: done });
  if (input.outcome === 'WON') {
    await ctx.prisma.trialOutcome.create({
      data: {
        classId, enrolmentId: enrolment.id, placementLevelId: course.levels[0]?.id ?? null, recommendedPlanId: input.recommendedPlan ? ctx.plans.get(input.recommendedPlan)!.id : null,
        notes: 'Knows most single letters; needs work on joined letters. Very bright and attentive.', subscribeToken: randomBytes(24).toString('hex'), completedAt: new Date(input.at.getTime() + 45 * 60_000),
      },
    });
  }
  return { classId, enrolmentId: enrolment.id };
}

/**
 * A child's whole journey: a trial before they started, the subscription and its invoices,
 * the weekly schedule, and every class from the start (capped at eight weeks back) to three
 * weeks ahead — with attendance and lesson cards for the classes that happened.
 */
async function programme(
  ctx: Ctx,
  p: {
    familyId: string; studentId: string; enrolmentId?: string; course: string; teacher: { profileId: string; userId: string };
    zone: string; slots: Slot[]; plan: string; currency: string; startedWeeksAgo: number; level: number; lessonPosition: number;
    trialTime: string; startPage?: number; latestUncarded?: boolean; familyCancelAt?: number; teacherCancelAt?: number;
    usedCredit?: boolean; pastDue?: boolean; endingAtPeriodEnd?: boolean; pausedWeeksAgo?: number; refundTeacherCancel?: boolean;
  },
) {
  const { prisma, now } = ctx;
  const course = ctx.courses.get(p.course)!;
  const plan = ctx.plans.get(p.plan)!;
  const minutes = plan.classMinutes;
  const started = now.minus({ weeks: p.startedWeeksAgo }).startOf('day');
  const amount = await ctx.price(p.plan, p.currency);

  // Subscription: monthly periods anchored on the start date.
  let periodStart = started;
  while (periodStart.plus({ months: 1 }) <= now) periodStart = periodStart.plus({ months: 1 });
  const periodEnd = periodStart.plus({ months: 1 });
  const pausedFrom = p.pausedWeeksAgo ? now.minus({ weeks: p.pausedWeeksAgo }) : null;
  const teacherTier = await prisma.teacherProfile.findUniqueOrThrow({ where: { id: p.teacher.profileId }, select: { tierId: true } });
  const subscription = await prisma.subscription.create({
    data: {
      familyId: p.familyId, planId: plan.id, currency: p.currency as never, tierId: teacherTier.tierId,
      status: p.pastDue ? 'PAST_DUE' : pausedFrom ? 'PAUSED' : 'ACTIVE',
      currentPeriodStart: periodStart.toJSDate(), currentPeriodEnd: periodEnd.toJSDate(), cancelAtPeriodEnd: Boolean(p.endingAtPeriodEnd),
      pausedUntil: pausedFrom ? now.plus({ weeks: 1 }).toJSDate() : null, createdAt: started.toJSDate(),
      setup: { appliedAt: started.toISO(), schedule: { slots: p.slots.map((s) => ({ weekday: ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][s.weekday], localTime: s.time })) } } as never,
    },
  });

  // Enrolment (the trial's enrolment continues as the paid one).
  const levelId = course.levels[Math.min(p.level - 1, course.levels.length - 1)]?.id ?? null;
  const enrolment = p.enrolmentId
    ? await prisma.enrolment.update({ where: { id: p.enrolmentId }, data: { status: pausedFrom ? 'PAUSED' : 'ACTIVE', teacherId: p.teacher.profileId, subscriptionId: subscription.id, currentLevelId: levelId, currentLessonPosition: p.lessonPosition, startedAt: started.toJSDate(), pausedUntil: pausedFrom ? now.plus({ weeks: 1 }).toJSDate() : null } })
    : await prisma.enrolment.create({ data: { studentId: p.studentId, courseId: course.id, teacherId: p.teacher.profileId, subscriptionId: subscription.id, status: pausedFrom ? 'PAUSED' : 'ACTIVE', currentLevelId: levelId, currentLessonPosition: p.lessonPosition, startedAt: started.toJSDate(), pausedUntil: pausedFrom ? now.plus({ weeks: 1 }).toJSDate() : null } });

  // The trial that started it, a few days before the first class, and its saved result.
  const trialAt = zoned(started.minus({ days: 4 }), p.zone, p.trialTime);
  const trialClassId = await makeTrial(ctx, { studentId: p.studentId, courseId: course.id, teacher: p.teacher, enrolmentId: enrolment.id, at: trialAt, completed: true });
  await prisma.trialOutcome.create({
    data: { classId: trialClassId, enrolmentId: enrolment.id, placementLevelId: levelId, recommendedPlanId: plan.id, notes: 'Good foundation; placed at the start of the level.', subscribeToken: randomBytes(24).toString('hex'), completedAt: new Date(trialAt.getTime() + 40 * 60_000) },
  });

  // Weekly schedule.
  const lastDay = p.endingAtPeriodEnd ? DateTime.min(ctx.horizon, periodEnd) : ctx.horizon;
  const schedule = await prisma.recurringSchedule.create({
    data: {
      enrolmentId: enrolment.id, teacherId: p.teacher.profileId,
      rrule: `FREQ=WEEKLY;BYDAY=${p.slots.map((s) => ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][s.weekday]).join(',')}`,
      localStartTime: new Date(`1970-01-01T${p.slots[0].time}:00Z`), familyTimeZone: p.zone, durationMinutes: minutes,
      startsOn: started.toJSDate(), endsOn: p.endingAtPeriodEnd ? periodEnd.toJSDate() : null,
      status: pausedFrom ? 'PAUSED' : 'ACTIVE', materialisedUntil: lastDay.toJSDate(),
    },
  });

  // Classes.
  const from = DateTime.max(started, ctx.historyFrom);
  const all = occurrences(p.slots, p.zone, from, lastDay);
  const past = all.filter((d) => d.getTime() + minutes * 60_000 < now.toMillis());
  const completed: string[] = [];
  let page = p.startPage ?? 0;
  for (const [i, startsAt] of all.entries()) {
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const isPast = endsAt.getTime() < now.toMillis();
    const fromEnd = past.length - i; // 1 = the latest past class
    let status: 'SCHEDULED' | 'COMPLETED' | 'NO_SHOW_STUDENT' | 'CANCELLED_FAMILY' | 'CANCELLED_TEACHER' = isPast ? 'COMPLETED' : 'SCHEDULED';
    if (isPast && p.familyCancelAt === fromEnd) status = 'CANCELLED_FAMILY';
    if (isPast && p.teacherCancelAt === fromEnd) status = 'CANCELLED_TEACHER';
    if (isPast && fromEnd === 6 && !p.familyCancelAt) status = 'NO_SHOW_STUDENT';
    if (pausedFrom && startsAt.getTime() >= pausedFrom.toMillis()) {
      if (!isPast) continue; // nothing booked while paused
      status = 'CANCELLED_FAMILY';
    }
    const cancelled = status === 'CANCELLED_FAMILY' || status === 'CANCELLED_TEACHER';
    const session = await prisma.classSession.create({
      data: {
        scheduleId: schedule.id, teacherId: p.teacher.profileId, courseId: course.id, type: 'REGULAR', startsAt, endsAt, status,
        charged: !cancelled, startedAt: status === 'COMPLETED' ? startsAt : null, endedAt: status === 'COMPLETED' ? endsAt : null,
        cancelledAt: cancelled ? new Date(startsAt.getTime() - 26 * 3_600_000) : null,
        cancelReason: status === 'CANCELLED_FAMILY' ? (pausedFrom ? 'Family travelling — plan paused' : 'Family event; cancelled the day before') : status === 'CANCELLED_TEACHER' ? 'Teacher unwell' : null,
      },
    });
    await prisma.classStudent.create({ data: { classId: session.id, studentId: p.studentId, startsAt, endsAt, enrolmentId: enrolment.id, active: !cancelled } });

    if (status === 'CANCELLED_FAMILY' && !pausedFrom) {
      await prisma.makeupCredit.create({ data: { familyId: p.familyId, studentId: p.studentId, sourceClassId: session.id, status: 'AVAILABLE', expiresAt: new Date(startsAt.getTime() + 60 * DAY) } });
    }
    if (status === 'CANCELLED_TEACHER' && p.usedCredit) {
      // The family booked the make-up for next Saturday morning.
      const makeupAt = zoned(now.plus({ days: ((6 - now.weekday + 7) % 7) || 7 }), p.zone, '10:00');
      const makeup = await prisma.classSession.create({ data: { teacherId: p.teacher.profileId, courseId: course.id, type: 'MAKEUP', startsAt: makeupAt, endsAt: new Date(makeupAt.getTime() + minutes * 60_000), status: 'SCHEDULED' } });
      await prisma.classStudent.create({ data: { classId: makeup.id, studentId: p.studentId, startsAt: makeupAt, endsAt: new Date(makeupAt.getTime() + minutes * 60_000), enrolmentId: enrolment.id } });
      await prisma.makeupCredit.create({ data: { familyId: p.familyId, studentId: p.studentId, sourceClassId: session.id, status: 'USED', usedClassId: makeup.id, expiresAt: new Date(startsAt.getTime() + 60 * DAY) } });
    }
    if (status === 'NO_SHOW_STUDENT') {
      await prisma.classParticipant.create({ data: { classId: session.id, userId: p.teacher.userId, role: 'TEACHER', joinedAt: new Date(startsAt.getTime() - 2 * 60_000), leftAt: endsAt, minutesPresent: minutes } });
    }
    if (status !== 'COMPLETED') continue;

    await participants(ctx, session.id, p.teacher.userId, p.studentId, startsAt, minutes);
    completed.push(session.id);
    if (p.latestUncarded && fromEnd === 1) continue; // the teacher has not written this one yet

    // Lesson card: shared 20 minutes after class; the latest one only sent for review.
    const submittedAt = new Date(endsAt.getTime() + 10 * 60_000);
    const shared = fromEnd > 1;
    const grade = pick(['EXCELLENT', 'GOOD', 'GOOD', 'EXCELLENT', 'NEEDS_WORK']) as 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK';
    const portions = portionsFor(p.course, page, grade);
    if (p.course === 'HIFZ') page = Math.min(604, page + 1);
    const card = await prisma.lessonCard.create({
      data: {
        classId: session.id, teacherId: p.teacher.userId, studentId: p.studentId,
        homework: pick(HOMEWORK[p.course] ?? HOMEWORK.NAZRA), parentNote: pick(PARENT_NOTES), submittedAt,
        sharedAt: shared ? new Date(endsAt.getTime() + 20 * 60_000) : null,
        lockedAt: now.toMillis() - submittedAt.getTime() > 2 * DAY ? new Date(submittedAt.getTime() + 2 * DAY) : null,
        portions: { create: portions.map((x, position) => ({ ...x, position })) },
      },
    });
    if (grade === 'NEEDS_WORK' || rand() < 0.3) {
      const n = grade === 'NEEDS_WORK' ? 3 : 1;
      const surah = portions[0]?.fromSurah ?? 78;
      for (let k = 0; k < n; k += 1) {
        await prisma.mistake.create({
          data: { studentId: p.studentId, lessonCardId: card.id, classId: session.id, surah, ayah: (portions[0]?.fromAyah ?? 1) + k, wordIndex: 1 + k * 2, type: pick([...MISTAKE_TYPES]), source: 'CLASS', confirmed: true, occurredAt: new Date(startsAt.getTime() + (10 + k * 5) * 60_000) },
        });
      }
    }
    if (p.course === 'HIFZ') ctx.cardsForHifz.push(card.id);
  }

  // Invoices: one per month since the start; the current one unpaid when the family is past due.
  let invStart = started;
  while (invStart <= now) {
    const isCurrent = invStart.plus({ months: 1 }) > now;
    const unpaid = isCurrent && p.pastDue;
    ctx.invoiceNo.n += 1;
    const number = `INV-${invStart.toFormat('yyyy')}-${String(ctx.invoiceNo.n).padStart(4, '0')}`;
    const invoice = await prisma.invoice.create({
      data: {
        familyId: p.familyId, subscriptionId: subscription.id, number, currency: p.currency as never, subtotalMinor: amount, totalMinor: amount,
        status: unpaid ? 'OPEN' : 'PAID', dueAt: invStart.plus({ days: 7 }).toJSDate(), paidAt: unpaid ? null : invStart.plus({ days: 1 }).toJSDate(), createdAt: invStart.toJSDate(),
      },
    });
    if (!unpaid) {
      const payment = await prisma.payment.create({
        data: { invoiceId: invoice.id, provider: 'OTHER', providerPaymentId: `bank-${number}`, method: 'MANUAL', amountMinor: amount, currency: p.currency as never, status: 'SUCCEEDED', createdAt: invStart.plus({ days: 1 }).toJSDate() },
      });
      if (p.refundTeacherCancel && isCurrent) {
        // The teacher-cancelled class this month was refunded rather than made up.
        await prisma.refund.create({ data: { paymentId: payment.id, amountMinor: Math.round(amount / 8), reason: 'Class cancelled by the teacher (unwell); refunded instead of a make-up at the family’s request.', issuedById: ctx.admin } });
      }
    }
    invStart = invStart.plus({ months: 1 });
  }

  return { enrolmentId: enrolment.id, subscriptionId: subscription.id, trialClassId, completed };
}

type Portion = { kind: 'SABAQ' | 'SABQI' | 'MANZIL' | 'OTHER'; fromSurah?: number; fromAyah?: number; toSurah?: number; toAyah?: number; grade?: 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK'; fromPage?: number; toPage?: number };

function portionsFor(course: string, page: number, grade: 'EXCELLENT' | 'GOOD' | 'NEEDS_WORK'): Portion[] {
  if (course === 'HIFZ') {
    // Juz Tabarak / Amma pages; the new page, the last few, and older revision.
    return [
      { kind: 'SABAQ', fromPage: page, toPage: page, grade },
      { kind: 'SABQI', fromPage: Math.max(1, page - 3), toPage: Math.max(1, page - 1), grade: grade === 'NEEDS_WORK' ? 'GOOD' : 'EXCELLENT' },
      { kind: 'MANZIL', fromPage: Math.max(1, page - 12), toPage: Math.max(1, page - 8), grade: 'GOOD' },
    ];
  }
  if (course === 'TAJWEED') {
    const start = 1 + Math.floor(rand() * 20);
    return [{ kind: 'SABAQ', fromSurah: 67, fromAyah: start, toSurah: 67, toAyah: start + 5, grade }];
  }
  if (course === 'NAZRA') {
    const surah = pick([78, 79, 80, 81, 82, 83]);
    return [
      { kind: 'SABAQ', fromSurah: surah, fromAyah: 1, toSurah: surah, toAyah: 10 + Math.floor(rand() * 10), grade },
      { kind: 'SABQI', fromSurah: surah - 1, fromAyah: 1, toSurah: surah - 1, toAyah: 15, grade: 'GOOD' },
    ];
  }
  // Qaida: no surah ranges, the lesson itself is the portion.
  return [{ kind: 'OTHER', grade }];
}

async function rate(prisma: Db, classIds: string[], familyId: string, studentId: string, stars: number[], comments: string[] = []) {
  const guardian = await prisma.familyMember.findFirstOrThrow({ where: { familyId, isPrimary: true }, select: { userId: true } });
  for (const [i, classId] of classIds.entries()) {
    await prisma.classReview.create({ data: { classId, familyUserId: guardian.userId, studentId, stars: stars[i] ?? 5, comment: comments[i] ?? null } });
  }
  // Same rule as RatingsService: the profile's rating comes from real reviews only.
  const teacherId = (await prisma.classSession.findFirstOrThrow({ where: { id: classIds[0] }, select: { teacherId: true } })).teacherId;
  const agg = await prisma.classReview.aggregate({ where: { class: { teacherId } }, _avg: { stars: true }, _count: { _all: true } });
  const avg = agg._avg.stars === null ? 0 : Math.round(agg._avg.stars * 100) / 100;
  await prisma.teacherProfile.update({ where: { id: teacherId }, data: { ratingAvg: avg, ratingCount: agg._count._all, publicRatingAvg: avg } });
}

async function thread(prisma: Db, familyId: string, teacher: { profileId: string }, studentId: string, enrolmentId: string, messages: Array<[string, string, number]>) {
  const t = await prisma.messageThread.create({ data: { familyId, teacherId: teacher.profileId, studentId, enrolmentId } });
  for (const [email, body, daysAgo] of messages) {
    const sender = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    const at = DateTime.now().minus({ days: daysAgo, minutes: Math.floor(rand() * 300) }).toJSDate();
    await prisma.message.create({ data: { threadId: t.id, senderId: sender.id, body, createdAt: at, readAt: daysAgo > 1 ? at : null } });
  }
}

/** Last month's payroll, calculated from the classes actually taught and paid by bank transfer. */
async function payroll(prisma: Db, now: DateTime, adminId: string) {
  const start = now.minus({ months: 1 }).startOf('month');
  const end = start.endOf('month');
  const rates = new Map((await prisma.payRate.findMany({ where: { active: true }, select: { classType: true, ratePerClassMinor: true } })).map((r) => [r.classType ?? 'REGULAR', r.ratePerClassMinor]));
  const period = await prisma.payrollPeriod.create({ data: { startsOn: start.toJSDate(), endsOn: end.startOf('day').toJSDate(), status: 'PAID' } });
  const classes = await prisma.classSession.findMany({
    where: { status: 'COMPLETED', startsAt: { gte: start.toJSDate(), lte: end.toJSDate() } },
    select: { id: true, type: true, teacherId: true, course: { select: { name: true } } },
  });
  const byTeacher = new Map<string, typeof classes>();
  for (const c of classes) byTeacher.set(c.teacherId, [...(byTeacher.get(c.teacherId) ?? []), c]);
  let n = 0;
  for (const [teacherId, list] of byTeacher) {
    n += 1;
    const lines = list.map((c) => ({ classId: c.id, teacherId, kind: 'CLASS' as const, amountMinor: rates.get(c.type === 'TRIAL' ? 'TRIAL' : 'REGULAR') ?? 1200, note: `${c.type === 'TRIAL' ? 'Trial' : 'Regular'} class · ${c.course.name}` }));
    const gross = lines.reduce((s, l) => s + l.amountMinor, 0);
    const bonus = list.length >= 12 ? 1500 : 0;
    const entry = await prisma.payrollEntry.create({
      data: { periodId: period.id, teacherId, grossMinor: gross, deductionsMinor: 0, bonusesMinor: bonus, netMinor: gross + bonus, status: 'PAID', paidAt: end.plus({ days: 3 }).toJSDate(), payoutReference: `BACS-${start.toFormat('yyyyMM')}-${String(n).padStart(2, '0')}` },
    });
    await prisma.payrollLine.createMany({ data: [...lines, ...(bonus ? [{ teacherId, kind: 'BONUS' as const, amountMinor: bonus, note: 'Full attendance bonus (12+ classes)', classId: null }] : [])].map((l) => ({ ...l, entryId: entry.id })) });
  }
  void adminId;
}
