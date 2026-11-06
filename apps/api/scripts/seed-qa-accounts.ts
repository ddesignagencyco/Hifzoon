/**
 * QA accounts for browser testing on a local or staging database. Additive and idempotent:
 * existing accounts are never touched, so a developer's own sign-ins keep working.
 *
 *   npx ts-node scripts/seed-qa-accounts.ts
 *
 * The password comes from QA_PASSWORD, otherwise the development default below (local only,
 * like SEED_PASSWORD in prisma/seed.ts). Nothing here is ever run in production.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const PASSWORD = process.env.QA_PASSWORD ?? 'Hifzoon!QA-Test-2026';
/** The family the QA guardian joins, so the parent portal has real children to show. */
const QA_FAMILY_OF = process.env.QA_FAMILY_OF ?? 'hamid.raza@hifzoon.test';

const prisma = new PrismaClient();

async function user(email: string, name: string, roles: string[], hash: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Only QA accounts are refreshed; a real account with this email is left alone.
    if (!email.startsWith('qa.')) return existing;
    // A fresh start each run: the test enrols 2FA itself, so an old secret nobody holds
    // would lock the account out.
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash: hash,
        status: 'ACTIVE',
        twoFactorEnabled: false,
        twoFactorSecret: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    for (const role of roles) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: existing.id, role: role as never } },
        update: {},
        create: { userId: existing.id, role: role as never },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hash,
      timeZone: 'Asia/Karachi',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      notificationPreferences: { create: {} },
      roles: { create: roles.map((role) => ({ role: role as never })) },
    },
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('QA accounts are never created in production');
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });

  const parent = await user('qa.parent@hifzoon.test', 'QA Parent', ['GUARDIAN'], hash);
  const teacher = await user('qa.teacher@hifzoon.test', 'QA Teacher', ['TEACHER'], hash);
  await user('qa.admin@hifzoon.test', 'QA Admin', ['ADMIN'], hash);
  await user('qa.supervisor@hifzoon.test', 'QA Supervisor', ['SUPERVISOR'], hash);

  const family = await prisma.family.findFirst({
    where: { members: { some: { user: { email: QA_FAMILY_OF } } } },
    select: {
      id: true,
      students: { select: { id: true, displayName: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!family) throw new Error(`No family for ${QA_FAMILY_OF}`);
  await prisma.familyMember.upsert({
    where: { familyId_userId: { familyId: family.id, userId: parent.id } },
    update: {},
    create: {
      familyId: family.id,
      userId: parent.id,
      relationship: 'QA guardian',
      isPrimary: false,
      verifiedAt: new Date(),
    },
  });

  const profile = await prisma.teacherProfile.upsert({
    where: { userId: teacher.id },
    update: {},
    create: { userId: teacher.id, subjects: ['DUAS', 'HIFZ', 'QAIDA'], languages: ['en', 'ur'] },
    select: { id: true },
  });

  // Two classes with the family's last child: one running now (classroom, mistakes) and one
  // that has ended (lesson card). Re-running adds no duplicates for the same day.
  const student = family.students[family.students.length - 1];
  const course = await prisma.course.findUniqueOrThrow({
    where: { code: 'DUAS' },
    select: { id: true },
  });
  const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const slots = [
    { startsAt: now, minutes: 45 },
    { startsAt: new Date(now.getTime() - 90 * 60_000), minutes: 45 },
  ];
  for (const slot of slots) {
    const endsAt = new Date(slot.startsAt.getTime() + slot.minutes * 60_000);
    const clash = await prisma.classSession.findFirst({
      where: { teacherId: profile.id, startsAt: { lt: endsAt }, endsAt: { gt: slot.startsAt } },
    });
    if (clash) continue;
    await prisma.classSession.create({
      data: {
        teacherId: profile.id,
        courseId: course.id,
        type: 'REGULAR',
        status: 'SCHEDULED',
        startsAt: slot.startsAt,
        endsAt,
        students: { create: [{ studentId: student.id, startsAt: slot.startsAt, endsAt }] },
      },
    });
  }

  console.log('QA accounts ready: qa.parent, qa.teacher, qa.admin, qa.supervisor @hifzoon.test');
  console.log(
    `QA guardian joined the family of ${QA_FAMILY_OF}; classes made with ${student.displayName}.`,
  );
  console.log('Password: QA_PASSWORD, or the default in scripts/seed-qa-accounts.ts.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
