import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';
import { loadConfig } from './config/env.schema';
import { startTelemetry, stopTelemetry } from './observability/telemetry';
import { ENVELOPE_SCHEMA } from './common/swagger-envelope';
import { CapturingIoAdapter } from './common/capturing-io.adapter';
import { RedisService } from './redis/redis.service';
import { buildOpenApiConfig, normalisePaths } from './openapi-config';

/**
 * API entry point (TRD section 6).
 *
 * Security posture set here rather than per-controller:
 *   - helmet with a strict CSP: the API serves JSON only, so anything script-like
 *     in a response is a bug or an attack (NFR-SEC-01)
 *   - global ValidationPipe with whitelist + forbidNonWhitelisted so an unexpected
 *     field is a 400, not silent data
 *   - raw body capture for webhook signature verification (TRD section 5.1)
 *   - the refresh cookie is httpOnly + SameSite=Strict, set in AuthController
 */
async function bootstrap(): Promise<void> {
  // Observability first (PLAT-BE-05): the tracing instrumentations must be registered
  // before the HTTP server is created or the first spans are already missed.
  await startTelemetry(loadConfig());

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);
  const env = config.value;

  app.useLogger(['error', 'warn', 'log']);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          // Without this the header falls back to default-src 'none' and blocks every
          // fetch() the Swagger UI page makes, so "Try it out" fails with "Failed to
          // fetch" (browser reports blocked fetches as CORS-like TypeErrors). 'self'
          // only: the docs page may call its own origin, nothing else.
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'no-referrer' },
      hsts: env.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Webhook providers sign the exact bytes they sent, so keep a copy before parsing.
  app.use(
    json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id', 'idempotency-key', 'retry-after'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix(env.API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );

  // Stripe/LiveKit sign raw bytes; keep the body out of the parsed object.
  app.useBodyParser('json', { rawBody: true });

  if (!env.isTest) {
    // Same builder the artifact generator uses, so the served spec and the committed
    // spec can never diverge (PLAT-BE-03).
    const document = SwaggerModule.createDocument(app, buildOpenApiConfig());
    SwaggerModule.setup('api/docs', app, normalisePaths(document), {
      swaggerOptions: { persistAuthorization: true },
      // Without this, Nest applies the global prefix to every path *and* the spec's
      // server URL is already `/api/v1`, so Swagger UI builds
      // `/api/v1/api/v1/health/live`. See normalisePaths().
      useGlobalPrefix: false,
    });
    ENVELOPE_SCHEMA.inject(document);
    logger.log(`OpenAPI available at /api/docs (${Object.keys(document.paths).length} paths)`);
  }

  app.enableShutdownHooks();
  // Flush buffered traces and error reports when the container stops; Nest's own shutdown
  // hook closes the app but knows nothing about the telemetry exporters.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void stopTelemetry());
  }

  // The custom adapter must be installed before `listen()`, because Socket.IO only
  // creates its server during that call and `CapturingIoAdapter` hooks it to keep the
  // parent handle the Redis adapter needs.
  const ioAdapter = new CapturingIoAdapter(app);
  app.useWebSocketAdapter(ioAdapter);

  await app.listen(env.PORT, '0.0.0.0');

  // Cross-instance room fan-out (TRD section 4.2, NFR-CAP-01). Best-effort: without it
  // a single API instance still works perfectly, it just cannot reach a teacher
  // connected to a different one.
  try {
    const redis = app.get(RedisService);
    const pub = redis.createClient('socket-pub');
    const sub = redis.createClient('socket-sub');
    await Promise.all([pub.ping(), sub.ping()]);

    if (await ioAdapter.attachRedisAdapter(pub, sub)) {
      logger.log('Socket.IO Redis adapter attached; classroom rooms are shared across instances');
    }
  } catch (error) {
    logger.warn(
      `Socket.IO Redis adapter not attached (${(error as Error).message}). Rooms stay local to this ` +
        'instance, which is fine in development but breaks live classes across multiple API replicas.',
    );
  }

  logger.log(`Hifzoon API listening on http://localhost:${env.PORT}/${env.API_PREFIX}`);
}

void bootstrap();
