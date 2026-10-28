import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';
import { totp } from './totp';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Shared fixtures + helpers for the Hifzoon e2e suite.
 *
 * Selectors here are literal strings taken from the component source (see
 * docs/MODULE-FLOWS.md for the matching manual steps).
 */

export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';
export const PASSWORD = process.env.SEED_PASSWORD ?? 'Hifzoon!Dev2026';

export const ACCOUNTS = {
  parent: 'parent@hifzoon.test',
  student: 'student@hifzoon.test',
  teacher: 'teacher@hifzoon.test',
  supervisor: 'supervisor@hifzoon.test',
  supervisorTeacher: 'supervisor.teacher@hifzoon.test',
  admin: 'admin@hifzoon.test',
  superAdmin: 'superadmin@hifzoon.test',
  safeguarding: 'safeguarding@hifzoon.test',
  examiner: 'examiner@hifzoon.test',
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

/**
 * Accounts the suite actually depends on. The setup gate hard-requires these.
 */
export const SEEDED_ACCOUNTS: AccountKey[] = [
  'parent',
  'teacher',
  'supervisor',
  'admin',
  'superAdmin',
  'safeguarding',
  'examiner',
];

/**
 * Accounts that may legitimately be absent:
 *  - `student@hifzoon.test` — never created; `demo:data` deliberately skips it
 *    (scripts/demo-data.ts:756) because no endpoint links a Student to a User.
 *  - `supervisor.teacher` / `teacher.trainee` — present in prisma/seed.ts but
 *    missing from some older databases, and unused by these tests.
 * Tests using these self-skip via `accountExists()`.
 */
export const OPTIONAL_ACCOUNTS: AccountKey[] = ['student', 'supervisorTeacher'];

/** True when the account can actually authenticate against the running API. */
export async function accountExists(
  request: APIRequestContext,
  account: AccountKey,
): Promise<boolean> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email: ACCOUNTS[account], password: PASSWORD, deviceId: 'pw-probe' },
  });
  return res.ok();
}

/** Fixed ids created by apps/web/scripts/demo-data.ts */
export const SEEDED = {
  family: '00000000-0000-7000-8000-000000000001',
  maryam: '00000000-0000-7000-8000-000000000011',
  yusuf: '00000000-0000-7000-8000-000000000012',
} as const;

/** Where each role lands after login (see lib/portal/nav.ts getDefaultRouteForRole). */
export const PORTAL_FOR: Record<AccountKey, string> = {
  parent: '/parent',
  student: '/student',
  teacher: '/teacher',
  supervisor: '/supervisor',
  supervisorTeacher: '/supervisor',
  admin: '/admin',
  superAdmin: '/admin',
  safeguarding: '/safeguarding',
  examiner: '/supervisor',
};

// ---------------------------------------------------------------------------
// API helpers (used to discover seeded ids instead of hardcoding them)
// ---------------------------------------------------------------------------

export async function apiLogin(
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password, deviceId: 'pw-e2e' },
  });

  // Staff with 2FA enrolled answer 401 TWO_FACTOR_REQUIRED; complete the challenge.
  if (res.status() === 401 && (await res.json())?.code === 'TWO_FACTOR_REQUIRED') {
    const key = (Object.keys(ACCOUNTS) as AccountKey[]).find((k) => ACCOUNTS[k] === email);
    const secret = key ? readStoredSecret(key) : null;
    if (!secret) {
      throw new Error(`${email} needs a 2FA code but no secret is stored in e2e/.auth/`);
    }
    const step2 = await request.post(`${API_URL}/auth/login`, {
      data: { email, password, twoFactorCode: totp(secret), deviceId: 'pw-e2e' },
    });
    if (!step2.ok()) throw new Error(`2FA challenge failed for ${email}: ${step2.status()}`);
    return (await step2.json())?.data?.accessToken;
  }

  if (!res.ok()) throw new Error(`API login failed for ${email}: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  const token = body?.data?.accessToken ?? body?.accessToken;
  if (!token) throw new Error(`No access token in login response for ${email}`);
  return token;
}

export async function apiGet<T = any>(
  request: APIRequestContext,
  path: string,
  token: string,
): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`GET ${path} -> ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return (body?.data ?? body) as T;
}

