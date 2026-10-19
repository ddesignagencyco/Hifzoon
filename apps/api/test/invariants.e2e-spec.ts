/**
 * Database invariants, tested against a real Postgres (TRD section 18).
 *
 * The unit suite mocks Prisma, so it can only assert that the application *tried* to
 * write something. It cannot assert that the write was impossible. These tests talk to
 * the container directly and attempt the forbidden operations, which is the only way to
 * show the five invariant triggers actually fire.
 *
 * That distinction is the whole point of putting rules in the database (STATUS §2.5):
 * application logic can be bypassed by a migration, a script, psql, or a future
 * service. A trigger that has only ever been exercised through a service is a trigger
 * nobody has really tested.
 *
 *   npm run test:e2e
 */

process.env.NODE_ENV = 'test';

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/** One client for the file; each test rolls its own data back by using fresh ids. */
const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database invariants', () => {
  describe('FR-OPS-06 — audit_log is append-only', () => {
    it('refuses an UPDATE, even from raw SQL', async () => {
      const row = await prisma.auditLog.create({
        data: { action: 'e2e.append-only.update', targetType: 'user' },
        select: { id: true },
      });

      // Prisma would hide the SQL error behind a typed error; raw is used deliberately
      // because "can psql do this?" is the actual question.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "audit_log" SET "action" = 'tampered' WHERE "id" = $1::uuid`,
          row.id,
        ),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses a DELETE, so an audit trail cannot be pruned', async () => {
      const row = await prisma.auditLog.create({
        data: { action: 'e2e.append-only.delete', targetType: 'user' },
        select: { id: true },
      });

      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "audit_log" WHERE "id" = $1::uuid`, row.id),
      ).rejects.toThrow(/append-only/);
    });

    it('still allows INSERT — append-only must not mean read-only', async () => {
      const id = randomUUID();
      const inserted = await prisma.auditLog.create({
        data: { id, action: 'e2e.append-only.insert', targetType: 'user' },
        select: { id: true },
      });
      expect(inserted.id).toBe(id);
    });
  });

  describe('FR-TCH-02 — ready_to_match is derived, never set by hand', () => {
    /**
     * A teacher profile that has not been through the pipeline must not be settable to
     * matchable by writing the flag directly.
     */
    it('refuses ready_to_match = true without the inputs behind it', async () => {
      const userId = await createUser('ready-to-match');

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "teacher_profile" ("id", "user_id", "ready_to_match")
           VALUES (gen_random_uuid(), $1::uuid, true)`,
          userId,
        ),
      ).rejects.toThrow(/FR-TCH-02|ready_to_match/i);
    });
  });

  describe('FR-REC-08 — a locked lesson card is immutable', () => {
    it('refuses an ordinary edit once the card is locked', async () => {
      const card = await createLockedLessonCard();

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "lesson_card" SET "homework" = 'tampered after lock' WHERE "id" = $1::uuid`,
          card,
        ),
      ).rejects.toThrow(/FR-REC-08/);
    });

    it('refuses the same edit on an unlocked card only after it is locked', async () => {
      // The control case. Without it, the first test could pass because *every* update
      // fails for some unrelated reason (a missing column, a bad fixture) and would
      // prove nothing about the trigger.
      const card = await createLessonCard({ locked: false });

      const updated = await prisma.$executeRawUnsafe(
        `UPDATE "lesson_card" SET "homework" = 'edited while open' WHERE "id" = $1::uuid RETURNING "id"`,
        card,
      );
      expect(updated).toBe(1);

      await prisma.$executeRawUnsafe(
        `UPDATE "lesson_card" SET "locked_at" = now() WHERE "id" = $1::uuid`,
        card,
      );

      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "lesson_card" SET "homework" = 'tampered after lock' WHERE "id" = $1::uuid`,
          card,
        ),
      ).rejects.toThrow(/FR-REC-08/);
    });
  });
  describe('FR-SCH — one teacher cannot be in two classes at once', () => {
    it('refuses an overlapping session for the same teacher', async () => {
      // Double booking is prevented by a GiST exclusion constraint rather than only by
      // application logic (STATUS §1.3). That matters because the constraint holds even
      // against a concurrent request that both passed the application check — the classic
      // check-then-act race that produces a teacher who is somehow in two classes.
      const { teacherId, courseId } = await classFixture();
      const startsAt = nextFreeWindow();
      const endsAt = nextFreeWindowEnd();

      await prisma.classSession.create({
        data: { teacherId, courseId, startsAt, endsAt, status: 'SCHEDULED' },
      });

      await expect(
        prisma.classSession.create({
          // Overlaps the first: starts inside it, ends after it.
          data: {
            teacherId,
            courseId,
            startsAt: new Date(startsAt.getTime() + 15 * 60_000),
            endsAt: new Date(endsAt.getTime() + 15 * 60_000),
            status: 'SCHEDULED',
          },
        }),
      ).rejects.toThrow(/exclusion constraint|class_session_teacher_no_overlap/i);
    });

    it('allows two different teachers to teach at the same time', async () => {
      // The control case, so the first test cannot pass merely because the constraint
      // rejects everything.
      const { courseId } = await classFixture();
      const otherTeacher = await prisma.teacherProfile.create({
        data: { userId: await createUser('invariant-teacher-2') },
        select: { id: true },
      });

      const startsAt = nextFreeWindow();
      const endsAt = nextFreeWindowEnd();

      const a = await prisma.classSession.create({
        data: { teacherId: (await classFixture()).teacherId, courseId, startsAt, endsAt },
        select: { id: true },
      });
      const b = await prisma.classSession.create({
        data: { teacherId: otherTeacher.id, courseId, startsAt, endsAt },
        select: { id: true },
      });

      expect(a.id).not.toBe(b.id);
    });
  });

  describe('FR-HFZ-01 — a page state is bounded to the Mushaf and unique per page', () => {
    it('refuses a page number outside 1..604 at the database', async () => {
      const { studentId } = await classFixture();

      // The service validates too, but the CHECK is the backstop that holds against psql,
      // a migration or any future writer that skips the API (STATUS §2.5).
      await expect(
        prisma.studentPageState.create({ data: { studentId, pageNumber: 0 } }),
      ).rejects.toThrow(/page_state_page_range/);
      await expect(
        prisma.studentPageState.create({ data: { studentId, pageNumber: 605 } }),
      ).rejects.toThrow(/page_state_page_range/);
    });

    it('accepts the two boundary pages', async () => {
      const { studentId } = await classFixture();

      const first = await prisma.studentPageState.create({
        data: { studentId, pageNumber: 1 },
        select: { pageNumber: true },
      });
      const last = await prisma.studentPageState.create({
        data: { studentId, pageNumber: 604 },
        select: { pageNumber: true },
      });

      expect([first.pageNumber, last.pageNumber]).toEqual([1, 604]);
    });

    it('refuses a second row for the same (student, page)', async () => {
      const { studentId } = await classFixture();

      await prisma.studentPageState.create({ data: { studentId, pageNumber: 42 } });

      await expect(
        prisma.studentPageState.create({ data: { studentId, pageNumber: 42 } }),
      ).rejects.toThrow(/page_state_student_id_page_number_key|unique/i);
    });
  });
});

