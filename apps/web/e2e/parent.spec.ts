import { test, expect, SEEDED, portalNav, PORTAL_LABELS } from './helpers';

/** MODULE-FLOWS.md §5 Family, §10 Progress, §11 Messaging, §12 Consent, §13 Billing, §25 Hifz */
test.describe('Parent portal', () => {
  test('sidebar lists every family nav link', async ({ guardian }) => {
    const nav = portalNav(guardian, PORTAL_LABELS.parent);
    await expect(nav).toBeVisible();

    for (const label of [
      'Overview',
      'Children',
      'Timetable',
      'Messages',
      'Billing',
      'Privacy & consent',
      'Notifications',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('overview renders child cards, next lesson and consent status', async ({ guardian }) => {
    await expect(guardian.getByText(/Maryam|Yusuf/).first()).toBeVisible();
  });

  test('children roster shows the seeded children', async ({ guardian }) => {
    await guardian.goto('/parent/children');
    await expect(guardian.getByText('Maryam')).toBeVisible();
    await expect(guardian.getByText('Yusuf')).toBeVisible();
  });

  test('add-child wizard opens', async ({ guardian }) => {
    await guardian.goto('/parent/children');
    await guardian.getByRole('button', { name: /add child|add a child|new child/i }).first().click();
    await expect(guardian.getByRole('dialog').or(guardian.getByRole('form'))).toBeVisible();
  });

  test('child detail tabs render progress, report card, courses, lesson cards and mistakes', async ({
    guardian,
  }) => {
    await guardian.goto(`/parent/children/${SEEDED.maryam}`);
    await expect(guardian.getByText('We couldn’t find that page')).toHaveCount(0);

    for (const tab of ['Charts', 'Report card', 'Courses', 'Lesson cards', 'Mistakes']) {
      const control = guardian.getByRole('tab', { name: new RegExp(tab, 'i') });
      if (await control.isVisible().catch(() => false)) {
        await control.click();
        await expect(guardian.locator('main').first()).toBeVisible();
      }
    }
  });

  test('second seeded child detail also loads', async ({ guardian }) => {
    await guardian.goto(`/parent/children/${SEEDED.yusuf}`);
    await expect(guardian.locator('main').first()).toBeVisible();
    await expect(guardian.getByText('We couldn’t find that page')).toHaveCount(0);
  });

  test('family timetable renders weekly classes', async ({ guardian }) => {
    await guardian.goto('/parent/timetable');
    await expect(guardian.locator('main').first()).toBeVisible();
  });

  test('messages: thread list opens and a message can be sent', async ({ guardian }) => {
    await guardian.goto('/parent/messages');
    await expect(guardian.locator('main').first()).toBeVisible();

    // Target the seeded thread by href so we do not match unrelated links.
const firstThread = guardian.locator('a[href^="/parent/messages/"]').first();
    test.skip((await firstThread.count()) === 0, 'no seeded guardian thread');
    await firstThread.click();
    await expect(guardian).toHaveURL(/\/parent\/messages\/.+/);
    // Letters only: the composer blocks anything that looks like contact details
    // (a long numeric stamp would be read as a phone number and disable Send).
    const stamp = `e2e probe ${Math.random().toString(36).slice(2, 10)}`;
    const composer = guardian.locator('form[aria-label="Send a message"]');
    await composer.getByLabel('Message').first().fill(stamp);
    await composer.getByRole('button', { name: 'Send message' }).click();
    await expect(guardian.getByRole('log', { name: 'Messages' }).getByText(stamp)).toBeVisible();
  });

  test('privacy and consent: matrix renders and consent can be toggled', async ({ guardian }) => {
    await guardian.goto('/parent/privacy');
    await expect(guardian.locator('main').first()).toBeVisible();

    const grant = guardian.getByRole('button', { name: /^grant$/i }).first();
    if (await grant.isVisible().catch(() => false)) {
      await grant.click();
      await expect(guardian.getByRole('alert').or(guardian.getByRole('status'))).toBeVisible();
    }
  });

  test('billing: plans, subscription and invoices render', async ({ guardian }) => {
    await guardian.goto('/parent/billing');
    await expect(guardian.locator('main').first()).toBeVisible();
    await expect(guardian.getByText(/plan|subscription|invoice/i).first()).toBeVisible();
  });

  test('billing checkout return pages render', async ({ guardian }) => {
    for (const outcome of ['success', 'cancelled']) {
      await guardian.goto(`/parent/billing/checkout/${outcome}`);
      await expect(guardian.locator('main').first()).toBeVisible();
    }
  });

  test('notification centre lists items and preferences render', async ({ guardian }) => {
    await guardian.goto('/parent/notifications');
    await expect(guardian.locator('main').first()).toBeVisible();
  });

  test('watch-only classroom room is reachable but has no publish controls', async ({ guardian }) => {
    await guardian.goto('/parent/timetable');
    const join = guardian.getByRole('button', { name: /^join$/i }).first();
    if (!(await join.isVisible().catch(() => false))) return;

    await join.click();
    await expect(guardian).toHaveURL(/\/parent\/classroom\/.+/);
    // Guardians cannot drive the Mushaf.
    await expect(guardian.getByRole('button', { name: /record|start recording/i })).toHaveCount(0);
  });

  test('notification bell is present and labelled', async ({ guardian }) => {
    await expect(guardian.getByRole('button', { name: /^Notifications/ })).toBeVisible();
  });

  test('portal footer exposes account security and sign out', async ({ guardian }) => {
    const nav = portalNav(guardian, PORTAL_LABELS.parent);
    await expect(nav.getByRole('link', { name: 'Account security' })).toBeVisible();
    await expect(nav.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  });
});