/** A live class id for the teacher, or null when nothing is scheduled now. */
export async function findTeacherClassId(request: APIRequestContext): Promise<string | null> {
  const token = await apiLogin(request, ACCOUNTS.teacher);

  // /auth/me returns the User id; the timetable endpoint wants the TeacherProfile id.
  const me = await apiGet<any>(request, '/teachers/me', token);
  const teacherId = me?.id ?? me?.teacherProfileId;
  if (!teacherId) return null;

  const tt = await apiGet<any>(
    request,
    `/scheduling/teachers/${teacherId}/timetable?from=${new Date().toISOString()}&to=${new Date(Date.now() + 86400000).toISOString()}`,
    token,
  );
  const rows = Array.isArray(tt) ? tt : (tt?.schedules ?? tt?.items ?? []);
  return rows[0]?.classId ?? rows[0]?.id ?? null;
}

/**
 * The API allows only 10 logins per 15 minutes (packages/shared RATE_LIMITS).
 * A full suite signs in ~20 times, so logins are performed ONCE per role and the
 * issued refresh cookie is cached in e2e/.auth/cookies.json. Later runs replay
 * the cookie, and the app recovers its access token from it on first load.
 */
export async function seedRoleCookies(
  request: APIRequestContext,
  account: AccountKey,
): Promise<Array<{ name: string; value: string }>> {
  const file = path.join(__dirname, '.auth', 'cookies.json');
  let store: Record<string, Array<{ name: string; value: string }>> = {};
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* first run */
  }
  if (store[account]?.length) return store[account];

  const headers: Record<string, string> = {};
  let res = await request.post(`${API_URL}/auth/login`, {
    data: { email: ACCOUNTS[account], password: PASSWORD, deviceId: 'pw-cookie' },
    headers,
  });

  if (res.status() === 401 && (await res.json())?.code === 'TWO_FACTOR_REQUIRED') {
    const secret = readStoredSecret(account);
    if (!secret) throw new Error(`${ACCOUNTS[account]} needs a 2FA code but none is stored`);
    res = await request.post(`${API_URL}/auth/login`, {
      data: {
        email: ACCOUNTS[account],
        password: PASSWORD,
        twoFactorCode: totp(secret),
        deviceId: 'pw-cookie',
      },
      headers,
    });
  }
  if (!res.ok()) throw new Error(`Login for ${ACCOUNTS[account]} failed: ${res.status()}`);

  const raw = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const cookies = raw
    .map((h) => h.value.split(';')[0])
    .filter((v) => v.includes('='))
    .map((v) => {
      const idx = v.indexOf('=');
      return { name: v.slice(0, idx), value: decodeURIComponent(v.slice(idx + 1)) };
    });

  if (!cookies.length) throw new Error(`No refresh cookie issued for ${ACCOUNTS[account]}`);

  store[account] = cookies;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
  return cookies;
}

function cookieFileFor(): string {
  return path.join(__dirname, '.auth', 'cookies.json');
}

function readCookieStore(account: AccountKey): Array<{ name: string; value: string }> | null {
  try {
    return JSON.parse(fs.readFileSync(cookieFileFor(), 'utf8'))?.[account] ?? null;
  } catch {
    return null;
  }
}

function writeCookieStore(
  account: AccountKey,
  cookies: Array<{ name: string; value: string }>,
): void {
  const file = cookieFileFor();
  let store: Record<string, unknown> = {};
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* first run */
  }
  store[account] = cookies;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

/** Reads a previously stored 2FA secret from e2e/.auth/two-factor.json. */
export function readStoredSecret(account: AccountKey): string | null {
  return readSecretStore(secretFileFor(), account);
}

function secretFileFor(): string {
  return path.join(__dirname, '.auth', 'two-factor.json');
}

/**
 * Staff accounts must enrol in 2FA before the API will serve them anything
 * (FR-AUTH-01 / TwoFactorEnrolmentInterceptor). The secret is written to
 * e2e/.auth/two-factor.json so repeat runs can still answer the challenge —
 * the API never returns an existing secret.
 */
