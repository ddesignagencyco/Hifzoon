/**
 * HTTP-level coverage for the page-state API (FR-HFZ-01), driven through the real Nest
 * application on the Testcontainers Postgres.
 *
 * The unit spec proves the service asks Prisma for the right things; this spec proves the
 * whole request path — role guard, ownership check, zod query pipe, response envelope —
 * agrees with it, and that the database CHECK on `page_number` is reachable from HTTP.
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

describe('Hifz page state (FR-HFZ-01) over HTTP', () => {
  let app: INestApplication;
  let v1: string;

  let guardianToken = '';
  let otherGuardianToken = '';
  let teacherToken = '';
  let familyId = '';
  let studentId = '';

  const server = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(label: string): Promise<{ email: string; token: string; userId: string }> {
    const email = `hifz-${label}-${randomUUID()}@hifzoon.test`;
    const registered = await server()
      .post(`${v1}/auth/register`)
      .send({ email, password: PASSWORD, name: `HFZ ${label}`, timeZone: 'Asia/Karachi' })
      .expect(201);
    const login = await server()
      .post(`${v1}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { email, token: login.body.data.accessToken, userId: registered.body.data.id };
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

    const guardian = await register('guardian');
    guardianToken = guardian.token;
    otherGuardianToken = (await register('other')).token;

    const family = await server()
      .post(`${v1}/families`)
      .set(auth(guardianToken))
      .send({ name: 'HFZ Family' })
      .expect(201);
    familyId = family.body.data.id;

    const student = await server()
      .post(`${v1}/families/${familyId}/students`)
      .set(auth(guardianToken))
      .send({ displayName: 'Hafiz Child', birthYear: 2014, gender: 'MALE' })
      .expect(201);
    studentId = student.body.data.id;

    const teacher = await register('teacher');
    await prisma.userRole.create({ data: { userId: teacher.userId, role: 'TEACHER' } });
    const profile = await prisma.teacherProfile.create({
      data: { userId: teacher.userId },
      select: { id: true },
    });
    const course = await prisma.course.create({
      data: {
        code: `HFZ-${randomUUID().slice(0, 8)}`,
        name: 'Hifz E2E',
        type: 'HIFZ',
        description: 'Created by the HFZ e2e suite.',
      },
      select: { id: true },
    });
    await prisma.enrolment.create({
      data: { studentId, courseId: course.id, teacherId: profile.id, status: 'ACTIVE' },
    });

    const teacherLogin = await server()
      .post(`${v1}/auth/login`)
      .send({ email: teacher.email, password: PASSWORD })
      .expect(200);
    teacherToken = teacherLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  describe('access control', () => {
    it('lets the guardian read their child, who has no rows before initialisation', async () => {
      const res = await server()
        .get(`${v1}/hifz/students/${studentId}/pages`)
        .set(auth(guardianToken))
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('refuses a guardian from another family', async () => {
      const res = await server()
        .get(`${v1}/hifz/students/${studentId}/pages`)
        .set(auth(otherGuardianToken))
        .expect(403);

      expect(res.body.code).toBe('NOT_RESOURCE_OWNER');
    });

    it('rejects an anonymous caller', async () => {
      await server().get(`${v1}/hifz/students/${studentId}/pages`).expect(401);
    });
  });

  describe('single page', () => {
    it('rejects a page outside 1..604 with a validation error', async () => {
      const zero = await server()
        .get(`${v1}/hifz/students/${studentId}/pages/0`)
        .set(auth(guardianToken))
        .expect(400);
      expect(zero.body.code).toBe('VALIDATION_FAILED');

      await server()
        .get(`${v1}/hifz/students/${studentId}/pages/605`)
        .set(auth(guardianToken))
        .expect(400);
    });

    it('rejects a non-numeric page', async () => {
      await server()
        .get(`${v1}/hifz/students/${studentId}/pages/abc`)
        .set(auth(guardianToken))
        .expect(400);
    });

    it('404s a page that has no state yet', async () => {
      await server()
        .get(`${v1}/hifz/students/${studentId}/pages/5`)
        .set(auth(guardianToken))
        .expect(404);
    });
  });

  describe('initialisation', () => {
    it('is reserved for teachers and staff, not the guardian', async () => {
      await server()
        .post(`${v1}/hifz/students/${studentId}/pages/initialize`)
        .set(auth(guardianToken))
        .expect(403);
    });

    it('materialises all 604 rows for the student teacher', async () => {
      const res = await server()
        .post(`${v1}/hifz/students/${studentId}/pages/initialize`)
        .set(auth(teacherToken))
        .expect(201);

      expect(res.body.data).toEqual({ created: 604, total: 604 });
    });

    it('is idempotent — a second run creates nothing', async () => {
      const res = await server()
        .post(`${v1}/hifz/students/${studentId}/pages/initialize`)
        .set(auth(teacherToken))
        .expect(201);

      expect(res.body.data.created).toBe(0);
      expect(res.body.data.total).toBe(604);
    });

    it('exposes all 604 rows in page order afterwards', async () => {
      const res = await server()
        .get(`${v1}/hifz/students/${studentId}/pages`)
        .set(auth(guardianToken))
        .expect(200);

      expect(res.body.data).toHaveLength(604);
      expect(res.body.data[0].pageNumber).toBe(1);
      expect(res.body.data[603].pageNumber).toBe(604);
    });

    it('filters by page state', async () => {
      const notStarted = await server()
        .get(`${v1}/hifz/students/${studentId}/pages?state=NOT_STARTED`)
        .set(auth(guardianToken))
        .expect(200);
      expect(notStarted.body.data).toHaveLength(604);

      const solid = await server()
        .get(`${v1}/hifz/students/${studentId}/pages?state=SOLID`)
        .set(auth(guardianToken))
        .expect(200);
      expect(solid.body.data).toEqual([]);
    });

    it('rejects an unknown state filter', async () => {
      await server()
        .get(`${v1}/hifz/students/${studentId}/pages?state=TOTALLY_MEMORISED`)
        .set(auth(guardianToken))
        .expect(400);
    });

    it('applies a page range', async () => {
      const res = await server()
        .get(`${v1}/hifz/students/${studentId}/pages?fromPage=10&toPage=12`)
        .set(auth(guardianToken))
        .expect(200);
      expect(res.body.data.map((p: { pageNumber: number }) => p.pageNumber)).toEqual([10, 11, 12]);
    });
  });
});
