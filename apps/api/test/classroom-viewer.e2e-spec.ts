/**
 * HTTP-level coverage for the safeguarding and booking fixes in web team v4.2.0.
 *
 * Each test here is a regression test for something that was reproduced against a running
 * API, so the value is entirely in going over HTTP: the role guard, the policy service and
 * the transaction all have to agree, and only that proves the breach is closed.
 *
 *   S12 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a guardian of one family watching another family's class (child safeguarding)
 *   B25 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the trial child's own parent being refused at the door
 *   B21 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a teacher unable to mark a mistake in a trial
 *   B28 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a booked trial creating no enrolment
 *   B26 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â booking a teacher who does not teach the course
 *   B27 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â booking outside the teacher's availability
 *
 *   npm run test:e2e
 */

process.env.NODE_ENV = 'test';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';

const PASSWORD = 'Hifzoon!E2E2026';
const prisma = new PrismaClient();

describe('Classroom viewer scope and booking guards (S12, B21, B25, B26, B27, B28)', () => {
  let app: INestApplication;
  let v1: string;

  let teacherToken = '';
  let teacherId = '';
  let teacherUserId = '';
  /** Khan family: Maryam is enrolled with the teacher. */
  let khanToken = '';
  let maryamId = '';
  /** Rehman family: Umair has a trial booked with the same teacher. */
  let rehmanToken = '';
  let umairId = '';

  let hifzCourseId = '';
  let qaidaCourseId = '';
  let trialClassId = '';

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(
    label: string,
  ): Promise<{ email: string; token: string; userId: string }> {
    const email = `cls-${label}-${randomUUID()}@hifzoon.test`;
    const registered = await server()
      .post(`${v1}/auth/register`)
      .send({ email, password: PASSWORD, name: `CLS ${label}`, timeZone: 'Asia/Karachi' })
      .expect(201);
    const login = await server()
      .post(`${v1}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { email, token: login.body.data.accessToken, userId: registered.body.data.id };
  }

  /** A family with one child, mirroring the two families in the report. */
  async function familyWithChild(
    label: string,
    childName: string,
  ): Promise<{ token: string; studentId: string; userId: string; familyId: string }> {
    const account = await register(label);
    const family = await server()
      .post(`${v1}/families`)
      .set(auth(account.token))
      .send({ name: `${label} Family` })
      .expect(201);
    const student = await server()
      .post(`${v1}/families/${family.body.data.id}/students`)
      .set(auth(account.token))
      .send({ displayName: childName, birthYear: 2014, gender: 'MALE' })
      .expect(201);
    return {
      token: account.token,
      studentId: student.body.data.id,
      userId: account.userId,
      familyId: family.body.data.id,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix(app.get(AppConfigService).apiPrefix);
    await app.init();
    v1 = `/${app.get(AppConfigService).apiPrefix}`;

    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ Two courses. `TeacherProfile.subjects` holds course *codes*, so the codes are minted
    // first and the teacher is given the one they actually teach (B26).
const hifzCode = `HIFZ-${randomUUID().slice(0, 8)}`;
const qaidaCode = `QAIDA-${randomUUID().slice(0, 8)}`;

    // ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ A teacher, available MondayÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œFriday 16:00ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ20:00 Europe/London, teaching HIFZ ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬
    const teacherEmail = `cls-teacher-${randomUUID()}@hifzoon.test`;
    const teacher = await server()
      .post(`${v1}/auth/register`)
      .send({ email: teacherEmail, password: PASSWORD, name: 'Ustadh Bilal', timeZone: 'Europe/London' })
      .expect(201);
    teacherUserId = teacher.body.data.id as string;
    await prisma.userRole.create({ data: { userId: teacherUserId, role: 'TEACHER' } });
    const profile = await prisma.teacherProfile.create({
      data: {
        userId: teacherUserId,
        subjects: [hifzCode],
        hiringStatus: 'APPROVED',
        readyToMatch: true,
        // The FR-TCH-02 CHECK derives readiness from this, so it cannot be asserted alone.
        safeguardingTrainingCompletedAt: new Date(),
      },
      select: { id: true },
    });
    teacherId = profile.id;
    await prisma.availabilitySlot.createMany({
      data: [1, 2, 3, 4, 5].map((weekday) => ({
        teacherId: profile.id,
        weekday,
        startTime: new Date('2026-01-01T16:00:00.000Z'),
        endTime: new Date('2026-01-01T20:00:00.000Z'),
        timeZone: 'Europe/London',
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      })),
    });
    const teacherLogin = await server()
      .post(`${v1}/auth/login`)
      .send({ email: teacherEmail, password: PASSWORD })
      .expect(200);
    teacherToken = teacherLogin.body.data.accessToken;

    hifzCourseId = (
      await prisma.course.create({
        data: {
          code: hifzCode,
          name: 'Hifz',
          type: 'HIFZ',
          description: 'Created by the classroom viewer e2e suite.',
        },
        select: { id: true },
      })
    ).id;
    qaidaCourseId = (
      await prisma.course.create({
        data: {
          code: qaidaCode,
          name: 'Qaida',
          type: 'QAIDA',
          description: 'A course this teacher does not teach.',
        },
        select: { id: true },
      })
    ).id;

    const khan = await familyWithChild('khan', 'Maryam');
    khanToken = khan.token;
    maryamId = khan.studentId;
    const rehman = await familyWithChild('rehman', 'Umair');
    rehmanToken = rehman.token;
    umairId = rehman.studentId;

    // CR-01 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a class cannot be booked without data-collection consent.
    for (const { studentId, familyId, userId } of [
      { studentId: maryamId, familyId: khan.familyId, userId: khan.userId },
      { studentId: umairId, familyId: rehman.familyId, userId: rehman.userId },
    ]) {
      await prisma.consent.create({
        data: {
          familyId,
          studentId,
          purpose: 'DATA_COLLECTION',
          status: 'GRANTED',
          method: 'SIGNED_FORM',
          policyVersion: 'e2e-1.0',
          grantedByUserId: userId,
        },
      });
    }

    // Maryam is enrolled with this teacher ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â and so is Umair, by the trial below. That
    // overlap is the whole point of S12: the old check asked "does this guardian teach
    // this teacher", not "is my child in this room".
    await prisma.enrolment.create({
      data: { studentId: maryamId, courseId: hifzCourseId, teacherId, status: 'ACTIVE' },
    });

    // A live class right now, with Maryam in it. Umair has an enrolment with the teacher
    // but is NOT on this class.
    const live = await prisma.classSession.create({
      data: {
        teacherId,
        courseId: hifzCourseId,
        type: 'TRIAL',
        status: 'LIVE',
        startsAt: new Date(Date.now() - 5 * 60_000),
        endsAt: new Date(Date.now() + 55 * 60_000),
      },
      select: { id: true },
    });
    await prisma.classStudent.create({
      data: {
        classId: live.id,
        studentId: maryamId,
        startsAt: new Date(Date.now() - 5 * 60_000),
        endsAt: new Date(Date.now() + 55 * 60_000),
      },
    });
    trialClassId = live.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  describe('S12 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â who may watch a class', () => {
    it('lets the guardian of a student on the class in, as a viewer', async () => {
      const res = await server()
        .post(`${v1}/classroom/classes/${trialClassId}/token`)
        .set(auth(khanToken))
        .expect(201);

      expect(res.body.data.role).toBe('GUARDIAN_VIEWER');
    });

    it('refuses a guardian whose child is enrolled with the teacher but not in this class', async () => {
      // Umair holds an enrolment with this teacher ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â in *another* course. Under the old rule
      // that was enough to watch Maryam's live class. It is deliberately not the HIFZ
      // course, so the trial below still has to create its own enrolment.
      await prisma.enrolment.create({
        data: { studentId: umairId, courseId: qaidaCourseId, teacherId, status: 'ACTIVE' },
      });

      const res = await server()
        .post(`${v1}/classroom/classes/${trialClassId}/token`)
        .set(auth(rehmanToken))
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
    });
  });

  describe('B25, B21, B28 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a trial has to work end to end', () => {
    /** The next Monday at `hour` London, inside the teacher's 16:00ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ20:00 availability. */
    function nextMondayAt(hour: number): Date {
      const now = new Date();
      const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
      return new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + daysUntilMonday,
          hour,
          0,
          0,
        ),
      );
    }

    it('books a trial and creates the TRIAL enrolment for the class teacher', async () => {
      const booked = await server()
        .post(`${v1}/scheduling/book`)
        .set(auth(rehmanToken))
        .send({
          teacherId,
          courseId: hifzCourseId,
          studentId: umairId,
          startsAt: nextMondayAt(17).toISOString(),
          durationMinutes: 60,
          roomType: 'ONE_TO_ONE',
          type: 'TRIAL',
        })
        .expect(201);

      const enrolment = await prisma.enrolment.findFirst({
        where: { studentId: umairId, status: 'TRIAL' },
        select: { id: true, teacherId: true, courseId: true },
      });
      expect(enrolment).toMatchObject({ teacherId, courseId: hifzCourseId });

      const link = await prisma.classStudent.findFirst({
        where: { classId: booked.body.data.id, studentId: umairId },
        select: { enrolmentId: true },
      });
      expect(link?.enrolmentId).toBe(enrolment?.id);
    });

    it('lets that trial parent join to watch', async () => {
      const booked = await server()
        .post(`${v1}/scheduling/book`)
        .set(auth(rehmanToken))
        .send({
          teacherId,
          courseId: hifzCourseId,
          studentId: umairId,
          startsAt: nextMondayAt(18).toISOString(),
          durationMinutes: 60,
          roomType: 'ONE_TO_ONE',
          type: 'TRIAL',
        })
        .expect(201);

      // A guardian viewer needs a room that is open, so bring the booked class forward to
      // "now" ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the property under test is the membership check, not the clock. The
      // teacher's no-overlap constraint means the seed class has to step aside first.
      await prisma.classSession.update({
        where: { id: trialClassId },
        data: {
          status: 'COMPLETED',
          startsAt: new Date(Date.now() - 180 * 60_000),
          endsAt: new Date(Date.now() - 120 * 60_000),
        },
      });
      await prisma.classSession.update({
        where: { id: booked.body.data.id },
        data: {
          status: 'LIVE',
          startsAt: new Date(Date.now() - 5 * 60_000),
          endsAt: new Date(Date.now() + 55 * 60_000),
        },
      });
      await prisma.classStudent.updateMany({
        where: { classId: booked.body.data.id },
        data: {
          startsAt: new Date(Date.now() - 5 * 60_000),
          endsAt: new Date(Date.now() + 55 * 60_000),
        },
      });

      const res = await server()
        .post(`${v1}/classroom/classes/${booked.body.data.id}/token`)
        .set(auth(rehmanToken))
        .expect(201);

      expect(res.body.data.role).toBe('GUARDIAN_VIEWER');
    });

    it('lets the teacher mark a mistake for a student they only see in a trial', async () => {
      await prisma.classSession.update({
        where: { id: trialClassId },
        data: {
          status: 'COMPLETED',
          startsAt: new Date(Date.now() - 180 * 60_000),
          endsAt: new Date(Date.now() - 120 * 60_000),
        },
      });

      const booked = await server()
        .post(`${v1}/scheduling/book`)
        .set(auth(rehmanToken))
        .send({
          teacherId,
          courseId: hifzCourseId,
          studentId: umairId,
          startsAt: nextMondayAt(16).toISOString(),
          durationMinutes: 60,
          roomType: 'ONE_TO_ONE',
          type: 'TRIAL',
        })
        .expect(201);

      await server()
        .post(`${v1}/classes/${booked.body.data.id}/mistakes`)
        .set(auth(teacherToken))
        .send({ studentId: umairId, surah: 1, ayah: 1, wordIndex: 0, type: 'SKIPPED_WORD' })
        .expect(201);

const read = await server()
        .get(`${v1}/students/${umairId}/mistakes`)
        .set(auth(teacherToken))
        .expect(200);

      expect(read.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('B26, B27 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â what may be booked', () => {
    it('refuses a teacher who does not teach the course', async () => {
      const res = await server()
        .post(`${v1}/scheduling/book`)
        .set(auth(khanToken))
        .send({
          teacherId,
          courseId: qaidaCourseId,
          studentId: maryamId,
          startsAt: '2026-03-04T17:00:00.000Z',
          durationMinutes: 60,
          roomType: 'ONE_TO_ONE',
          type: 'TRIAL',
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuses a time outside the teacher availability', async () => {
      const res = await server()
        .post(`${v1}/scheduling/book`)
        .set(auth(khanToken))
        .send({
          teacherId,
          courseId: hifzCourseId,
          studentId: maryamId,
          startsAt: '2026-03-04T03:00:00.000Z',
          durationMinutes: 60,
          roomType: 'ONE_TO_ONE',
          type: 'TRIAL',
        })
        .expect(409);

      expect(res.body.code).toBe('SLOT_UNAVAILABLE');
    });
  });
});