export async function getTwoFactorSecret(
  request: APIRequestContext,
  account: AccountKey,
): Promise<string | null> {
  const email = ACCOUNTS[account];
  const secretFile = secretFileFor();

  const stored = readSecretStore(secretFile, account);
  if (stored) return stored;

  const login = await request.post(`${API_URL}/auth/login`, {
    data: { email, password: PASSWORD, deviceId: 'pw-2fa' },
  });
  if (!login.ok()) return null;

  const token = (await login.json())?.data?.accessToken;
  const me = await apiGet<any>(request, '/auth/me', token);

  // Already enrolled from an earlier run but no stored secret: disable first,
  // otherwise we can never reproduce a valid code again.
  if (me?.twoFactorEnabled === true) {
    const off = await request.post(`${API_URL}/auth/two-factor/disable`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { password: PASSWORD },
    });
    if (!off.ok()) return null;
  }

  const setup = await request.post(`${API_URL}/auth/two-factor/setup`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { password: PASSWORD },
  });
  if (!setup.ok()) return null;

  const body = await setup.json();
  const secret = body?.data?.secret ?? body?.data?.manualKey ?? body?.secret;
  if (!secret) return null;

  const confirm = await request.post(`${API_URL}/auth/two-factor/confirm`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { code: totp(secret) },
  });
  if (!confirm.ok()) return null;

  writeSecretStore(secretFile, account, secret);
  return secret;
}

function readSecretStore(file: string, account: AccountKey): string | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))?.[account] ?? null;
  } catch {
    return null;
  }
}

function writeSecretStore(file: string, account: AccountKey, secret: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let store: Record<string, string> = {};
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* first run */
  }
  store[account] = secret;
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/**
 * Sign in through the real login form. Selector notes:
 *  - inputs have no <label for>, so we match on placeholder (login/page.tsx:337,366)
 *  - submit button accessible name is "Sign In" (login/page.tsx:396)
 */
export async function loginAs(
  page: Page,
  account: AccountKey,
  opts: { redirect?: string; expectUrl?: string | RegExp } = {},
): Promise<void> {
  const email = ACCOUNTS[account];

  await page.goto(opts.redirect ? `/login?redirect=${encodeURIComponent(opts.redirect)}` : '/login');
  await page.getByPlaceholder('name@example.com').fill(email);
  await page.getByPlaceholder('••••••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // Staff accounts with 2FA enrolled get an in-place challenge (login/page.tsx:162).
  // isVisible() does not auto-wait, so wait for the heading to attach first.
  const challenge = page.getByRole('heading', { name: 'Two-Factor Verification' });
  const challenged = await challenge
    .waitFor({ state: 'visible', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (challenged) {
    const secret = readStoredSecret(account);
    if (!secret) {
      throw new Error(
        `${email} requires a 2FA code but no secret was stored. ` +
          'Run: npx playwright test --project=setup',
      );
    }
    await page.getByPlaceholder('123456').fill(totp(secret));
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  }

  // Successful login redirects to the role's default portal, the ?redirect=
  // target, or whatever expectUrl overrides (used by the open-redirect guard).
  const destination = opts.expectUrl
    ? opts.expectUrl
    : opts.redirect
      ? new RegExp(opts.redirect.replace('/', '\\/'))
      : new RegExp(PORTAL_FOR[account].replace('/', '\\/'));
  await expect(page).toHaveURL(destination);
  await expect(page.getByText('Verifying secure session...')).toHaveCount(0);
}

/** Filled in by the setup project so staff logins can answer the challenge. */
export const STAFF_2FA_SECRETS: Partial<Record<AccountKey, string>> = {};

export async function signOut(page: Page): Promise<void> {
  const nav = page.getByRole('navigation');
  const signOutBtn = nav.getByRole('button', { name: 'Sign out', exact: true });
  if (await signOutBtn.isVisible().catch(() => false)) {
    await signOutBtn.click();
  } else {
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/login/);
}

/** Assert the current route is guarded and returned the right status page. */
export async function expectForbidden(page: Page): Promise<void> {
  await expect(page.getByText('You don’t have access to this page')).toBeVisible();
  await expect(page.getByText('This area is for')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to my portal' })).toBeVisible();
}

/** Assert a signed-out visitor is bounced to login with a safe redirect param. */
export async function expectRedirectedToLogin(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole('heading', { name: 'Sign In to Hifzoon' })).toBeVisible();
}

/** Wait out the ProtectedRoute session spinner so assertions do not race it. */
export async function waitForSessionCheck(page: Page): Promise<void> {
  await expect(page.getByText('Verifying secure session...')).toHaveCount(0, { timeout: 20_000 });
}

/** Success toasts are role="status", errors role="alert" (components/ui/toast.tsx:63). */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: text })).toBeVisible({ timeout: 15_000 });
}

