import { PrismaClient } from '@prisma/client';
import {
  BillingPeriod,
  ConsentMethod,
  ConsentPurpose,
  ConsentStatus,
  CourseType,
  Currency,
  Gender,
  Role,
  UserStatus,
} from '@hifzoon/shared';
import * as argon2 from 'argon2';

/**
 * Development and test seed (ERD section 6).
 *
 * Deliberately idempotent so it can be re-run against a live database without
 * wiping anything. Passwords come from SEED_PASSWORD when set, otherwise a known
 * development value — never a production credential.
 */

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';

async function main(): Promise<void> {
  console.log('Seeding Hifzoon…');

  await seedRoles();
  // Catalogue and pricing must exist before users, because the demo family is
  // enrolled against real courses and levels.
  await seedCourses();
  await seedPlans();
  await seedHifzRules();
  await seedPayRates();
  await seedFaq();
  await seedQaRubrics();
  await seedAppSettings();
  await seedCmsContent();
  await seedUsers();

  console.log('Seed complete.');
  console.log(`Development password for every seeded account: ${PASSWORD}`);
}

async function seedRoles(): Promise<void> {
  const permissions: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    ADMIN: [
      'students.*',
      'families.*',
      'teachers.*',
      'classes.*',
      'billing.*',
      'crm.*',
      'settings.*',
    ],
    SUPERVISOR: ['classes.read', 'quality.*', 'lesson-cards.edit-locked', 'messages.read'],
    SAFEGUARDING_LEAD: ['cases.*', 'safeguarding.*'],
    TEACHER: ['classes.own', 'lesson-cards.own', 'students.own', 'messages.own', 'earnings.own'],
    EXAMINER: ['assessments.own'],
    GUARDIAN: ['family.own', 'students.own', 'consent.own', 'billing.own', 'messages.own'],
    STUDENT: ['self.*'],
    CHILD_STUDENT: ['self.kids'],
  };

  for (const [role, perms] of Object.entries(permissions)) {
    for (const permission of perms) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role: role as Role, permission } },
        update: {},
        create: { role: role as Role, permission },
      });
    }
  }
  console.log(`  roles: ${Object.keys(permissions).length}`);
}

