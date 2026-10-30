import { describe, it, expect, afterAll } from 'vitest';
import { coursesAdminApi } from '@/lib/api/modules/courses-admin';
import { billingAdminApi } from '@/lib/api/modules/billing-admin';
import { payrollAdminApi } from '@/lib/api/modules/payroll-admin';
import { cmsAdminApi } from '@/lib/api/modules/cms-admin';
import { settingsApi } from '@/lib/api/modules/settings';
import { auditApi } from '@/lib/api/modules/audit';
import { newIdempotencyKey } from '@/lib/api/http';
import { actAs, actAsAnonymous, uniq } from '../helpers/live';

/** A UUID that matches no row, for exercising 404 paths without touching money. */
const MISSING = '00000000-0000-7000-8000-00000000ffff';

describe('live API — admin operations part 2 (courses, finance, content, system)', () => {
  afterAll(() => actAsAnonymous());

  describe('as ADMIN', () => {
    it('lists the catalogue and loads a course with its level → lesson tree', async () => {
      await actAs('admin');
      const courses = await coursesAdminApi.list('en');
      expect(courses.length).toBeGreaterThanOrEqual(10);
      const hifz = courses.find((c) => c.code === 'HIFZ');
      expect(hifz).toBeDefined();

      const detail = await coursesAdminApi.get(hifz!.id);
      expect(detail.code).toBe('HIFZ');
      expect(detail.levels.length).toBeGreaterThan(0);
      expect(Array.isArray(detail.levels[0].lessonTemplates)).toBe(true);
      expect(typeof detail.levels[0].passMark).toBe('number');
    });

    it('creates a throwaway course, level and lesson', async () => {
      await actAs('admin');
      const code = uniq('T').toUpperCase().slice(0, 40);
      const course = await coursesAdminApi.create({ code, name: 'Integration course', type: 'ARABIC', description: 'Created by tests' });
      expect(course.code).toBe(code);

      const level = await coursesAdminApi.createLevel(course.id, { name: 'Level one', passMark: 75 });
      expect(level.position).toBe(1);
      const lesson = await coursesAdminApi.createLesson(level.id, { title: 'First lesson', teacherNotes: 'Bring a mushaf' });
      expect(lesson.position).toBe(1);

      const detail = await coursesAdminApi.get(course.id);
      expect(detail.levels[0]).toMatchObject({ name: 'Level one', passMark: 75 });
      expect(detail.levels[0].lessonTemplates[0]).toMatchObject({ title: 'First lesson', teacherNotes: 'Bring a mushaf' });

      await expect(
        coursesAdminApi.create({ code, name: 'Duplicate', type: 'ARABIC', description: 'dup' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('lists enrolments with a status filter', async () => {
      await actAs('admin');
      const all = await coursesAdminApi.listEnrolments({});
      expect(Array.isArray(all)).toBe(true);
      const active = await coursesAdminApi.listEnrolments({ status: 'ACTIVE' });
      expect(active.every((e) => e.status === 'ACTIVE')).toBe(true);
    });

    it('reads settings but cannot change them', async () => {
      await actAs('admin');
      const settings = await settingsApi.list();
      expect(settings.length).toBeGreaterThanOrEqual(20);
      const due = settings.find((s) => s.key === 'billing.invoice_due_days');
      expect(due?.type).toBe('number');
      await expect(settingsApi.update({ 'billing.invoice_due_days': Number(due?.value ?? 7) })).rejects.toMatchObject({ status: 403 });
    });

    it('lists, creates and deletes a throwaway CMS post', async () => {
      await actAs('admin');
      const list = await cmsAdminApi.list({});
      expect(list.length).toBeGreaterThanOrEqual(5);
      expect(list.some((p) => p.status === 'DRAFT')).toBe(true);

      const slug = `it-${uniq('post')}`.toLowerCase();
      const post = await cmsAdminApi.save({ type: 'BLOG', slug, locale: 'en', title: 'Integration post', body: 'Body', status: 'DRAFT' });
      expect(post).toMatchObject({ slug, status: 'DRAFT', publishedAt: null });

      const updated = await cmsAdminApi.save({ id: post.id, type: 'BLOG', slug, locale: 'en', title: 'Integration post v2', body: 'Body', status: 'DRAFT' });
      expect(updated.title).toBe('Integration post v2');

      const removed = await cmsAdminApi.remove(post.id);
      expect(removed.status).toBe('ARCHIVED');
      expect(removed.deletedAt).not.toBeNull();

      await expect(
        cmsAdminApi.save({ type: 'BLOG', slug: 'Bad Slug', locale: 'en', title: 'x', body: 'y' }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('reads the published FAQ and 404s moderation of an unknown item', async () => {
      await actAs('admin');
      const faq = await cmsAdminApi.publicFaq('en');
      expect(faq.length).toBeGreaterThanOrEqual(1);
      expect(faq.every((f) => f.approved)).toBe(true);
      await expect(cmsAdminApi.moderateFaq(MISSING, true)).rejects.toMatchObject({ status: 404 });
    });

    it('reads plans and pay rates; billing ops 404 on unknown ids; dunning and audit are super-admin only', async () => {
      await actAs('admin');
      const plans = await billingAdminApi.plans();
      expect(plans.length).toBeGreaterThanOrEqual(3);
      expect(plans[0]).toHaveProperty('tier');

      const rates = await payrollAdminApi.rates();
      expect(rates.length).toBeGreaterThanOrEqual(2);

      await expect(billingAdminApi.issueInvoice({ subscriptionId: MISSING }, newIdempotencyKey())).rejects.toMatchObject({ status: 404 });
      await expect(
        billingAdminApi.refund({ paymentId: MISSING, amountMinor: 100, reason: 'Integration test' }, newIdempotencyKey()),
      ).rejects.toMatchObject({ status: 404 });
      await expect(billingAdminApi.runDunning(newIdempotencyKey())).rejects.toMatchObject({ status: 403 });
      await expect(auditApi.list({ page: 1, limit: 5 })).rejects.toMatchObject({ status: 403 });
      await expect(payrollAdminApi.openPeriod({ startsOn: '2091-01-01', endsOn: '2091-01-31' })).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('as SUPER_ADMIN', () => {
    it('reads audit page 1 with filters', async () => {
      await actAs('superAdmin');
      const page = await auditApi.list({ page: 1, limit: 10 });
      expect(page.items.length).toBeLessThanOrEqual(10);
      expect(typeof page.total).toBe('number');
      expect(typeof page.failedWrites).toBe('number');
      if (page.items.length > 0) expect(page.items[0]).toHaveProperty('action');

      const cms = await auditApi.list({ action: 'cms', page: 1, limit: 5 });
      expect(cms.items.every((i) => i.action.toLowerCase().includes('cms'))).toBe(true);
    });

    it('opens, calculates and reports a far-future payroll period (no classes, no money)', async () => {
      await actAs('superAdmin');
      const rates = await payrollAdminApi.rates();
      expect(rates.length).toBeGreaterThanOrEqual(2);

      // Unique far-future range: (startsOn, endsOn) is unique and nothing is scheduled there.
      const year = 2100 + Math.floor(Math.random() * 800);
      const day = String(1 + Math.floor(Math.random() * 27)).padStart(2, '0');
      const period = await payrollAdminApi.openPeriod({ startsOn: `${year}-03-${day}`, endsOn: `${year}-04-${day}` });
      expect(period.status).toBe('OPEN');

      const calc = await payrollAdminApi.calculate(period.id);
      expect(calc).toMatchObject({ periodId: period.id, teachers: 0, classesScanned: 0 });

      const report = await payrollAdminApi.report(period.id);
      expect(report.period.status).toBe('CALCULATED');
      expect(report.totals).toEqual({ gross: 0, deductions: 0, bonuses: 0, net: 0 });
      expect(report.entries).toEqual([]);

      await expect(payrollAdminApi.calculate(period.id)).rejects.toMatchObject({ status: 409 });
    });

    it('writes a no-op settings patch and purges only expired Mushaf cache entries', async () => {
      await actAs('superAdmin');
      const settings = await settingsApi.list();
      const due = settings.find((s) => s.key === 'billing.invoice_due_days');
      const applied = await settingsApi.update({ 'billing.invoice_due_days': Number(due?.value ?? 7) });
      expect(applied['billing.invoice_due_days']).toBe(Number(due?.value ?? 7));

      await expect(settingsApi.update({ 'billing.invoice_due_days': -1 })).rejects.toMatchObject({ status: 400 });

      const purge = await settingsApi.clearMushafCache(true);
      expect(typeof purge.deleted).toBe('number');
    });
  });
});