export async function expectErrorToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible({ timeout: 15_000 });
}

/** PortalShell renders <nav aria-label="{label} navigation"> (PortalShell.tsx:65). */
export function portalNav(page: Page, label: string) {
  return page.getByRole('navigation', { name: `${label} navigation` });
}

export const PORTAL_LABELS = {
  parent: 'Family portal',
  student: 'Student portal',
  teacher: 'Teacher portal',
  supervisor: 'Quality & supervision',
  safeguarding: 'Safeguarding',
  admin: 'Academy admin',
} as const;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Fixtures = {
  guardian: Page;
  teacher: Page;
  supervisor: Page;
  admin: Page;
  superAdmin: Page;
  safeguarding: Page;
  student: Page;
};

/** Restore a cached session instead of signing in again (login rate limit). */
async function useCachedSession(
  page: Page,
  request: APIRequestContext,
  account: AccountKey,
): Promise<void> {
  const webHost = new URL(process.env.E2E_WEB_URL ?? 'http://localhost:3000').hostname;
  const portal = PORTAL_FOR[account];

const cached = readCookieStore(account);
if (cached?.length) {
    await page.context().addCookies(cached.map((c) => ({ ...c, domain: webHost, path: '/' })));
    await page.goto(portal);

    // The app rotates the refresh cookie on use, so a cached one can be stale.
    // Wait for the session spinner to clear; if it never does, the cookie is dead.
    const resolved = await page
      .getByText('Verifying secure session...')
      .waitFor({ state: 'hidden', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (resolved && !(await page.url()).includes('/login')) {
      await persistRotatedCookie(page, account);
      return;
    }

    await page.context().clearCookies();
    clearCookieStore(account);
  }

  await loginAs(page, account);
  await waitForSessionCheck(page);
  await persistRotatedCookie(page, account);
}

function clearCookieStore(account: AccountKey): void {
  const file = cookieFileFor();
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete store[account];
    fs.writeFileSync(file, JSON.stringify(store, null, 2));
  } catch {
    /* nothing stored */
  }
}

/** Write the post-refresh refresh cookie back so the next run stays valid. */
async function persistRotatedCookie(page: Page, account: AccountKey): Promise<void> {
  const cookies = await page.context().cookies();
  const refresh = cookies.find((c) => c.name.includes('refresh'));
  if (refresh) writeCookieStore(account, [{ name: refresh.name, value: refresh.value }]);
}

export const test = base.extend<Fixtures>({
  guardian: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'parent');
    await page.goto(PORTAL_FOR['parent']);
    await waitForSessionCheck(page);
    await use(page);
  },
  teacher: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'teacher');
    await page.goto(PORTAL_FOR['teacher']);
    await waitForSessionCheck(page);
    await use(page);
  },
  supervisor: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'supervisor');
    await page.goto(PORTAL_FOR['supervisor']);
    await waitForSessionCheck(page);
    await use(page);
  },
  admin: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'admin');
    await page.goto(PORTAL_FOR['admin']);
    await waitForSessionCheck(page);
    await use(page);
  },
  superAdmin: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'superAdmin');
    await page.goto(PORTAL_FOR['superAdmin']);
    await waitForSessionCheck(page);
    await use(page);
  },
  safeguarding: async ({ page, request }, use) => {
    await useCachedSession(page, request, 'safeguarding');
    await page.goto(PORTAL_FOR['safeguarding']);
    await waitForSessionCheck(page);
    await use(page);
  },
  student: async ({ page, request }, use) => {
    test.skip(
      !(await accountExists(request, 'student')),
      'student@hifzoon.test is not seeded — backend gap, see scripts/demo-data.ts:756',
    );
    await useCachedSession(page, request, 'student');
    await page.goto(PORTAL_FOR['student']);
    await waitForSessionCheck(page);
    await use(page);
  },
});

export { expect };