async function seedUsers(): Promise<void> {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

const staff: Array<{ email: string; name: string; role: Role; extraRoles?: Role[] }> = [
    { email: 'superadmin@hifzoon.test', name: 'Super Admin', role: Role.SUPER_ADMIN },
    { email: 'admin@hifzoon.test', name: 'Academy Admin', role: Role.ADMIN },
    { email: 'supervisor@hifzoon.test', name: 'Quality Supervisor', role: Role.SUPERVISOR },
    { email: 'safeguarding@hifzoon.test', name: 'Safeguarding Lead', role: Role.SAFEGUARDING_LEAD },
    { email: 'examiner@hifzoon.test', name: 'External Examiner', role: Role.EXAMINER },
    // Q10 — one account holding two roles, so the multi-role path (FR-AUTH-02) can be
    // exercised by a developer at all. Single-role fixtures cannot show it: a role guard
    // either passes for one role or the other, never for both.
    {
      email: 'supervisor.teacher@hifzoon.test',
      name: 'Supervisor who teaches',
      role: Role.SUPERVISOR,
      extraRoles: [Role.TEACHER],
    },
  ];

  for (const person of staff) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { passwordHash },
      create: {
        email: person.email,
        passwordHash,
        name: person.name,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        notificationPreferences: { create: {} },
      },
    });
    for (const role of [person.role, ...(person.extraRoles ?? [])]) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        update: {},
        create: { userId: user.id, role },
      });
    }
  }

  // Two teachers: one fully cleared (matchable, FR-TCH-02) and one mid-pipeline.
  const cleared = await ensureTeacher({
    email: 'teacher@hifzoon.test',
    name: 'Ustadh Bilal Rahman',
    passwordHash,
// Q24 — every seeded course code. Booking now rejects a teacher who does not teach
    // the course (B26), so a teacher listed for HIFZ only could not be booked for QAIDA at
    // all, and the demo data exercised a refusal rather than a booking.
    subjects: ['HIFZ', 'TAJWEED', 'QAIDA', 'NAZRA', 'MURAJAAH'],
    languages: ['en', 'ur'],
    readyToMatch: true,
    timeZone: 'Europe/London',
  });
  const inTraining = await ensureTeacher({
    email: 'teacher.trainee@hifzoon.test',
    name: 'Ustadh Sana Iqbal',
    passwordHash,
    subjects: ['QAIDA', 'NAZRA'],
    languages: ['en'],
    readyToMatch: false,
    timeZone: 'Europe/London',
  });

  const guardianEmail = 'parent@hifzoon.test';
  const guardian = await prisma.user.upsert({
    where: { email: guardianEmail },
    update: { passwordHash },
    create: {
      email: guardianEmail,
      passwordHash,
      name: 'Ayesha Khan',
      phone: '+447700900123',
      timeZone: 'Europe/London',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      notificationPreferences: { create: {} },
      roles: { create: [{ role: Role.GUARDIAN }] },
    },
  });

  const family = await prisma.family.upsert({
    where: { id: '00000000-0000-7000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000001',
      name: 'Khan Family',
      country: 'GB',
      currency: Currency.GBP,
      billingName: 'Ayesha Khan',
      timeZone: 'Europe/London',
      members: {
        create: [
          { userId: guardian.id, relationship: 'PARENT', isPrimary: true, verifiedAt: new Date() },
        ],
      },
    },
  });

  // Two children: one under 13 with full consents, one older without — so the
  // consent gate has something to act on in development.
  const younger = await prisma.student.upsert({
    where: { id: '00000000-0000-7000-8000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000011',
      familyId: family.id,
      displayName: 'Maryam',
      birthYear: new Date().getUTCFullYear() - 9,
      gender: Gender.FEMALE,
      timeZone: 'Europe/London',
      kidsMode: true,
    },
  });

  const older = await prisma.student.upsert({
    where: { id: '00000000-0000-7000-8000-000000000012' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000012',
      familyId: family.id,
      displayName: 'Yusuf',
      birthYear: new Date().getUTCFullYear() - 15,
      gender: Gender.MALE,
      timeZone: 'Europe/London',
    },
  });

  // CR-01: the under-13 child has every non-training purpose granted, and
  // AI_TRAINING deliberately withheld so the gate is visible in dev.
  const granted: ConsentPurpose[] = [
    ConsentPurpose.DATA_COLLECTION,
    ConsentPurpose.CLASS_RECORDING,
    ConsentPurpose.AI_VOICE,
  ];
  for (const purpose of granted) {
    await prisma.consent.upsert({
      where: {
        studentId_purpose_policyVersion: {
          studentId: younger.id,
          purpose,
          policyVersion: 'v1',
        },
      },
      update: {},
      create: {
        familyId: family.id,
        studentId: younger.id,
        purpose,
        status: ConsentStatus.GRANTED,
        method: ConsentMethod.CARD_CHECK,
        policyVersion: 'v1',
        grantedByUserId: guardian.id,
      },
    });
  }
  await prisma.consent.upsert({
    where: {
      studentId_purpose_policyVersion: {
        studentId: older.id,
        purpose: ConsentPurpose.DATA_COLLECTION,
        policyVersion: 'v1',
      },
    },
    update: {},
    create: {
      familyId: family.id,
      studentId: older.id,
      purpose: ConsentPurpose.DATA_COLLECTION,
      status: ConsentStatus.GRANTED,
      method: ConsentMethod.CARD_CHECK,
      policyVersion: 'v1',
      grantedByUserId: guardian.id,
    },
  });

  // Enrolments so the scheduling and classroom modules have something to read.
  const qaida = await prisma.course.findUnique({ where: { code: 'QAIDA' } });
  const hifz = await prisma.course.findUnique({ where: { code: 'HIFZ' } });
  const qaidaLevel = await prisma.courseLevel.findFirst({ where: { courseId: qaida?.id } });
  const hifzLevel = await prisma.courseLevel.findFirst({ where: { courseId: hifz?.id } });

  await prisma.enrolment.upsert({
    where: { id: '00000000-0000-7000-8000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000101',
      studentId: younger.id,
      courseId: qaida!.id,
      currentLevelId: qaidaLevel?.id ?? null,
      teacherId: cleared.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });
  await prisma.enrolment.upsert({
    where: { id: '00000000-0000-7000-8000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000102',
      studentId: older.id,
      courseId: hifz!.id,
      currentLevelId: hifzLevel?.id ?? null,
      teacherId: cleared.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });

  // Weekly availability for the cleared teacher, Europe/London local time.
  await prisma.availabilitySlot.deleteMany({ where: { teacherId: cleared.id } });
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      teacherId: cleared.id,
      weekday,
      startTime: new Date(`1970-01-01T16:00:00Z`),
      endTime: new Date(`1970-01-01T20:00:00Z`),
      timeZone: 'Europe/London',
      effectiveFrom: new Date(),
    })),
  });

  await prisma.availabilitySlot.deleteMany({ where: { teacherId: inTraining.id } });

  console.log(`  users: ${staff.length + 3} (guardian: ${guardian.email})`);
  console.log(`  teachers: cleared=${cleared.id} training=${inTraining.id}`);
  console.log(`  family: ${family.id}, students: ${younger.id}, ${older.id}`);
}

