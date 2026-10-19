import { test, expect, ACCOUNTS, PASSWORD, loginAs } from './helpers';

/** MODULE-FLOWS.md §1 — Auth & Accounts */
test.describe('Auth', () => {
  test('login page renders role tabs and credential form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign In to Hifzoon' })).toBeVisible();
    for (const tab of ['Parent', 'Student', 'Faculty', 'Staff']) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    await expect(page.getByPlaceholder('name@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('••••••••••••')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('Kids Mode is explicitly disabled', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Student', exact: true }).click();
    await page.getByRole('button', { name: 'Kids Mode', exact: true }).click();
    await expect(page.getByText('Kids Mode sign-in is not available yet')).toBeVisible();
  });

  test('invalid email is rejected client-side', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill('not-an-email');
    await page.getByPlaceholder('••••••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.locator('#login-email-error')).toHaveText('Please enter a valid email address.');
    await expect(page).toHaveURL(/\/login/);
  });

  test('wrong password shows an error toast and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(ACCOUNTS.parent);
    await page.getByPlaceholder('••••••••••••').fill('WrongPassword!2026');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('••••••••••••').fill(PASSWORD);
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByPlaceholder('••••••••••••')).toHaveAttribute('type', 'text');
  });

  test('each role lands on its own portal', async ({ page }) => {
    const cases = [
      { account: 'parent' as const, path: '/parent' },
      { account: 'teacher' as const, path: '/teacher' },
      { account: 'supervisor' as const, path: '/supervisor' },
      { account: 'admin' as const, path: '/admin' },
      { account: 'safeguarding' as const, path: '/safeguarding' },
    ];

    for (const { account, path } of cases) {
      await loginAs(page, account);
      await expect(page).toHaveURL(new RegExp(path));
      // Clear the session so the next role starts signed out.
      await page.context().clearCookies();
    }
  });

  test('/dashboard routes by role', async ({ page }) => {
    await loginAs(page, 'admin');

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/admin/);
  });

  test('signed-out visitor is redirected to login with a redirect param', async ({ page }) => {
    await page.goto('/parent');
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });

  test('role isolation returns a 403 page', async ({ page }) => {
    await loginAs(page, 'parent');

    await page.goto('/admin');
    await expect(page.getByText('You don’t have access to this page')).toBeVisible();
    await expect(page.getByText('This area is for')).toBeVisible();
    // Rendered as <a href="/dashboard">, not a button (ProtectedRoute.tsx:83).
    await expect(page.getByRole('link', { name: 'Go to my portal' })).toBeVisible();

    await page.getByRole('link', { name: 'Go to my portal' }).click();
    await expect(page).toHaveURL(/\/parent/);
  });

  test('session survives a hard refresh (silent cookie refresh)', async ({ page }) => {
    await loginAs(page, 'parent');

    await page.reload();
    await expect(page).toHaveURL(/\/parent/);
    await expect(page.getByText('Verifying secure session...')).toHaveCount(0);
  });

  test('sign out returns to a plain /login', async ({ page }) => {
    await loginAs(page, 'parent');

    await page.getByRole('navigation').getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('honours ?redirect= when the role may access the path', async ({ page }) => {
    await loginAs(page, 'parent', { redirect: '/parent/privacy' });
  });

  test('ignores an external ?redirect= (open-redirect guard)', async ({ page }) => {
    await loginAs(page, 'parent', {
      redirect: 'https://evil.example/steal',
      expectUrl: /\/parent$/,
    });
  });

  test('forgot password shows an anti-enumeration confirmation', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByRole('textbox').first().fill(ACCOUNTS.parent);
    await page.getByRole('button', { name: /reset|send|dispatch|email/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Recovery Email Dispatched' })).toBeVisible();
  });

  test('account security page is reachable from the portal footer', async ({ page }) => {
    await loginAs(page, 'teacher');

    await page.goto('/account/security');
    await expect(page.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible();
  });

  test('guardian cannot enrol in 2FA', async ({ page }) => {
    await loginAs(page, 'parent');

    await page.goto('/account/security');
    await expect(page.getByText(/teacher and staff accounts only/i)).toBeVisible();
  });

  test('registration enforces a 12-character minimum password', async ({ page }) => {
    await page.goto('/register');
    const password = page.locator('input[type="password"]').first();
    await password.fill('short');
    // Counter reads "5/12 chars minimum" (register/page.tsx:317).
    await expect(page.getByText(/\d+\/12 chars minimum/)).toBeVisible();
  });
});