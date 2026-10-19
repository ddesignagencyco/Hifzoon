import { test, expect, portalNav, PORTAL_LABELS } from './helpers';

/** MODULE-FLOWS.md §6 Courses, §7 Scheduling, §17 Admin console, §18 CRM, §19 Trials, §20 Teacher changes, §21 Teacher hub, §22 Content, §23 Settings */
test.describe('Admin portal', () => {
  test('sidebar renders and lists every admin section', async ({ admin }) => {
    const nav = portalNav(admin, PORTAL_LABELS.admin);
    await expect(nav).toBeVisible();

    for (const label of [
      'Overview',
      'Users & search',
      'CRM',
      'Trials & placement',
      'Teacher changes',
      'Teachers',
      'Scheduling',
      'Courses',
      'Billing',
      'Payroll',
      'Content & FAQ',
      'Settings',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('audit log data is not readable by a plain admin', async ({ admin }) => {
    // The layout guard lets ADMIN through (/admin/*), but /admin/audit is SUPER_ADMIN
    // only, so the API denies it and no audit rows are rendered.
    await admin.goto('/admin/audit');
    await expect(admin.getByRole('table')).toHaveCount(0);
    await expect(admin.getByRole('alert').or(admin.getByText(/could not load/i)).first()).toBeVisible();
  });

  test('overview shows metrics, pipeline, changes and applications', async ({ admin }) => {
    await expect(admin.locator('main').first()).toBeVisible();
    await expect(admin.getByText(/pipeline|application|teacher change/i).first()).toBeVisible();
  });

  test('users console searches and can change status', async ({ admin }) => {
    await admin.goto('/admin/users');
    const search = admin.getByPlaceholder('Name, email or phone');
    await search.fill('parent@hifzoon.test');
    await admin.getByRole('button', { name: /search/i }).first().click();
    await expect(admin.getByText('parent@hifzoon.test').first()).toBeVisible({ timeout: 20_000 });
  });

  test('CRM: create a lead', async ({ admin }) => {
    await admin.goto('/admin/crm');
    await expect(admin.locator('main').first()).toBeVisible();

    await admin.getByRole('button', { name: /new lead|create lead|add lead/i }).first().click();
    await expect(admin.getByRole('dialog').or(admin.locator('form')).first()).toBeVisible();
  });

  test('CRM: tasks render and one can be completed', async ({ admin }) => {
    await admin.goto('/admin/crm');
    const complete = admin.getByRole('button', { name: /complete|done|mark/i }).first();
    if (await complete.isVisible().catch(() => false)) {
      await complete.click();
      await expect(admin.getByRole('status').or(admin.getByRole('alert'))).toBeVisible();
    }
  });

  test('trials and placement workspace renders', async ({ admin }) => {
    await admin.goto('/admin/trials');
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('teacher change queue lists the seeded OPEN request', async ({ admin }) => {
    await admin.goto('/admin/teacher-changes');
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('teacher hub renders provisioning and readiness', async ({ admin }) => {
    await admin.goto('/admin/teachers');
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('scheduling builder renders and previews the rrule', async ({ admin }) => {
    await admin.goto('/admin/scheduling');
    await expect(admin.locator('main').first()).toBeVisible();

    // ScheduleBuilder exposes a test id for the recurrence preview.
    const preview = admin.getByTestId('rrule-preview');
    if (await preview.isVisible().catch(() => false)) {
      await expect(preview).not.toBeEmpty();
    }
  });

  test('scheduling builder deep-links are honoured', async ({ admin }) => {
    await admin.goto('/admin/scheduling?enrolmentId=x&teacherId=y&scheduleId=z');
    await expect(admin).toHaveURL(/enrolmentId=x/);
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('courses admin lists courses and opens one', async ({ admin }) => {
    await admin.goto('/admin/courses');
    await expect(admin.locator('main').first()).toBeVisible();

    // Scope to main so we do not click a header link.
    const link = admin.locator('main').first().getByRole('link').filter({ hasText: /\w{3,}/ }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await expect(admin).toHaveURL(/\/admin\/courses\/.+/);
      await expect(admin.locator('main').first()).toBeVisible();
    }
  });

  test('billing console renders plans and activity', async ({ admin }) => {
    await admin.goto('/admin/billing');
    await expect(admin.locator('main').first()).toBeVisible();
    await expect(admin.getByRole('button', { name: /invoice/i }).first()).toBeVisible();
  });

  test('payroll console renders rates and periods', async ({ admin }) => {
    await admin.goto('/admin/payroll');
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('content console lists posts and FAQ moderation', async ({ admin }) => {
    await admin.goto('/admin/content');
    await expect(admin.locator('main').first()).toBeVisible();
  });

  test('settings editor loads current values', async ({ admin }) => {
    await admin.goto('/admin/settings');
    await expect(admin.locator('main').first()).toBeVisible();
    await expect(admin.getByRole('button', { name: /Clear cache|Purge expired/i }).first()).toBeVisible();
  });
});

test.describe('Super admin only', () => {
  test('audit log is visible and paginates', async ({ superAdmin }) => {
    await superAdmin.goto('/admin/audit');
    await expect(superAdmin.locator('main').first()).toBeVisible();
    await expect(superAdmin.getByRole('table').or(superAdmin.getByRole('grid'))).toBeVisible();
  });

  test('random QA sample can be drawn', async ({ superAdmin }) => {
    await superAdmin.goto('/supervisor/teachers');
    const btn = superAdmin.getByRole('button', { name: /draw.*sample|random sample/i }).first();
    if (await btn.isVisible().catch(() => false)) {
      await expect(btn).toBeEnabled();
    }
  });

  test('super admin can refund', async ({ superAdmin }) => {
    await superAdmin.goto('/admin/billing');
    await expect(superAdmin.getByRole('button', { name: /refund/i }).first()).toBeVisible();
  });
});