async function ensureTeacher(input: {
  email: string;
  name: string;
  passwordHash: string;
  subjects: string[];
  languages: string[];
  readyToMatch: boolean;
  /** Q11 — the account zone has to match the zone the availability is written in. */
  timeZone?: string;
}) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: { passwordHash: input.passwordHash, timeZone: input.timeZone ?? 'Europe/London' },
    create: {
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      // Q11 — availability below is Europe/London local time. An account in UTC showed a
      // timetable shifted by an hour for half the year, and saving availability "fixed" it
      // by moving the windows instead.
      timeZone: input.timeZone ?? 'Europe/London',
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      notificationPreferences: { create: {} },
      roles: { create: [{ role: Role.TEACHER }] },
    },
  });

  // The hiring pipeline must exist *before* the profile can claim readyToMatch:
  // the FR-TCH-02 trigger rejects a profile whose hiring steps are not all passed.
  let applicationId: string | undefined;
  if (input.readyToMatch) {
    const application = await prisma.teacherApplication.upsert({
      where: { id: '00000000-0000-7000-8000-000000000201' },
      update: { userId: user.id, status: 'APPROVED' },
      create: {
        id: '00000000-0000-7000-8000-000000000201',
        applicantName: input.name,
        email: input.email,
        status: 'APPROVED',
        userId: user.id,
      },
    });
    applicationId = application.id;

    await prisma.hiringStep.deleteMany({ where: { applicationId: application.id } });
    await prisma.hiringStep.createMany({
      data: [
        'SUBMITTED',
        'RECITATION_REVIEW',
        'DEMO_CLASS',
        'ID_CHECK',
        'REFERENCE_CHECK',
        'TRAINING',
        'APPROVED',
      ].map((step) => ({
        applicationId: application.id,
        step: step as never,
        status: 'PASSED' as const,
        completedAt: new Date(),
      })),
    });
  }

  const profile = await prisma.teacherProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      bio: `${input.name} teaches ${input.subjects.join(', ')}.`,
      gender: Gender.MALE,
      languages: input.languages,
      subjects: input.subjects,
      ageGroups: ['6-9', '10-13'],
      hiringStatus: input.readyToMatch ? 'APPROVED' : 'TRAINING',
      readyToMatch: input.readyToMatch,
      // The DB trigger (FR-TCH-02) refuses readyToMatch=true without this stamp, so
      // the seed only sets it together with the safeguarding completion date.
      safeguardingTrainingCompletedAt: input.readyToMatch ? new Date() : null,
      ratingAvg: input.readyToMatch ? 4.8 : 0,
      ratingCount: input.readyToMatch ? 12 : 0,
      publicRatingAvg: input.readyToMatch ? 4.8 : null,
    },
  });

  void applicationId;
  return profile;
}

