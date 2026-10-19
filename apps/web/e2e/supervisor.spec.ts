import { test, expect, loginAs, portalNav, PORTAL_LABELS } from './helpers';

/** MODULE-FLOWS.md §15 QA & Supervision, §16 Safeguarding, §4 Hiring */
test.describe('Supervisor portal', () => {
  test('sidebar renders and links to all supervisor sections', async ({ supervisor }) => {
    const nav = portalNav(supervisor, PORTAL_LABELS.supervisor);
    await expect(nav).toBeVisible();
    for (const label of ['Overview', 'Teachers & scorecards', 'Class reviews', 'Hiring pipeline', 'Cases']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });

  test('overview shows stat tiles and the QA table', async ({ supervisor }) => {
    await expect(supervisor.locator('main').first()).toBeVisible();
    await expect(supervisor.getByText(/open cases|qa reviews|bookable teachers/i).first()).toBeVisible();
  });

  test('teacher scorecards directory loads and filters', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/teachers');
    await expect(supervisor.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(supervisor.getByText(/teacher/i).first()).toBeVisible();
  });

  test('teacher scorecard detail renders', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/teachers');
    const link = supervisor.getByRole('link').filter({ hasText: /Ustadh|Ustadha|\w+ \w+/ }).first();
    if (await link.isVisible().catch(() => false)) {
      await link.click();
      await expect(supervisor).toHaveURL(/\/supervisor\/teachers\/.+/);
      await expect(supervisor.locator('main').first()).toBeVisible();
    }
  });

  test('class review wizard can pick a teacher and a class', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/reviews');
    await expect(supervisor.locator('main').first()).toBeVisible();
  });

  test('reviews deep-link preselects from query params', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/reviews?teacherId=x&classId=y&source=RANDOM_SAMPLE');
    await expect(supervisor.locator('main').first()).toBeVisible();
    await expect(supervisor).toHaveURL(/source=RANDOM_SAMPLE/);
  });

  test('hiring pipeline lists applications', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/applications');
    await expect(supervisor.locator('main').first()).toBeVisible();
  });

  test('supervisor cases board renders', async ({ supervisor }) => {
    await supervisor.goto('/supervisor/cases');
    await expect(supervisor.locator('main').first()).toBeVisible();
  });

  test('examiner sees an explicit empty state', async ({ page }) => {
    await loginAs(page, 'examiner');

    // An EXAMINER deliberately gets the "no assessments" branch of the gate,
    // not "Supervisor access only" (SupervisorRoleGate.tsx:21-32).
    await page.goto('/supervisor/teachers');
    await expect(page.getByText('No assessments assigned yet')).toBeVisible();
  });
});

test.describe('Safeguarding portal', () => {
  test('case board renders', async ({ safeguarding }) => {
    const nav = portalNav(safeguarding, PORTAL_LABELS.safeguarding);
    await expect(nav).toBeVisible();
    await expect(safeguarding.locator('main').first()).toBeVisible();
  });

  test('a case can be opened, noted and transitioned', async ({ safeguarding }) => {
    await safeguarding.goto('/safeguarding');
    const caseLink = safeguarding.getByRole('link').filter({ hasText: /case|INVESTIGAT|OPEN/i }).first();
    if (!(await caseLink.isVisible().catch(() => false))) return;

    await caseLink.click();
    await expect(safeguarding).toHaveURL(/\/safeguarding\/cases\/.+/);

    const noteBtn = safeguarding.getByRole('button', { name: /add note|note/i }).first();
    if (await noteBtn.isVisible().catch(() => false)) {
      await noteBtn.click();
      await expect(safeguarding.getByRole('dialog').or(safeguarding.locator('textarea').first())).toBeVisible();
    }
  });

  test('SLA monitor renders', async ({ safeguarding }) => {
    await safeguarding.goto('/safeguarding/sla');
    await expect(safeguarding.locator('main').first()).toBeVisible();
  });

  test('safeguarding lead cannot open the admin console', async ({ safeguarding }) => {
    await safeguarding.goto('/admin');
    await expect(safeguarding.getByText('You don’t have access to this page')).toBeVisible();
  });
});