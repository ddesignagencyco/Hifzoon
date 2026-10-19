import { describe, it, expect, afterAll } from 'vitest';
import { fetchCourses, fetchPlans, fetchFaqs, fetchCurrentUser, getDefaultRouteForRole } from '@/lib/api/client';
import { notificationsApi } from '@/lib/api/modules/notifications';
import { actAs, actAsAnonymous, SEED } from '../helpers/live';

/** Smoke test of the shared client against the live, seeded API. */
describe('live API — foundation', () => {
  afterAll(() => actAsAnonymous());

  it('serves the seeded public catalogue (10 courses, 3 plans, approved FAQs)', async () => {
    actAsAnonymous();
    const [courses, plans, faqs] = await Promise.all([fetchCourses(), fetchPlans(), fetchFaqs()]);
    expect(courses.length).toBeGreaterThanOrEqual(10);
    expect(courses.some((c) => c.code === 'HIFZ')).toBe(true);
    expect(plans.length).toBeGreaterThanOrEqual(3);
    expect(faqs.length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['guardian', '/parent'],
    ['teacher', '/teacher'],
    ['admin', '/admin'],
    ['superAdmin', '/admin'],
    ['supervisor', '/supervisor'],
    ['safeguarding', '/safeguarding'],
  ] as const)('%s lands on %s', async (account, route) => {
    await actAs(account);
    const me = await fetchCurrentUser();
    expect(me?.email).toBe(SEED.accounts[account]);
    expect(getDefaultRouteForRole(me?.roles)).toBe(route);
  });

  it('returns the notification inbox and preferences for the guardian', async () => {
    await actAs('guardian');
    const [page, prefs] = await Promise.all([notificationsApi.list({ page: 1, limit: 5 }), notificationsApi.preferences()]);
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.meta.page).toBe(1);
    expect(typeof prefs.email).toBe('boolean');
  });
});