async function seedCourses(): Promise<void> {
  const catalogue: Array<{
    code: string;
    name: string;
    type: CourseType;
    description: string;
    levels: string[];
  }> = [
    {
      code: 'QAIDA',
      name: 'Noorani Qaida',
      type: CourseType.QAIDA,
      description: 'Arabic letters, harakat and basic Quranic reading from the Noorani Qaida.',
      levels: ['Beginner', 'Letter forms', 'Word reading', 'Short surahs'],
    },
    {
      code: 'NAZRA',
      name: 'Nazra / Reading',
      type: CourseType.NAZRA,
      description: 'Fluency in reading the Quran from the mushaf with correct Tajweed.',
      levels: ['Partial surahs', 'Short surahs', 'Juz Amma', 'Full mushaf'],
    },
    {
      code: 'TAJWEED',
      name: 'Tajweed',
      type: CourseType.TAJWEED,
      description: 'Rules of recitation with practical correction.',
      levels: ['Introduction', 'Meem Sakinah', 'Qalqalah', 'Advanced rules'],
    },
    {
      code: 'HIFZ',
      name: 'Hifz',
      type: CourseType.HIFZ,
      description: 'Memorisation with spaced revision and a tracked daily plan.',
      levels: ['Sabaq start', 'Building momentum', 'Revision mastery'],
    },
    {
      code: 'MURAJAAH',
      name: "Muraja'ah only",
      type: CourseType.MURAJAAH,
      description: 'Revision-only plan for students who have already memorised.',
      levels: ['Light revision', 'Structured revision'],
    },
    {
      code: 'IJAZAH',
      name: 'Ijazah',
      type: CourseType.IJAZAH,
      description: 'Full recitation with sanad and certification.',
      levels: ['Preparation', 'Recitation', 'Ijazah hearing'],
    },
    {
      code: 'ARABIC',
      name: 'Arabic language',
      type: CourseType.ARABIC,
      description: 'Classical Arabic grammar and comprehension for Quranic study.',
      levels: ['Nahw basics', 'Sarf basics', 'Reading comprehension'],
    },
    {
      code: 'ISLAMIC_STUDIES',
      name: 'Islamic Studies',
      type: CourseType.ISLAMIC_STUDIES,
      description: 'Aqeedah, fiqh and seerah for young learners.',
      levels: ['Aqeedah', 'Fiqh of worship', 'Seerah'],
    },
    {
      code: 'NEW_MUSLIM',
      name: 'New Muslim',
      type: CourseType.NEW_MUSLIM,
      description: 'Foundations of Islam for recent converts, paced gently.',
      levels: ['Belief', 'Practice', 'Reading'],
    },
    {
      code: 'INTENSIVE',
      name: 'Intensive programme',
      type: CourseType.INTENSIVE,
      description: 'Accelerated progress with daily classes and tight feedback.',
      levels: ['Intensive foundation', 'Intensive consolidation'],
    },
  ];

  for (const course of catalogue) {
    const record = await prisma.course.upsert({
      where: { code: course.code },
      update: { name: course.name, description: course.description, type: course.type },
      create: {
        code: course.code,
        name: course.name,
        type: course.type,
        description: course.description,
        active: true,
      },
    });

    for (const [index, levelName] of course.levels.entries()) {
      const level = await prisma.courseLevel.upsert({
        where: { courseId_position: { courseId: record.id, position: index + 1 } },
        update: { name: levelName },
        create: {
          courseId: record.id,
          name: levelName,
          position: index + 1,
          passMark: 70,
          rubric: { recitation: 40, tajweed: 30, fluency: 30 },
        },
      });

      const lessonCount = course.code === 'QAIDA' || course.code === 'HIFZ' ? 4 : 2;
      for (let lesson = 1; lesson <= lessonCount; lesson += 1) {
        await prisma.lessonTemplate.upsert({
          where: { levelId_position: { levelId: level.id, position: lesson } },
          update: {},
          create: {
            levelId: level.id,
            position: lesson,
            title: `${levelName} — lesson ${lesson}`,
            objectives: [`Cover lesson ${lesson} of ${levelName}`, 'Recite with correct Tajweed'],
            materials: { workbook: 'Noorani Qaida page 1' },
          },
        });
      }
    }
  }

  console.log(`  courses: ${catalogue.length}`);
}

