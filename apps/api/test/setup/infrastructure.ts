import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

/**
 * Hermetic infrastructure for the e2e suite (TRD section 18).
 *
 * The gap this closes: `test:e2e` previously required the developer's own
 * docker-compose Postgres and Redis, seeded by hand. In CI that means either a
 * long-lived shared database (state bleeds between runs, a failed run poisons the
 * next one) or a slow matrix of service containers with hand-managed ports.
 *
 * Starting the real database and the real Redis per run removes both problems. The
 * trade is honest and worth stating: these tests are slower than unit tests and need a
 * Docker daemon. `test` still needs neither.
 *
 * Two details that are easy to get wrong and expensive to debug:
 *
 *   - **Migrations run against the container, not against `prisma migrate dev`.**
 *     `migrate deploy` applies committed SQL without generating anything and without
 *     prompting, so a test run can never mutate the schema the developer is looking at.
 *   - **The app is pointed at the container by environment variable**, set in this
 *     process before the DI graph is built. Nothing in `src` reads a hardcoded DSN, so
 *     no code change is needed to make the suite hermetic.
 */

/** Long enough for a cold image pull on a CI runner, short enough to fail usefully. */
const STARTUP_TIMEOUT_MS = 180_000;

const API_ROOT = join(__dirname, '..');

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;

/**
 * Loads `apps/api/.env` into this process, for the same reason the app does.
 *
 * The suite builds a real `AppModule`, which validates the whole env schema on start. It
 * used to pass only when the shell that launched it happened to export the secrets, so a
 * run could fail for reasons that had nothing to do with the change under test — and pass
 * on one machine and not another. Values already in the environment win, so CI still
 * overrides the file.
 */
function loadApiEnv(): void {
  // `API_ROOT` is `apps/api/test` (the Prisma CLI's working directory), so the env file
  // the API itself reads is one level further up.
  const envFile = join(API_ROOT, '..', '.env');
  if (!existsSync(envFile)) return;

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export default async function globalSetup(): Promise<void> {
  loadApiEnv();
  // FR-AUTH-01 — the restricted-session rule is on by default, and it is correct: a staff
  // account that has not enrolled a second factor can only reach the enrolment routes.
  // A fixture cannot present a TOTP code, so every seeded staff account would be locked
  // out of the suite. The rule is switched off here, and only here, so the enforcement
  // itself still gets its own unit tests.
  process.env.TWO_FACTOR_ENROLMENT_ENFORCED ??= 'false';

  // A developer with the docker-compose stack already running should be able to run the
  // suite against it. CI never sets this, so CI is always hermetic.
  if (process.env.E2E_USE_EXISTING_SERVICES === 'true') {
    if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
      throw new Error(
        'E2E_USE_EXISTING_SERVICES=true requires DATABASE_URL and REDIS_URL to be set.',
      );
    }
    console.log('[e2e] using the services from E2E_USE_EXISTING_SERVICES');
    return;
  }
  console.log('[e2e] starting postgres and redis containers…');

  postgres = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('hifzoon_e2e')
    .withUsername('hifzoon')
    .withPassword('hifzoon')
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  // Redis needs no auth here: the container is on a private bridge network for the
  // lifetime of the test run, and a password would only be checked by a server we are
  // already trusting completely.
  redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withStartupTimeout(STARTUP_TIMEOUT_MS)
    .start();

  const databaseUrl = postgres.getConnectionUri();
  const redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  // Point the app at the container for the rest of this process' children.
  process.env.E2E_DATABASE_URL = databaseUrl;
  console.log('[e2e] applying migrations to the container…');
  runPrisma(['migrate', 'deploy'], databaseUrl);
}

/**
 * Runs the Prisma CLI against `databaseUrl`.
 *
 * Invoked as `node <prisma-cli>` rather than `npx prisma`: `execFileSync` does not go
 * through a shell, and on Windows `npx` is `npx.cmd`, so spawning it by name fails with
 * a bare ENOENT. Resolving the CLI's entry point also guarantees the version matches the
 * one installed in this workspace instead of whatever a global install happens to be.
 */
function runPrisma(args: string[], databaseUrl: string): void {
  const require = createRequire(join(API_ROOT, 'package.json'));
  const cli = require.resolve('prisma/build/index.js');

  execFileSync(process.execPath, [cli, ...args], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

export async function globalTeardown(): Promise<void> {
  await redis?.stop();
  await postgres?.stop();
}
