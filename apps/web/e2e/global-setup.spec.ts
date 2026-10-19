import {
  test,
  expect,
  API_URL,
  ACCOUNTS,
  SEEDED_ACCOUNTS,
  OPTIONAL_ACCOUNTS,
  PASSWORD,
  accountExists,
  getTwoFactorSecret,
  readStoredSecret,
  STAFF_2FA_SECRETS,
} from './helpers';
import { totp } from './totp';

/**
 * Preconditions gate. Runs first (project "setup") and fails fast with an
 * actionable message if infra / seed / demo data are missing.
 */
// Ordered with test.describe.serial: the 2FA enrolment must run before the
// authentication gate, because enrolling changes how staff logins respond.
test.describe.serial('environment', () => {
  test('API is reachable and healthy', async ({ request }) => {
    const res = await request.get(`${API_URL}/health/ready`);
    expect(res.status(), 'is the API running on :4000?').toBe(200);
  });

  test('staff accounts can enrol 2FA (required by the API before use)', async ({ request }) => {
    // FR-AUTH-01: an unenrolled staff account gets 403 on everything except the
    // auth routes, so enrol them here or every staff test fails.
    for (const key of ['teacher', 'supervisor', 'admin', 'superAdmin', 'safeguarding', 'examiner'] as const) {
      const secret = await getTwoFactorSecret(request, key);
      if (secret) {
        STAFF_2FA_SECRETS[key] = secret;
        console.log(`  enrolled  ${ACCOUNTS[key]}`);
      }
    }
    expect(Object.keys(STAFF_2FA_SECRETS).length).toBeGreaterThan(0);
  });

  test('seeded accounts can authenticate', async ({ request }) => {
    for (const key of SEEDED_ACCOUNTS) {
      const email = ACCOUNTS[key];

      const res = await request.post(`${API_URL}/auth/login`, {
        data: { email, password: PASSWORD, deviceId: 'pw-setup' },
      });

      // A staff account with 2FA enrolled answers 401 TWO_FACTOR_REQUIRED on the
      // password step; complete the challenge and that becomes a success.
      if (res.status() === 401) {
        const code = (await res.json())?.code;
        if (code !== 'TWO_FACTOR_REQUIRED') {
          throw new Error(`Login failed for ${email} (${res.status()} ${code}). Run: npm run db:seed`);
        }
        const secret = readStoredSecret(key);
        if (!secret) {
          throw new Error(`${email} needs a 2FA code but no secret is stored in e2e/.auth/`);
        }
        const step2 = await request.post(`${API_URL}/auth/login`, {
          data: {
            email,
            password: PASSWORD,
            twoFactorCode: totp(secret),
            deviceId: 'pw-setup',
          },
        });
        if (!step2.ok()) {
          throw new Error(
            `${email} passed the password step but failed the 2FA challenge (${step2.status()}). ` +
              'The stored TOTP secret may have drifted — delete e2e/.auth/two-factor.json and re-run.',
          );
        }
        continue;
      }

      if (!res.ok()) {
        throw new Error(
          `Login failed for ${email} (${res.status()}).\n` +
            `Did you run: npm run db:seed  and  cd apps/web && npm run demo:data ?`,
        );
      }
    }
  });

  test('optional accounts are reported but not required', async ({ request }) => {
    for (const key of OPTIONAL_ACCOUNTS) {
      const ok = await accountExists(request, key);
      console.log(`  ${ok ? 'present ' : 'absent  '} ${ACCOUNTS[key]}`);
    }
  });

  test('demo data is present', async ({ request }) => {
    const courses = await request.get(`${API_URL}/courses`);
    expect(courses.ok(), 'no courses seeded').toBe(true);
    const body = await courses.json();
    const rows = body?.data ?? body;
    expect(Array.isArray(rows) ? rows.length : 0, 'run `npm run demo:data` in apps/web').toBeGreaterThan(0);
  });

  test('web app responds', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});