async function seedPlans(): Promise<void> {
  // Placeholder prices until the product decision on pricing lands (TRD section 21
  // question 4). Amounts are in minor units.
  const plans: Array<{
    code: string;
    name: string;
    classesPerWeek: number;
    classMinutes: number;
    period: BillingPeriod;
    prices: Record<Currency, number>;
  }> = [
    {
      code: 'ONE_TO_ONE_1X',
      name: 'One-to-one, 1 class/week',
      classesPerWeek: 1,
      classMinutes: 30,
      period: BillingPeriod.MONTHLY,
          // Q9 - PKR was 13500 minor units (Rs 135) against USD 4900 ($49). The two are not
      // the same order of magnitude, and the wrong one is what a family in Pakistan is
      // quoted. Every currency stays in integer minor units; the other figures are the
      // academy's own price list and are left as they are.
      prices: { USD: 4900, GBP: 3900, CAD: 6500, AUD: 7400, AED: 18000, PKR: 1900000 },
    },
    {
      code: 'ONE_TO_ONE_2X',
      name: 'One-to-one, 2 classes/week',
      classesPerWeek: 2,
      classMinutes: 30,
      period: BillingPeriod.MONTHLY,
      prices: { USD: 8900, GBP: 7100, CAD: 11800, AUD: 13400, AED: 32700, PKR: 24500 },
    },
    {
      code: 'CIRCLE_3X',
      name: 'Circle, 3 classes/week',
      classesPerWeek: 3,
      classMinutes: 45,
      period: BillingPeriod.MONTHLY,
      prices: { USD: 6900, GBP: 5500, CAD: 9100, AUD: 10400, AED: 25300, PKR: 19000 },
    },
  ];

  for (const plan of plans) {
    const record = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: {
        code: plan.code,
        name: plan.name,
        classesPerWeek: plan.classesPerWeek,
        classMinutes: plan.classMinutes,
        roomType: plan.code.startsWith('CIRCLE') ? 'CIRCLE' : 'ONE_TO_ONE',
        billingPeriod: plan.period,
        active: true,
      },
    });

    for (const [currency, amountMinor] of Object.entries(plan.prices)) {
      await prisma.planPrice.upsert({
        where: { planId_currency: { planId: record.id, currency: currency as Currency } },
        update: { amountMinor },
        create: { planId: record.id, currency: currency as Currency, amountMinor },
      });
    }
  }

  await prisma.discountRule.upsert({
    where: { id: '00000000-0000-7000-8000-000000000301' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000301',
      type: 'SIBLING',
      name: 'Sibling discount',
      config: { percentOffSecondChild: 20 },
      active: true,
    },
  });
  await prisma.discountRule.upsert({
    where: { id: '00000000-0000-7000-8000-000000000302' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000302',
      type: 'PREPAID',
      name: 'Prepaid 6 months',
      config: { months: 6, percentOff: 10 },
      active: true,
    },
  });

  console.log(`  plans: ${plans.length}`);
}

