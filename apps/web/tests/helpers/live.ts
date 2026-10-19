import { clearAccessToken, setAccessToken } from '@/lib/api/client';

/**
 * Helpers for `tests/integration/**` — real HTTP against the running API with the
 * development seed (`npm run db:seed`). Run with `npm run test:integration`.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';

/** Seeded accounts and fixed ids from apps/api/prisma/seed.ts. */
export const SEED = {
  accounts: {
    guardian: 'parent@hifzoon.test',
    teacher: 'teacher@hifzoon.test',
    trainee: 'teacher.trainee@hifzoon.test',
    admin: 'admin@hifzoon.test',
    superAdmin: 'superadmin@hifzoon.test',
    supervisor: 'supervisor@hifzoon.test',
    safeguarding: 'safeguarding@hifzoon.test',
    examiner: 'examiner@hifzoon.test',
  },
  familyId: '00000000-0000-7000-8000-000000000001',
  students: {
    maryam: '00000000-0000-7000-8000-000000000011',
    yusuf: '00000000-0000-7000-8000-000000000012',
  },
  enrolments: {
    maryamQaida: '00000000-0000-7000-8000-000000000101',
    yusufHifz: '00000000-0000-7000-8000-000000000102',
  },
} as const;

export type SeedAccount = keyof typeof SEED.accounts;

const tokenCache = new Map<SeedAccount, { token: string; userId: string; expiresAt: number }>();

/** Logs in as a seeded account (cached per test run) and returns the access token. */
export async function loginAs(account: SeedAccount): Promise<{ token: string; userId: string }> {
  const cached = tokenCache.get(account);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached;

  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED.accounts[account], password: SEED_PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `Login as ${account} failed (${res.status} ${json?.code}): ${json?.message}. ` +
        'Is the API running on :4000 and seeded? Run the seed inside the api container.',
    );
  }
  const entry = {
    token: json.data.accessToken as string,
    userId: json.data.user.id as string,
    expiresAt: Date.now() + (json.data.expiresIn ?? 900) * 1000,
  };
  tokenCache.set(account, entry);
  return entry;
}

/** Makes the web API client act as the given seeded account for subsequent calls. */
export async function actAs(account: SeedAccount): Promise<{ token: string; userId: string }> {
  const session = await loginAs(account);
  setAccessToken(session.token);
  return session;
}

export function actAsAnonymous(): void {
  clearAccessToken();
}

/** A unique suffix so tests that create records never collide across runs. */
export function uniq(prefix = 't'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
