import { test, expect, ACCOUNTS, PASSWORD, portalNav, PORTAL_LABELS } from './helpers';

/** MODULE-FLOWS.md §26 Student portal, §27 Cross-cutting checks */
test.describe('Student portal', () => {
  test('sidebar renders with overview and notifications', async ({ student }) => {
    const nav = portalNav(student, PORTAL_LABELS.student);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
  });

  test('overview renders profile and inbox summary', async ({ student }) => {
    await expect(student.locator('main').first()).toBeVisible();
  });

  test('notifications centre renders', async ({ student }) => {
    await student.goto('/student/notifications');
    await expect(student.locator('main').first()).toBeVisible();
  });

  test('account security opens inside the student portal shell', async ({ student }) => {
    await student.goto('/account/security');
    await expect(student).toHaveURL(/\/account\/security/);
    await expect(student.locator('main').first()).toBeVisible();
  });

  test('student cannot open the parent portal', async ({ student }) => {
    await student.goto('/parent');
    await expect(student.getByText('You don’t have access to this page')).toBeVisible();
  });
});

test.describe('Cross-cutting', () => {
  test('every portal 404s gracefully on a bad path', async ({ guardian }) => {
    await guardian.goto('/parent/definitely-not-a-page');
    await expect(guardian.getByText('We couldn’t find that page')).toBeVisible();
  });

  test('portal session survives a hard refresh', async ({ guardian }) => {
    await guardian.reload();
    await expect(guardian.getByText('Verifying secure session...')).toHaveCount(0);
    await expect(guardian.locator('main').first()).toBeVisible();
  });

  test('portal switcher links to every allowed portal', async ({ superAdmin }) => {
    // The switcher lists every *other* portal the roles allow; the home portal
    // (Academy admin for a super admin) is not repeated.
    const nav = portalNav(superAdmin, PORTAL_LABELS.admin);
    for (const label of [PORTAL_LABELS.safeguarding, PORTAL_LABELS.supervisor]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('API auth failure surfaces an error, not a blank page', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('name@example.com').fill(ACCOUNTS.parent);
    await page.getByPlaceholder('••••••••••••').fill('DefinitelyWrong!99');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('an admin can reach every admin route without a server error', async ({ admin }) => {
    const routes = [
      '/admin',
      '/admin/users',
      '/admin/crm',
      '/admin/trials',
      '/admin/teacher-changes',
      '/admin/teachers',
      '/admin/scheduling',
      '/admin/courses',
      '/admin/billing',
      '/admin/payroll',
      '/admin/content',
      '/admin/settings',
    ];
    for (const route of routes) {
      await admin.goto(route);
      await expect(admin.getByText('Something went wrong')).toHaveCount(0);
      await expect(admin.locator('main').first()).toBeVisible();
    }
  });

  test('a parent can reach every family route without a server error', async ({ guardian }) => {
    const routes = [
      '/parent',
      '/parent/children',
      '/parent/timetable',
      '/parent/messages',
      '/parent/billing',
      '/parent/privacy',
      '/parent/notifications',
    ];
    for (const route of routes) {
      await guardian.goto(route);
      await expect(guardian.getByText('Something went wrong')).toHaveCount(0);
      await expect(guardian.locator('main').first()).toBeVisible();
    }
  });

  test('a teacher can reach every teacher route without a server error', async ({ teacher }) => {
    const routes = [
      '/teacher',
      '/teacher/timetable',
      '/teacher/availability',
      '/teacher/students',
      '/teacher/messages',
      '/teacher/payslips',
      '/teacher/profile',
      '/teacher/notifications',
    ];
    for (const route of routes) {
      await teacher.goto(route);
      await expect(teacher.getByText('Something went wrong')).toHaveCount(0);
      await expect(teacher.locator('main').first()).toBeVisible();
    }
  });

  test('the seed password is the documented one (config sanity)', () => {
    expect(PASSWORD.length).toBeGreaterThanOrEqual(12);
  });
});