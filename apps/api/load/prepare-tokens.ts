/**
 * Resolves access tokens for the k6 load suite (NFR-CAP-01).
 *
 * k6 measures what it is given. Logging in inside the test would measure Argon2id —
 * which is deliberately slow and would dominate the result — so tokens are minted here,
 * once, and every VU reuses one.
 *
 * Usage:
 *   npm run load:tokens                      # 100 tokens from a seeded dev database
 *   npm run load:tokens -- --count 5000      # the number NFR-CAP-01 assumes
 *   npm run load:tokens -- --file load/.tokens.json
 *
 * The accounts must already exist. `prisma/seed.ts` creates `parent@hifzoon.test`;
 * extra accounts are created here through the public API so the tokens are real ones
 * from a real session, not hand-written JWTs.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4000';
const API = `${BASE_URL}/api/v1`;
const PASSWORD = process.env.LOAD_PASSWORD ?? 'Hifzoon!Load2026';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const count = Number(arg('count', '100'));
const outFile = resolve(arg('file', 'load/.tokens.json'));

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data;
}

async function login(email: string): Promise<string> {
  const data = await call('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return data.accessToken as string;
}

/**
 * Concurrency-limited so 5,000 registrations do not open 5,000 sockets at once and
 * trip the auth throttle — which would make the run fail for the wrong reason.
 */
async function pooled<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main(): Promise<void> {
  const batch = randomUUID().slice(0, 8);
  const emails = Array.from({ length: count }, (_, i) => `load-${batch}-${i}@hifzoon.test`);

  console.log(`Registering ${count} load accounts against ${BASE_URL}…`);
  await pooled(emails, 20, async (email) => {
    await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD, name: 'Load Test User' }),
    }).catch((error: Error) => {
      // 409 is fine: the account exists from an earlier run and can still log in.
      if (!error.message.includes('409')) throw error;
    });
  });

  console.log('Logging in…');
  const tokens = await pooled(emails, 20, (email) => login(email));

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(tokens, null, 2), 'utf8');
  console.log(`Wrote ${tokens.length} tokens to ${outFile}`);
  console.log('Set LOAD_PASSWORD to the value you passed if you changed it.');
}

main().catch((error: Error) => {
  console.error(`\nFailed: ${error.message}`);
  console.error('Is the API running? Try: npm run dev:api');
  process.exitCode = 1;
});