async function seedHifzRules(): Promise<void> {
  // FR-HFZ-02 — thresholds the academic head can change without a deploy.
  await prisma.hifzRuleConfig.upsert({
    where: { version: 'v1' },
    update: {},
    create: {
      version: 'v1',
      rules: {
        gradeToState: {
          EXCELLENT: 'SOLID',
          GOOD: 'IN_PROGRESS',
          NEEDS_WORK: 'FRAGILE',
          REPEAT: 'FRAGILE',
        },
        recentMistakeWindowDays: 30,
        fragileThreshold: { mistakes: 1, gradeIn: ['NEEDS_WORK', 'REPEAT'] },
        solidThreshold: { consecutiveExcellent: 3, mistakes: 0 },
        intervalsDays: { SOLID: [1, 3, 7, 14, 30, 60], FRAGILE: [1, 2] },
        manzilDropWeeksForAlert: 2,
        behindGoalDaysForAlert: 7,
      },
    },
  });

  console.log('  hifz rule config: v1');
}

async function seedPayRates(): Promise<void> {
  await prisma.payRate.upsert({
    where: { id: '00000000-0000-7000-8000-000000000401' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000401',
      name: 'Standard one-to-one rate',
      currency: Currency.GBP,
      ratePerClassMinor: 1200,
      classType: 'REGULAR',
      effectiveFrom: new Date(),
    },
  });
  await prisma.payRate.upsert({
    where: { id: '00000000-0000-7000-8000-000000000402' },
    update: {},
    create: {
      id: '00000000-0000-7000-8000-000000000402',
      name: 'Trial rate',
      currency: Currency.GBP,
      ratePerClassMinor: 800,
      classType: 'TRIAL',
      effectiveFrom: new Date(),
    },
  });
  console.log('  pay rates: 2');
}

async function seedFaq(): Promise<void> {
  const faqs = [
    {
      question: 'How long until my child is memorising?',
      answer:
        'It depends on age, consistency and level. After the first few lessons the teacher sets a realistic sabaq target and a daily revision plan, and you will see progress on the family dashboard every week.',
    },
    {
      question: 'Do I need a credit card for the trial?',
      answer:
        'No. The trial lesson is free and needs no payment details. You only add a payment method when you decide to subscribe.',
    },
    {
      question: 'Can I request a female teacher?',
      answer:
        'Yes. Circles are women-only by default, and one-to-one lessons can be requested with a female teacher subject to availability.',
    },
    {
      question: 'Can classes be recorded?',
      answer:
        'Recording only happens with verifiable parental consent for your child, and recordings are deleted automatically after 90 days.',
    },
    {
      question: 'What timezone are the times shown in?',
      answer:
        'Every time is shown in your own timezone, adjusted for daylight saving. The teacher sees the same class in their own local time.',
    },
  ];

  for (const [index, faq] of faqs.entries()) {
    const existing = await prisma.faqItem.findFirst({
      where: { question: faq.question, locale: 'en' },
    });
    if (!existing) {
      await prisma.faqItem.create({
        data: {
          locale: 'en',
          question: faq.question,
          answer: faq.answer,
          approved: true,
          sort: index,
        },
      });
    }
  }
  console.log(`  faq items: ${faqs.length}`);
}

/**
 * QA rubrics (FR-QA-03, QA-FE-01).
 *
 * Seeded rather than created on first use: a supervisor opening the quality screen and
 * finding it empty reads as "QA is not being done", which is the opposite of the intent.
 * Weights sum to 10 so an average across criteria maps cleanly onto a percentage.
 */
