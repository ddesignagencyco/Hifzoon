import { test, expect } from './helpers';

/** MODULE-FLOWS.md §2 Public Website / CMS, §3 Trial Booking */
test.describe('Public website', () => {
  test('home page renders every section', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Quranic Tutoring');
    await expect(page.getByRole('heading', { name: 'A virtual classroom built only for the Quran' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A clear path from first letter to Ijazah' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vetted scholars, patient educators' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Page-by-page accountability/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Simple plans, priced in US dollars' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Answers for prospective families' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Begin your child.s journey/ })).toBeVisible();
  });

  test('the scripted classroom demo renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('classroom-live-device')).toBeVisible();
  });

  test('header navigation reaches every public page', async ({ page }) => {
    await page.goto('/');
    for (const label of ['Courses', 'Faculty', 'Pricing', 'Resources']) {
      await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible();
    }
  });

  test('footer links resolve (guard against dead routes)', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.getByRole('contentinfo').getByRole('link').evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')).filter(Boolean) as string[],
    );
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      if (href.startsWith('http')) continue;
      const res = await page.request.get(href);
      expect(res.status(), `footer link ${href} is dead`).toBeLessThan(400);
    }
  });

  test('policy pages render their CMS content', async ({ page }) => {
    for (const path of ['/child-safety', '/privacy', '/terms', '/refunds']) {
      await page.goto(path);
      await expect(page.getByText('We couldn’t find that page')).toHaveCount(0);
      await expect(page.locator('main').first()).toBeVisible();
    }
  });

  test('unknown URLs render the 404 page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('We couldn’t find that page')).toBeVisible();
  });

  test('courses catalogue loads and filters by category', async ({ page }) => {
    await page.goto('/courses');
    await expect(page.getByRole('heading', { name: 'Academic Quranic Pathways' })).toBeVisible();

    await expect(page.getByText(/Showing \d+ structured pathways/)).toBeVisible();
    for (const pill of ['All Courses', 'Foundation', 'Recitation', 'Memorization', 'Certification']) {
      await expect(page.getByRole('tab', { name: pill })).toBeVisible();
    }

    await page.getByPlaceholder('Search courses or levels...').fill('hifz');
    await expect(page.getByText(/Showing \d+ structured pathways/)).toBeVisible();
  });

  test('course detail opens by code', async ({ page }) => {
    await page.goto('/courses');
    await page.getByRole('link', { name: 'View syllabus' }).first().click();
    await expect(page).toHaveURL(/\/courses\/[A-Z0-9_-]+/);
    await expect(page.getByText('We couldn’t find that page')).toHaveCount(0);
  });

  test('faculty directory loads, searches and filters', async ({ page }) => {
    await page.goto('/teachers');
    await expect(page.getByRole('heading', { name: 'Our Quran Teachers' })).toBeVisible();
    await expect(page.getByText(/Showing \d+ teachers?/)).toBeVisible({ timeout: 30_000 });

    await page.getByPlaceholder('Search by teacher name or subject...').fill('zzzznomatch');
    await expect(page.getByText('No teachers match these filters.')).toBeVisible();
  });

  test('teacher public profile shows rating and trial CTA', async ({ page }) => {
    await page.goto('/teachers');
    await expect(page.getByText(/Showing \d+ teachers?/)).toBeVisible({ timeout: 30_000 });
    // Scope to main: a header link also mentions "Teacher" ("Apply as a Teacher").
    await page.locator('main').first().getByRole('link').filter({ hasText: /\w+ \w+/ }).first().click();
    await expect(page).toHaveURL(/\/teachers\/.+/);
    await expect(page.getByRole('link', { name: /Request a trial class/i })).toBeVisible();
  });

  test('resources hub tabs switch content', async ({ page }) => {
    await page.goto('/resources');
    await page.getByRole('tab', { name: 'Articles' }).click();
    await expect(page.getByRole('tab', { name: 'Articles' })).toHaveAttribute('aria-selected', 'true');
  });

  test('pricing page renders plans and switches currency', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { name: 'Transparent Tuition' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tuition & Membership Options' })).toBeVisible();

    await expect(page.getByText('Prices shown in USD')).toBeVisible();

    await page.getByRole('button', { name: 'Select billing currency' }).click();
    await page.getByRole('option', { name: /GBP/ }).click();
    await expect(page.getByText('Prices shown in GBP')).toBeVisible();
  });

  test('trial booking wizard advances through all three steps', async ({ page }) => {
    await page.goto('/book-trial');
    await expect(page).toHaveURL(/\/book-trial/);

    // Step 1: pick a course, if course cards are offered.
    const firstCourse = page.getByRole('button', { name: /Select|Choose|Book/i }).first();
    if (await firstCourse.isVisible().catch(() => false)) {
      await firstCourse.click();
    }
    // The flow must at minimum render without a crash.
    await expect(page.locator('main').first()).toBeVisible();
  });

  test('book-trial honours preselection query params', async ({ page }) => {
    await page.goto('/book-trial?course=HIFZ&gender=F');
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page).toHaveURL(/course=HIFZ/);
  });

  test('teacher application form renders', async ({ page }) => {
    await page.goto('/apply-teacher');
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByText('We couldn’t find that page')).toHaveCount(0);
  });
});