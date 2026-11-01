import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Demo volume for pagination (DEV ONLY).
 *
 * Every paginated list in the app only shows a pager once it exceeds one page (20 rows),
 * and the base seed deliberately keeps a handful of rows each. This tops up the lists the
 * team demos — all against the existing demo accounts (Khan family, the cleared teacher,
 * the parent/teacher/admin logins) — to ~55 rows so a pager appears and can be clicked
 * through.
 *
 * Idempotent: every row has a deterministic id and is inserted with `skipDuplicates`, so
 * re-running `db:seed` never duplicates. All rows carry a `seed-`/`SEED-`/`Demo` marker,
 * so they are easy to spot and were never meant to look like real records.
 */

/** Deterministic, valid-UUID id: a 2-hex group tag + a zero-padded (decimal, hex-safe) index. */
const seedId = (group: string, index: number) =>
  `000000${group}-0000-7000-8000-${String(index).padStart(12, '0')}`;

const PER_LIST = 55;

export async function seedPaginationDemo(prisma: PrismaClient): Promise<void> {
  const byEmail = (email: string) =>
    prisma.user.findUnique({ where: { email }, select: { id: true } });
  const [parent, teacherUser, admin, safeguarding] = await Promise.all([
    byEmail('parent@hifzoon.test'),
    byEmail('teacher@hifzoon.test'),
    byEmail('admin@hifzoon.test'),
    byEmail('safeguarding@hifzoon.test'),
  ]);
  const teacherProfile = teacherUser
    ? await prisma.teacherProfile.findUnique({
        where: { userId: teacherUser.id },
        select: { id: true },
      })
    : null;

  const FAMILY_ID = '00000000-0000-7000-8000-000000000001';
  const YUSUF_ID = '00000000-0000-7000-8000-000000000012';
  const KHAN_ENROLMENT_ID = '00000000-0000-7000-8000-000000000102';
  const [khanFamily, hifz, qaida] = await Promise.all([
    prisma.family.findUnique({ where: { id: FAMILY_ID }, select: { id: true } }),
    prisma.course.findUnique({ where: { code: 'HIFZ' }, select: { id: true } }),
    prisma.course.findUnique({ where: { code: 'QAIDA' }, select: { id: true } }),
  ]);

  if (!khanFamily || !hifz || !qaida) {
    console.log('  pagination demo: core seed (family/courses) missing — skipped');
    return;
  }

  const now = Date.now();
  const DAY = 86_400_000;
  const idx = <T>(list: readonly T[], i: number) => list[i % list.length];

  // ── CMS posts (admin content / articles) ──────────────────────────────────
  const cmsTypes = ['BLOG', 'PRINTABLE', 'LANDING'] as const;
  const cmsStatuses = ['PUBLISHED', 'DRAFT', 'ARCHIVED'] as const;
  await prisma.cmsPost.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.CmsPostCreateManyInput => {
      const i = k + 1;
      const status = idx(cmsStatuses, i);
      return {
        id: seedId('b2', i),
        type: idx(cmsTypes, i),
        slug: `seed-article-${String(i).padStart(3, '0')}`,
        locale: 'en',
        title: `Demo article ${i}: online Hifz teaching notes`,
        body: `Placeholder body for demo article ${i}, used to demonstrate list pagination.`,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date(now - i * DAY) : null,
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  // ── Notifications (per demo login) ────────────────────────────────────────
  const notifUsers = [parent, teacherUser, admin].filter((u): u is { id: string } => Boolean(u));
  const notifStatuses = ['READ', 'DELIVERED', 'SENT', 'FAILED', 'SKIPPED'] as const;
  for (const [u, user] of notifUsers.entries()) {
    await prisma.notification.createMany({
      skipDuplicates: true,
      data: Array.from({ length: PER_LIST }, (_, k): Prisma.NotificationCreateManyInput => {
        const i = k + 1;
        const status = idx(notifStatuses, i);
        const sent = status === 'READ' || status === 'DELIVERED' || status === 'SENT';
        return {
          id: seedId('a4', u * 1000 + i),
          userId: user.id,
          type: 'class.reminder',
          channel: 'IN_APP',
          payload: {
            title: `Class reminder ${i}`,
            body: `Your upcoming class #${i} is about to start.`,
          },
          status,
          sentAt: sent ? new Date(now - i * 3_600_000) : null,
          readAt: status === 'READ' ? new Date(now - i * 1_800_000) : null,
          failureReason:
            status === 'FAILED'
              ? 'Provider reported the message FAILED'
              : status === 'SKIPPED'
                ? 'Family has not opted in to this channel'
                : null,
          createdAt: new Date(now - i * 3_600_000),
        };
      }),
    });
  }

  // ── Invoices (Khan family; admin invoices table) ──────────────────────────
  const invoiceStatuses = ['PAID', 'OPEN', 'FAILED', 'VOID', 'REFUNDED', 'DRAFT'] as const;
  await prisma.invoice.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.InvoiceCreateManyInput => {
      const i = k + 1;
      const status = idx(invoiceStatuses, i);
      const total = 3900 + (i % 5) * 1000;
      return {
        id: seedId('a1', i),
        familyId: FAMILY_ID,
        number: `SEED-INV-${String(i).padStart(4, '0')}`,
        currency: 'GBP',
        subtotalMinor: total,
        discountMinor: 0,
        totalMinor: total,
        status,
        // Alternate the billing source so the admin table's CARD/MANUAL filter has both.
        providerInvoiceId: i % 2 === 0 ? `in_seed_${String(i).padStart(4, '0')}` : null,
        dueAt: new Date(now - i * DAY + 7 * DAY),
        paidAt: status === 'PAID' ? new Date(now - i * DAY) : null,
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  // ── Payroll periods + the cleared teacher's payslips ──────────────────────
  if (teacherProfile) {
    await prisma.payrollPeriod.createMany({
      skipDuplicates: true,
      data: Array.from({ length: PER_LIST }, (_, k): Prisma.PayrollPeriodCreateManyInput => {
        const i = k + 1;
        const startsOn = new Date(now - i * 30 * DAY);
        return {
          id: seedId('a2', i),
          startsOn,
          endsOn: new Date(startsOn.getTime() + 29 * DAY),
          status: 'PAID',
        };
      }),
    });
    await prisma.payrollEntry.createMany({
      skipDuplicates: true,
      data: Array.from({ length: PER_LIST }, (_, k): Prisma.PayrollEntryCreateManyInput => {
        const i = k + 1;
        const gross = 24000 + (i % 6) * 1200;
        const deductions = (i % 4) * 300;
        return {
          id: seedId('a3', i),
          periodId: seedId('a2', i),
          teacherId: teacherProfile.id,
          grossMinor: gross,
          deductionsMinor: deductions,
          bonusesMinor: 0,
          netMinor: gross - deductions,
          status: 'PAID',
          paidAt: new Date(now - i * 30 * DAY + 28 * DAY),
          payoutReference: `BACS-SEED-${String(i).padStart(4, '0')}`,
        };
      }),
    });
  }

  // ── Cases (safeguarding / supervisor queue) ───────────────────────────────
  const caseOpener = safeguarding ?? admin;
  if (caseOpener) {
    const caseTypes = ['COMPLAINT', 'SAFEGUARDING'] as const;
    const caseStatuses = ['OPEN', 'INVESTIGATING', 'ACTIONED', 'CLOSED'] as const;
    const caseSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
    await prisma.caseRecord.createMany({
      skipDuplicates: true,
      data: Array.from({ length: PER_LIST }, (_, k): Prisma.CaseRecordCreateManyInput => {
        const i = k + 1;
        const status = idx(caseStatuses, i);
        // Some open ones sit in the past so the "overdue" filter and badge have rows.
        const overdue = status !== 'CLOSED' && i % 3 === 0;
        return {
          id: seedId('a5', i),
          type: idx(caseTypes, i),
          status,
          severity: idx(caseSeverities, i),
          openedById: caseOpener.id,
          ownerId: i % 2 === 0 ? caseOpener.id : null,
          summary: `Demo case ${i}: follow-up required on a reported concern.`,
          dueAt: new Date(now + (overdue ? -i * DAY : i * DAY)),
          closedAt: status === 'CLOSED' ? new Date(now - i * DAY) : null,
          createdAt: new Date(now - i * DAY),
        };
      }),
    });
  }

  // ── Teacher-change requests (Khan family) ─────────────────────────────────
  const tcStatuses = ['OPEN', 'APPROVED', 'DECLINED', 'CANCELLED'] as const;
  await prisma.teacherChangeRequest.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.TeacherChangeRequestCreateManyInput => {
      const i = k + 1;
      const status = idx(tcStatuses, i);
      return {
        id: seedId('a6', i),
        familyId: FAMILY_ID,
        studentId: YUSUF_ID,
        enrolmentId: KHAN_ENROLMENT_ID,
        reason: `Demo request ${i}: prefers a teacher available later in the evening.`,
        status,
        resolvedById: status === 'OPEN' ? null : (admin?.id ?? null),
        resolvedAt: status === 'OPEN' ? null : new Date(now - i * DAY),
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  // ── Leads (CRM) ───────────────────────────────────────────────────────────
  const leadStatuses = ['NEW', 'TRIAL_BOOKED', 'TRIAL_DONE', 'WON', 'LOST'] as const;
  const leadSources = ['website', 'referral', 'instagram', 'google', 'whatsapp'] as const;
  await prisma.lead.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.LeadCreateManyInput => {
      const i = k + 1;
      return {
        id: seedId('a7', i),
        contactName: `Demo Lead ${i}`,
        source: idx(leadSources, i),
        status: idx(leadStatuses, i),
        email: `demo.lead.${i}@example.test`,
        phone: `+44770090${String(1000 + i).slice(-4)}`,
        country: 'GB',
        city: idx(['London', 'Birmingham', 'Manchester', 'Leeds', 'Bradford'] as const, i),
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  // ── Teacher applications (hiring pipeline) ────────────────────────────────
  const hiringStatuses = [
    'SUBMITTED',
    'RECITATION_REVIEW',
    'DEMO_CLASS',
    'ID_CHECK',
    'REFERENCE_CHECK',
    'TRAINING',
    'APPROVED',
    'REJECTED',
  ] as const;
  await prisma.teacherApplication.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.TeacherApplicationCreateManyInput => {
      const i = k + 1;
      return {
        id: seedId('a8', i),
        applicantName: `Demo Applicant ${i}`,
        email: `demo.applicant.${i}@example.test`,
        country: 'GB',
        status: idx(hiringStatuses, i),
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  // ── Families + students + enrolments (admin enrolments & users search) ─────
  const FAMILIES = 25;
  await prisma.family.createMany({
    skipDuplicates: true,
    data: Array.from({ length: FAMILIES }, (_, k): Prisma.FamilyCreateManyInput => {
      const i = k + 1;
      return {
        id: seedId('b0', i),
        name: `Demo Family ${i}`,
        country: 'GB',
        currency: 'GBP',
        timeZone: 'Europe/London',
      };
    }),
  });

  const genders = ['MALE', 'FEMALE'] as const;
  await prisma.student.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.StudentCreateManyInput => {
      const i = k + 1;
      return {
        id: seedId('a9', i),
        familyId: seedId('b0', (i % FAMILIES) + 1),
        displayName: `Demo Student ${i}`,
        birthYear: new Date().getUTCFullYear() - (6 + (i % 10)),
        gender: idx(genders, i),
        timeZone: 'Europe/London',
      };
    }),
  });

  const enrolmentStatuses = ['TRIAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'] as const;
  await prisma.enrolment.createMany({
    skipDuplicates: true,
    data: Array.from({ length: PER_LIST }, (_, k): Prisma.EnrolmentCreateManyInput => {
      const i = k + 1;
      const status = idx(enrolmentStatuses, i);
      // Leave every third one without a teacher so "awaiting a teacher" has rows to page.
      const withTeacher = teacherProfile && i % 3 !== 0;
      return {
        id: seedId('b1', i),
        studentId: seedId('a9', i),
        courseId: i % 2 === 0 ? hifz.id : qaida.id,
        teacherId: withTeacher ? teacherProfile.id : null,
        status,
        startedAt: status === 'TRIAL' ? null : new Date(now - i * DAY),
        createdAt: new Date(now - i * DAY),
      };
    }),
  });

  console.log(`  pagination demo: ~${PER_LIST} rows each across content, notifications, invoices,`);
  console.log(
    '    payslips, cases, teacher-changes, leads, applications, enrolments/students/families',
  );
}