async function seedQaRubrics(): Promise<void> {
  const rubrics = [
    {
      name: 'Standard lesson rubric',
      criteria: {
        items: [
          { key: 'opening', label: "Opened with du'a and a check-in on the student", weight: 1 },
          { key: 'portion', label: 'Taught the assigned portion from the plan', weight: 3 },
          {
            key: 'tajweed',
            label: 'Corrected Tajweed rules in context, not in the abstract',
            weight: 2,
          },
          { key: 'pacing', label: 'Kept pace appropriate to this student', weight: 2 },
          { key: 'closing', label: 'Closed with homework and a clear next portion', weight: 2 },
        ],
      },
    },
    {
      name: 'Circle (group) rubric',
      criteria: {
        items: [
          { key: 'opening', label: 'Opened on time with the whole circle', weight: 1 },
          {
            key: 'engagement',
            label: 'Kept every student engaged, not just the confident ones',
            weight: 3,
          },
          { key: 'turn_taking', label: 'Managed recitation turns fairly', weight: 2 },
          {
            key: 'correction',
            label: 'Corrected individually without embarrassing a student',
            weight: 2,
          },
          { key: 'closing', label: 'Closed with a summary each student can repeat', weight: 2 },
        ],
      },
    },
    {
      name: 'Safeguarding-observed lesson',
      criteria: {
        items: [
          {
            key: 'boundary',
            label: 'Maintained appropriate physical and verbal boundaries',
            weight: 4,
          },
          { key: 'one_to_one', label: 'Kept the child in view or sightline throughout', weight: 3 },
          { key: 'language', label: 'Used language a child would report accurately', weight: 2 },
          { key: 'record', label: 'Recorded attendance and any concern promptly', weight: 1 },
        ],
      },
    },
  ];

  for (const rubric of rubrics) {
    const existing = await prisma.qaRubric.findFirst({ where: { name: rubric.name } });
    if (!existing) {
      await prisma.qaRubric.create({ data: rubric });
    }
  }
  console.log(`  qa rubrics: ${rubrics.length}`);
}

/**
 * Platform settings (FR-OPS-05).
 *
 * These mirror the defaults in `SettingsService`, written explicitly so the admin
 * settings screen shows a populated page rather than a blank one, and so an operator can
 * see every tunable in one place.
 */
async function seedAppSettings(): Promise<void> {
  const settings: Record<string, string | number | boolean> = {
    'platform.branding.name': 'Hifzoon',
    'platform.branding.tagline': 'Live one-to-one Hifz classes with qualified teachers',
    'platform.registration.open': true,
    'platform.trial.enabled': true,
    'trial.default_duration_minutes': 30,
    'trial.cancellation_notice_hours': 4,
    'trial.no_show_followup_hours': 24,
    'lessons.card_lock_hours': 48,
    'lessons.share_sla_minutes': 15,
    'lessons.recording_requires_consent': true,
    'scheduling.materialise_days': 60,
    'scheduling.substitute_notice_hours': 12,
    'scheduling.cancellation_notice_hours': 4,
    'scheduling.max_session_gap_minutes': 20,
    'safeguarding.alert_sla_minutes': 15,
    'qa.samples_per_teacher_per_month': 2,
    'qa.review_sla_hours': 72,
    'billing.dunning_retry_days': 3,
    'billing.currency': 'GBP',
    'billing.invoice_due_days': 7,
    'payroll.cutoff_day': 25,
    'notifications.booking_confirmation_sla_seconds': 60,
    'notifications.reminder_hours_before': 24,
  };

  for (const [key, value] of Object.entries(settings)) {
    const existing = await prisma.appSetting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.appSetting.create({ data: { key, value: value as never } });
    }
  }
  console.log(`  app settings: ${Object.keys(settings).length}`);
}

/**
 * Marketing content (FR-ADM-06, FR-ADM-08).
 *
 * Landing pages, blog posts and a printable. A draft is deliberately included so the
 * editorial screen demonstrates the draft/published distinction rather than only showing
 * what is already public.
 */
