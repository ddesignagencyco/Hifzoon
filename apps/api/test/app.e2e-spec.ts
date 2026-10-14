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
 * Requires the same infrastructure as the app itself (see docker-compose.yml).
 */

// Must be set before the DI graph is built: `AppConfigService` validates env in its
// constructor, and `isTest` is what suppresses the Swagger document.
process.env.NODE_ENV = 'test';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
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

  describe('seeded account', () => {
    // Requires `npm run db:seed`; the password is the documented dev password.
    const email = process.env.SEED_EMAIL ?? 'parent@hifzoon.test';
    const password = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';

    it('rejects bad credentials with 401, not 500', async () => {
      const res = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email, password: 'wrong-password-entirely' })
        .expect(401);

      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('logs the seeded guardian in and returns a usable access token', async () => {
      const res = await request(app.getHttpServer())
        .post(`${v1}/auth/login`)
        .send({ email, password })
        .expect(200);

      const token = res.body.data.accessToken;
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      // The token must actually open a protected route.
      const families = await request(app.getHttpServer())
        .get(`${v1}/families`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(families.body.data)).toBe(true);
      expect(families.body.data.length).toBeGreaterThan(0);
    });
  });
});
