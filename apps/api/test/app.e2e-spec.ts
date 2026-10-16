/**
 * End-to-end tests that boot the *real* Nest application and drive it over HTTP
 * with supertest.
 *
 * Where the unit specs under `src` mock every dependency and
 * `scripts/full-flow-check.ts` drives an already-running server on :4000, this
 * suite is the middle ground CI can rely on: it mounts the whole DI graph —
 * guards, the response envelope, the exception filter and the throttle — against
 * the real Postgres and Redis, but does not need a separate process or a port.
 *
 * It therefore catches the class of bug unit tests cannot see: a global provider
 * that throws on init, a route that is only reachable because a pipe was
 * forgotten, or an envelope that changed shape.
 *
 *   npm run test:e2e
 *
 * Infrastructure comes from Testcontainers (TRD section 18): a real Postgres 16 and a
 * real Redis are started for the run and migrated from committed SQL, so the suite does
 * not depend on a developer's docker-compose stack being up or seeded. Set
 * `E2E_USE_EXISTING_SERVICES=true` to point it at an existing stack instead.
 */

// Must be set before the DI graph is built: `AppConfigService` validates env in its
// constructor, and `isTest` is what suppresses the Swagger document.
process.env.NODE_ENV = 'test';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { AppConfigService } from '../src/config/app-config.service';

/** Mirrors `main.ts`, minus the concerns an in-process test cannot observe. */
describe('Hifzoon API (e2e)', () => {
  let app: INestApplication;
  let v1: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const config = app.get(AppConfigService);
    v1 = `/${config.apiPrefix}`;

    app.setGlobalPrefix(config.apiPrefix);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        stopAtFirstError: false,
      }),
    );
    // No `app.listen()`: supertest drives the ephemeral server itself.
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('platform', () => {
    it('answers the liveness probe without touching a dependency', async () => {
      const res = await request(app.getHttpServer()).get(`${v1}/health/live`).expect(200);

      expect(res.body.data.status).toBe('ok');
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
    });

    it('reports every dependency up on the readiness probe', async () => {
      const res = await request(app.getHttpServer()).get(`${v1}/health/ready`).expect(200);

      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.checks.database.status).toBe('up');
      expect(res.body.data.checks.redis.status).toBe('up');
    });

    it('wraps every successful response in the `{ data, meta }` envelope', async () => {
      const res = await request(app.getHttpServer()).get(`${v1}/health/live`).expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body.meta.requestId).toEqual(expect.any(String));
    });
  });

  describe('authentication boundary', () => {
    it('rejects an anonymous request with the standard error shape', async () => {
      const res = await request(app.getHttpServer()).get(`${v1}/families`).expect(401);

      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(res.body).toHaveProperty('message');
      expect(res.body.requestId).toEqual(expect.any(String));
    });

    it('rejects a malformed bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get(`${v1}/families`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);

      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('exposes the public catalogue without a token', async () => {
      const res = await request(app.getHttpServer()).get(`${v1}/courses`).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects an unexpected field rather than dropping it silently', async () => {
      const res = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email: 'parent@hifzoon.test', password: 'irrelevant', role: 'SUPER_ADMIN' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('self-provisioned account', () => {
    /**
     * Registered through the public API rather than inserted by a seed script.
     *
     * The old version of this suite hard-coded `parent@hifzoon.test` and documented
     * "run `npm run db:seed` first", which meant a CI run silently depended on a
     * developer's local database having been seeded. Registering here means the only
     * precondition is a running Postgres.
     */
    const email = `e2e-${randomUUID()}@hifzoon.test`;
    const password = 'Hifzoon!E2E2026';
    let accessToken = '';

    it('registers a guardian and returns a usable access token', async () => {
      const registered = await request(app.getHttpServer())
        .post(`${v1}/auth/register`)
        .send({ email, password, name: 'E2E Guardian', timeZone: 'Asia/Karachi' })
        .expect(201);
      expect(registered.body.data.id).toEqual(expect.any(String));

      const login = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email, password })
        .expect(200);

      accessToken = login.body.data.accessToken;
      expect(accessToken.split('.')).toHaveLength(3);
    });

    it('rejects bad credentials with 401, not 500', async () => {
      const res = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email, password: 'wrong-password-entirely' })
        .expect(401);

      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('refuses to register the same email twice', async () => {
      const res = await request(app.getHttpServer())
        .post(`${v1}/auth/register`)
        .send({ email, password, name: 'Impostor' })
        .expect(409);

      expect(res.body.code).toBe('EMAIL_TAKEN');
    });

    it('uses the token to open a protected route', async () => {
      const families = await request(app.getHttpServer())
        .get(`${v1}/families`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(families.body.data)).toBe(true);
    });

    it('rotates the refresh token and refuses to reuse the old one', async () => {
      // FR-AUTH-01: presenting a rotated token means it leaked, and the whole session
      // dies. This is the single most security-relevant behaviour in the auth module,
      // so it is worth asserting against a real session rather than a mock.
      const login = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email, password })
        .expect(200);

      const first = login.body.data.refreshToken;
      expect(typeof first).toBe('string');

      const rotated = await request(app.getHttpServer())
        .post(`${v1}/auth/refresh`)
        .send({ refreshToken: first })
        .expect(200);
      expect(rotated.body.data.refreshToken).not.toBe(first);

      const replay = await request(app.getHttpServer())
        .post(`${v1}/auth/refresh`)
        .send({ refreshToken: first })
        .expect(401);
      expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('reports the current user with roles', async () => {
      const res = await request(app.getHttpServer())
        .get(`${v1}/auth/me`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.email).toBe(email);
      expect(res.body.data.roles).toContain('GUARDIAN');
    });
  });

  describe('tenant isolation (FR-AUTH-02, CR-03, CR-10)', () => {
    it('does not let one guardian read another family', async () => {
      // Two accounts, two families, one request.
      // `PolicyService.assertGuardianInFamily` throws NOT_RESOURCE_OWNER, so this is a
      // 403 rather than a 404. That does distinguish "exists but not yours" from "does
      // not exist", which is a mild information leak on family ids; it is the existing
      // contract and this test pins it deliberately rather than asserting a 404 the
      // service never returns.
      const mk = async (label: string) => {
        const email = `iso-${label}-${randomUUID()}@hifzoon.test`;
        const password = 'Hifzoon!E2E2026';
        await request(app.getHttpServer())
          .post(`${v1}/auth/register`)
          .send({ email, password, name: `Isolation ${label}` })
          .expect(201);
        // Only the login shape is sent here: the global pipe runs with
        // `forbidNonWhitelisted`, so reusing the registration body would be a 400 for
        // including `name`, which is correct behaviour and not what this test is about.
        const login = await request(app.getHttpServer())
          .post(`${v1}/auth/login`)
          .send({ email, password })
          .expect(200);
        return login.body.data.accessToken as string;
      };

      const tokenA = await mk('a');
      const tokenB = await mk('b');

      const familyA = await request(app.getHttpServer())
        .post(`${v1}/families`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Family A' })
        .expect(201);
      const familyAId = familyA.body.data.id as string;

      const res = await request(app.getHttpServer())
        .get(`${v1}/families/${familyAId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(403);

      expect(res.body.code).toBe('NOT_RESOURCE_OWNER');
    });
  });
});