async function createUser(label: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${randomUUID()}@hifzoon.test`,
      name: label,
      passwordHash: 'not-a-real-hash',
    },
    select: { id: true },
  });
  return user.id;
}

/** A teacher and a course, the only two foreign keys `ClassSession` requires. */
let fixtureCache:
  { teacherUserId: string; teacherId: string; courseId: string; studentId: string } | undefined;

async function classFixture() {
  if (fixtureCache) return fixtureCache;

  const teacherUserId = await createUser('invariant-teacher');
  const teacher = await prisma.teacherProfile.create({
    data: { userId: teacherUserId },
    select: { id: true },
  });
  const course = await prisma.course.create({
    data: {
      code: `E2E-${randomUUID().slice(0, 8)}`,
      name: 'E2E Course',
      type: 'HIFZ',
      description: 'Created by the e2e invariant suite.',
    },
    select: { id: true },
  });

  // A `LessonCard` points at a `Student`, which points at a `Family` — so the chain has
  // to be built to the end or the insert fails on a foreign key.
  const family = await prisma.family.create({
    data: { name: 'E2E Family', timeZone: 'UTC' },
    select: { id: true },
  });
  const student = await prisma.student.create({
    data: {
      familyId: family.id,
      displayName: 'E2E Student',
      birthYear: 2015,
      gender: 'MALE',
    },
    select: { id: true },
  });

  fixtureCache = {
    teacherUserId,
    teacherId: teacher.id,
    courseId: course.id,
    studentId: student.id,
  };
  return fixtureCache;
}

/**
 * Creates a real `ClassSession` and a `LessonCard` on it.
 *
 * This builds the fixture properly rather than skipping when it cannot: a fixture that
 * silently returns null turns the test into a green that proves nothing, which is worse
 * than a red one because it removes the check without anyone noticing.
 */
async function createLessonCard(options: { locked: boolean }): Promise<string> {
  const { teacherId, courseId, teacherUserId, studentId } = await classFixture();

  const startsAt = nextFreeWindow();
  const session = await prisma.classSession.create({
    data: {
      teacherId,
      courseId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: 'COMPLETED',
    },
    select: { id: true },
  });

  const card = await prisma.lessonCard.create({
    data: {
      classId: session.id,
      teacherId: teacherUserId,
      studentId,
      homework: 'original',
      submittedAt: new Date(),
      lockedAt: options.locked ? new Date() : null,
    },
    select: { id: true },
  });

  return card.id;
}

/**
 * Each fixture session needs its own time window.
 *
 * `class_session_teacher_no_overlap` is a GiST exclusion constraint, so two sessions for
 * the same teacher at the same instant are refused by Postgres. That is exactly the
 * behaviour being tested further down, and reusing a fixed timestamp would trip it here
 * first and mask the real assertions.
 */
let windowCounter = 0;

function nextFreeWindow(): Date {
  windowCounter += 1;
  return new Date(Date.UTC(2026, 0, 1, windowCounter * 2, 0, 0));
}

function nextFreeWindowEnd(): Date {
  return new Date(nextFreeWindow().getTime() + 30 * 60_000);
}

async function createLockedLessonCard(): Promise<string> {
  return createLessonCard({ locked: true });
}
