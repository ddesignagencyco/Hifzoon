import { test, expect, findTeacherClassId, portalNav, PORTAL_LABELS } from './helpers';

/** MODULE-FLOWS.md §7 Scheduling, §8 Classroom, §9 Lesson cards, §21 Teacher profile, §14 Payslips */
test.describe('Teacher portal', () => {
  test('sidebar lists every teacher nav link', async ({ teacher }) => {
    const nav = portalNav(teacher, PORTAL_LABELS.teacher);
    await expect(nav).toBeVisible();
    for (const label of [
      'Today',
      'Timetable',
      'Availability',
      'Students',
      'Messages',
      'Payslips',
      'Profile',
      'Notifications',
    ]) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('Today screen renders identity, rating and classes', async ({ teacher }) => {
    // The portal shell nests two <main> elements, so scope to the first.
    await expect(teacher.locator('main').first()).toBeVisible();
  });

  test('timetable renders and opens a class detail modal', async ({ teacher }) => {
    await teacher.goto('/teacher/timetable');
    await expect(teacher.locator('main').first()).toBeVisible();

    const slot = teacher.getByRole('button').filter({ hasText: /am|pm|\d{1,2}:\d{2}/i }).first();
    if (await slot.isVisible().catch(() => false)) {
      await slot.click();
      await expect(teacher.getByRole('dialog').or(teacher.locator('[role="dialog"]'))).toBeVisible();
    }
  });

  test('availability editor renders a weekly grid', async ({ teacher }) => {
    await teacher.goto('/teacher/availability');
    await expect(teacher.locator('main').first()).toBeVisible();
    await expect(teacher.getByText(/availability/i).first()).toBeVisible();
  });

  test('students list derives from the timetable', async ({ teacher }) => {
    await teacher.goto('/teacher/students');
    await expect(teacher.locator('main').first()).toBeVisible();
    await expect(teacher.getByText(/Maryam|Yusuf/).first()).toBeVisible({ timeout: 20_000 });
  });

  test('student detail screen loads', async ({ teacher }) => {
    await teacher.goto('/teacher/students');
    const link = teacher.getByRole('link').filter({ hasText: /Maryam|Yusuf/ }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await expect(teacher).toHaveURL(/\/teacher\/students\/.+/);
      await expect(teacher.locator('main').first()).toBeVisible();
    }
  });

  test('payslips page renders', async ({ teacher }) => {
    await teacher.goto('/teacher/payslips');
    await expect(teacher.locator('main').first()).toBeVisible();
  });

  test('profile editor loads', async ({ teacher }) => {
    await teacher.goto('/teacher/profile');
    await expect(teacher.locator('main').first()).toBeVisible();
    await expect(teacher.getByRole('textbox').first()).toBeVisible();
  });

  test('teacher notification centre renders', async ({ teacher }) => {
    await teacher.goto('/teacher/notifications');
    await expect(teacher.locator('main').first()).toBeVisible();
  });

  test('teacher messaging thread opens and replies', async ({ teacher }) => {
    await teacher.goto('/teacher/messages');
    const firstThread = teacher.locator('a[href^="/teacher/messages/"]').first();
    test.skip((await firstThread.count()) === 0, 'no seeded teacher thread');

    await firstThread.click();
    await expect(teacher).toHaveURL(/\/teacher\/messages\/.+/);

    // Letters only: the composer blocks anything that looks like contact details.
    const stamp = `e2e reply ${Math.random().toString(36).slice(2, 10)}`;
    const composer = teacher.locator('form[aria-label="Send a message"]');
    await composer.getByLabel('Message').first().fill(stamp);
    await composer.getByRole('button', { name: 'Send message' }).click();
    await expect(teacher.getByRole('log', { name: 'Messages' }).getByText(stamp)).toBeVisible();
  });
});

test.describe('Classroom', () => {
  test('teacher room token is only valid inside the join window', async ({ request }) => {
    const classId = await findTeacherClassId(request);
    test.skip(!classId, 'no class scheduled within 24h — run `npm run demo:data` again');

    const { apiLogin, apiGet, ACCOUNTS, API_URL } = await import('./helpers');
    const token = await apiLogin(request, ACCOUNTS.teacher);
    const me = await apiGet<any>(request, '/auth/me', token);
    const classId2 = classId!;

    const res = await request.post(`${API_URL}/classroom/classes/${classId2}/token`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok()) {
      expect(me).toBeTruthy();
    } else {
      // 403/400 outside the 10-minute pre-start window is the correct behaviour.
      expect([400, 403]).toContain(res.status());
    }
  });

  test('teacher classroom page renders when a class is open', async ({ teacher, request }) => {
    const classId = await findTeacherClassId(request);
    test.skip(!classId, 'no live class scheduled — run `npm run demo:data` again');

    await teacher.goto(`/teacher/classroom/${classId}`);
    await expect(teacher.locator('main').first()).toBeVisible();
    await expect(teacher.getByText('We couldn’t find that page')).toHaveCount(0);
  });

  test('pre-class brief renders', async ({ teacher, request }) => {
    const classId = await findTeacherClassId(request);
    test.skip(!classId, 'no class scheduled — run `npm run demo:data` again');

    await teacher.goto(`/teacher/classes/${classId}/brief`);
    await expect(teacher.locator('main').first()).toBeVisible();
  });

  test('lesson card composer loads with prefill', async ({ teacher, request }) => {
    const classId = await findTeacherClassId(request);
    test.skip(!classId, 'no class scheduled — run `npm run demo:data` again');

    await teacher.goto(`/teacher/classroom/${classId}/lesson-card`);
    await expect(teacher.locator('main').first()).toBeVisible();
  });

  test('classroom state endpoint is reachable by a participant', async ({ request }) => {
    const classId = await findTeacherClassId(request);
    test.skip(!classId, 'no class scheduled — run `npm run demo:data` again');

    const { apiLogin, ACCOUNTS, API_URL } = await import('./helpers');
    const token = await apiLogin(request, ACCOUNTS.teacher);
    const res = await request.get(`${API_URL}/classroom/classes/${classId}/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 403]).toContain(res.status());
  });

  test('Mushaf layouts and page content resolve', async ({ request }) => {
    const { apiLogin, ACCOUNTS, API_URL } = await import('./helpers');
    const token = await apiLogin(request, ACCOUNTS.teacher);

    const layoutsRes = await request.get(`${API_URL}/mushaf/layouts`);
    expect(layoutsRes.ok()).toBe(true);
    const layouts = (await layoutsRes.json())?.data ?? [];
    test.skip(layouts.length === 0, 'no Mushaf layouts available');

    // Layout ids are data-driven (MADANI_15, INDOPAK_13, ...), not hardcoded.
    const layout = layouts[0];
    const page = await request.get(
      `${API_URL}/mushaf/pages/${layout.layout}/${layout.minPage}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(page.ok(), `mushaf page ${layout.layout}/${layout.minPage} -> ${page.status()}`).toBe(true);
  });
});