async function seedCmsContent(): Promise<void> {
  const posts: Array<{
    type: 'BLOG' | 'PRINTABLE' | 'LANDING';
    slug: string;
    title: string;
    body: string;
    status: 'DRAFT' | 'PUBLISHED';
    meta?: Record<string, unknown>;
  }> = [
    {
      type: 'LANDING',
      slug: 'home',
      title: 'Hifzoon — live Hifz classes for children at home',
      body: [
        'Hifzoon pairs every child with a qualified teacher for live, one-to-one Hifz classes.',
        '',
        'What makes it different:',
        '- Every teacher completes safeguarding training before they meet a child.',
        '- Lesson cards reach the family within 15 minutes of the class ending.',
        '- Class times are shown in your own timezone, including over daylight saving.',
        '- The trial lesson is free, with no payment details needed to book it.',
      ].join('\n'),
      status: 'PUBLISHED',
      meta: { cta: 'Book a free trial', keywords: ['hifz', 'online Quran classes', 'tahfeez'] },
    },
    {
      type: 'LANDING',
      slug: 'how-it-works',
      title: 'How Hifzoon works',
      body: [
        '1. Book a free trial lesson.',
        '2. We match your child with a teacher who speaks your language and teaches their level.',
        '3. Choose a weekly slot that stays in your local time.',
        '4. After each class you get a lesson card with what was covered, homework, and any corrections.',
        '',
        'You can pause or cancel from your parent dashboard at any time.',
      ].join('\n'),
      status: 'PUBLISHED',
    },
    {
      type: 'BLOG',
      slug: 'how-long-does-hifz-take',
      title: "How long does it take to memorise the Qur'an?",
      body: [
        'The honest answer is that it depends on consistency, not on how clever the child is.',
        '',
        'A realistic figure from our own teaching practice is one page of the Madinah mushaf every three to four days for a motivated older child, which is roughly two to three years for full memorisation including revision.',
        '',
        'The variable that decides whether that holds is revision. A child who memorises quickly and revises nothing will forget more than they learned. Our spaced repetition treats a page as unfinished until it has survived several increasing intervals.',
      ].join('\n'),
      status: 'PUBLISHED',
      meta: { readingMinutes: 3 },
    },
    {
      type: 'PRINTABLE',
      slug: 'weekly-hifz-tracker',
      title: 'Weekly Hifz tracker (printable)',
      body: [
        'Week of: _______________',
        '',
        '| Day       | Portion completed | Revisions due | Teacher note |',
        '|-----------|-------------------|---------------|--------------|',
        '| Monday    |                   |               |              |',
        '| Tuesday   |                   |               |              |',
        '| Wednesday |                   |               |              |',
        '| Thursday  |                   |               |              |',
        '| Friday    |                   |               |              |',
        '| Saturday  |                   |               |              |',
        '',
        'Pages memorised this week: ______',
        'Pages now solid: ______',
        'Pages needing attention: ______',
      ].join('\n'),
      status: 'PUBLISHED',
    },
    {
      type: 'BLOG',
      slug: 'choosing-a-teacher-for-your-child',
      title: 'Choosing a teacher for your child',
      body: [
        'Draft — to be reviewed by the safeguarding lead before publication.',
        '',
        'Points to cover: language, gender preference for circles, experience with the age group, and how to request a change if the match is wrong.',
      ].join('\n'),
      status: 'DRAFT',
    },
  ];

  for (const post of posts) {
    const existing = await prisma.cmsPost.findUnique({ where: { slug: post.slug } });
    if (existing) continue;

    await prisma.cmsPost.create({
      data: {
        type: post.type,
        slug: post.slug,
        locale: 'en',
        title: post.title,
        body: post.body,
        status: post.status,
        // Only published posts get a date, so "latest articles" reflects when content
        // went live rather than when it was authored.
        publishedAt: post.status === 'PUBLISHED' ? new Date() : null,
        countryCode: null,
        meta: (post.meta ?? null) as never,
      },
    });
  }
  console.log(`  cms posts: ${posts.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
