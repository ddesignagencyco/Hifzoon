import { describe, it, expect } from 'vitest';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { coursesAdminApi } from '@/lib/api/modules/courses-admin';
import { billingAdminApi } from '@/lib/api/modules/billing-admin';
import { payrollAdminApi } from '@/lib/api/modules/payroll-admin';
import { cmsAdminApi } from '@/lib/api/modules/cms-admin';
import { settingsApi } from '@/lib/api/modules/settings';
import { auditApi } from '@/lib/api/modules/audit';
import { ApiClientError } from '@/lib/api/http';

const ID = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';

describe('coursesAdminApi', () => {
  it('lists the catalogue for a locale', async () => {
    const api = mockApi({ 'GET /courses': { body: envelope([{ id: ID, code: 'HIFZ', levels: [] }]) } });
    const rows = await coursesAdminApi.list('ur');
    expect(api.calls[0].url).toContain('/courses?locale=ur');
    expect(rows[0].code).toBe('HIFZ');
  });

  it('fetches one course by id', async () => {
    const api = mockApi({ [`GET /courses/${ID}`]: { body: envelope({ id: ID, levels: [] }) } });
    const course = await coursesAdminApi.get(ID);
    expect(api.calls[0].method).toBe('GET');
    expect(course.id).toBe(ID);
  });

  it('creates a course with the DTO body', async () => {
    const api = mockApi({ 'POST /courses': { status: 201, body: envelope({ id: ID, code: 'X1', name: 'X', type: 'HIFZ' }) } });
    await coursesAdminApi.create({ code: 'X1', name: 'Xx', type: 'HIFZ', description: 'd', locale: 'en' });
    expect(api.calls[0].body).toEqual({ code: 'X1', name: 'Xx', type: 'HIFZ', description: 'd', locale: 'en' });
  });

  it('surfaces a duplicate-code conflict', async () => {
    mockApi({ 'POST /courses': apiError(409, 'CONFLICT', 'Course code "X1" is already in use') });
    await expect(coursesAdminApi.create({ code: 'X1', name: 'Xx', type: 'HIFZ', description: 'd' })).rejects.toThrow(
      'already in use',
    );
  });

  it('adds a level and a lesson under the right paths', async () => {
    const api = mockApi({
      [`POST /courses/${ID}/levels`]: { status: 201, body: envelope({ id: 'l1', name: 'L', position: 2 }) },
      'POST /courses/levels/l1/lessons': { status: 201, body: envelope({ id: 'les1', title: 'T', position: 1 }) },
    });
    const level = await coursesAdminApi.createLevel(ID, { name: 'Level', passMark: 80 });
    const lesson = await coursesAdminApi.createLesson(level.id, { title: 'Lesson', teacherNotes: 'n' });
    expect(api.calls[0].body).toEqual({ name: 'Level', passMark: 80 });
    expect(api.calls[1].body).toEqual({ title: 'Lesson', teacherNotes: 'n' });
    expect(lesson.position).toBe(1);
  });

  it('filters enrolments and drops empty filters', async () => {
    const api = mockApi({ 'GET /courses/enrolments/list': { body: envelope([]) } });
    await coursesAdminApi.listEnrolments({ status: 'PAUSED', studentId: '', teacherUserId: ' u1 ' });
    expect(api.calls[0].url).toContain('/courses/enrolments/list?teacherUserId=u1&status=PAUSED');
    expect(api.calls[0].url).not.toContain('studentId');
  });

  it('creates an enrolment, changes status and lesson position', async () => {
    const api = mockApi({
      'POST /courses/enrolments': { status: 201, body: envelope({ id: 'e1', status: 'TRIAL', course: { id: ID, code: 'HIFZ', name: 'Hifz' } }) },
      'PATCH /courses/enrolments/e1/status': { body: envelope({ id: 'e1', status: 'PAUSED', pausedUntil: null }) },
      'PATCH /courses/enrolments/e1/lesson-position': { body: envelope({ id: 'e1', currentLessonPosition: 3 }) },
    });
    await coursesAdminApi.createEnrolment({ studentId: 's1', courseId: ID, status: 'TRIAL' });
    await coursesAdminApi.updateEnrolmentStatus('e1', { status: 'PAUSED', reason: 'Holiday' });
    const pos = await coursesAdminApi.setLessonPosition('e1', 3);
    expect(api.calls[0].body).toEqual({ studentId: 's1', courseId: ID, status: 'TRIAL' });
    expect(api.calls[1]).toMatchObject({ method: 'PATCH', body: { status: 'PAUSED', reason: 'Holiday' } });
    expect(api.calls[2].body).toEqual({ position: 3 });
    expect(pos.currentLessonPosition).toBe(3);
  });
});

describe('billingAdminApi', () => {
  it('reads plans and links a plan to a teacher tier', async () => {
    const api = mockApi({
      'GET /billing/plans': { body: envelope([{ id: 'p1', tier: null }]) },
      'PATCH /billing/plans/p1/tier': { body: envelope({ id: 'p1', tierId: 't1' }) },
    });
    await billingAdminApi.plans();
    expect(api.calls[0].url).toMatch(/\/billing\/plans$/);
    await billingAdminApi.setPlanTier('p1', 't1');
    expect(api.calls[1]).toMatchObject({ method: 'PATCH', body: { tierId: 't1' } });
    await billingAdminApi.setPlanTier('p1', null);
    expect(api.calls[2].body).toEqual({ tierId: null });
  });

  it('issues an invoice with an Idempotency-Key header', async () => {
    const api = mockApi({ 'POST /admin/billing/invoices': { status: 201, body: envelope({ id: 'i1', number: 'INV-2026-ABCD1234' }) } });
    const invoice = await billingAdminApi.issueInvoice({ subscriptionId: ID, discountMinor: 500 }, 'key-1');
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('key-1');
    expect(api.calls[0].body).toEqual({ subscriptionId: ID, discountMinor: 500 });
    expect(invoice.number).toBe('INV-2026-ABCD1234');
  });

  it('refunds with an Idempotency-Key header and surfaces the refundable ceiling error', async () => {
    const api = mockApi({
      'POST /admin/billing/refunds': (call) =>
        (call.body as { amountMinor: number }).amountMinor > 3000
          ? apiError(400, 'BAD_REQUEST', 'Refund must be between 1 and 3000 minor units')
          : { status: 201, body: envelope({ id: 'r1', paymentId: ID, amountMinor: 1250 }) },
    });
    const refund = await billingAdminApi.refund({ paymentId: ID, amountMinor: 1250, reason: 'Duplicate charge' }, 'key-2');
    expect(refund.id).toBe('r1');
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('key-2');
    await expect(
      billingAdminApi.refund({ paymentId: ID, amountMinor: 9999, reason: 'Too much' }, 'key-3'),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it('runs dunning with an Idempotency-Key header', async () => {
    const api = mockApi({ 'POST /admin/billing/dunning/run': { body: envelope({ retried: 2, cancelled: 1 }) } });
    const result = await billingAdminApi.runDunning('key-4');
    expect(result).toEqual({ retried: 2, cancelled: 1 });
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('key-4');
  });

  it('maps a 403 to a permission message', async () => {
    mockApi({ 'POST /admin/billing/dunning/run': apiError(403, 'FORBIDDEN', 'Forbidden') });
    await expect(billingAdminApi.runDunning('k')).rejects.toMatchObject({ status: 403 });
  });
});

describe('payrollAdminApi', () => {
  it('reads rates, opens, calculates, reports and marks paid', async () => {
    const api = mockApi({
      'GET /payroll/rates': { body: envelope([{ id: 'r1', currency: 'GBP', ratePerClassMinor: 1200 }]) },
      'POST /payroll/periods': { status: 201, body: envelope({ id: 'p1', status: 'OPEN' }) },
      'POST /payroll/periods/p1/calculate': { body: envelope({ periodId: 'p1', teachers: 2, classesScanned: 9 }) },
      'GET /payroll/periods/p1/report': {
        body: envelope({ period: { id: 'p1', status: 'CALCULATED' }, totals: { gross: 2400, deductions: 0, bonuses: 0, net: 2400 }, entries: [] }),
      },
      'POST /payroll/entries/e1/paid': { body: envelope({ id: 'e1', status: 'PAID', payoutReference: 'TX-1' }) },
    });
    expect((await payrollAdminApi.rates())[0].ratePerClassMinor).toBe(1200);
    await payrollAdminApi.openPeriod({ startsOn: '2026-09-01', endsOn: '2026-09-30' });
    expect(api.calls[1].body).toEqual({ startsOn: '2026-09-01', endsOn: '2026-09-30' });
    expect((await payrollAdminApi.calculate('p1')).teachers).toBe(2);
    expect((await payrollAdminApi.report('p1')).totals.net).toBe(2400);
    await payrollAdminApi.markPaid('e1', 'TX-1');
    expect(api.calls[4].body).toEqual({ payoutReference: 'TX-1' });
  });

  it('surfaces the calculate-once conflict', async () => {
    mockApi({ 'POST /payroll/periods/p1/calculate': apiError(409, 'CONFLICT', 'Payroll period is CALCULATED; only an OPEN period can be calculated') });
    await expect(payrollAdminApi.calculate('p1')).rejects.toThrow('only an OPEN period');
  });
});

describe('cmsAdminApi', () => {
  it('lists posts with filters', async () => {
    const api = mockApi({ 'GET /content-admin': { body: envelope([]) } });
    await cmsAdminApi.list({ type: 'BLOG', status: '', locale: 'en' });
    expect(api.calls[0].url).toContain('/content-admin?type=BLOG&locale=en');
  });

  it('saves (create/update) and deletes a post', async () => {
    const api = mockApi({
      'POST /content-admin': (call) => ({ body: envelope({ id: 'c1', ...(call.body as object) }) }),
      'DELETE /content-admin/c1': { body: envelope({ id: 'c1', status: 'ARCHIVED', deletedAt: '2026-10-15T00:00:00Z' }) },
    });
    const post = await cmsAdminApi.save({ type: 'BLOG', slug: 'a-b', locale: 'en', title: 'T', body: 'B', status: 'DRAFT' });
    expect(post.slug).toBe('a-b');
    await cmsAdminApi.save({ id: 'c1', type: 'BLOG', slug: 'a-b', locale: 'en', title: 'T2', body: 'B', status: 'PUBLISHED' });
    expect(api.calls[1].body).toMatchObject({ id: 'c1', status: 'PUBLISHED' });
    const removed = await cmsAdminApi.remove('c1');
    expect(api.calls[2].method).toBe('DELETE');
    expect(removed.status).toBe('ARCHIVED');
  });

  it('reads the public FAQ and moderates an item', async () => {
    const api = mockApi({
      'GET /faq': { body: envelope([{ id: 'f1', approved: true }]) },
      'POST /faq-admin/f1/moderate': { body: envelope({ id: 'f1', approved: false }) },
    });
    await cmsAdminApi.publicFaq('ar');
    expect(api.calls[0].url).toContain('/faq?locale=ar');
    const item = await cmsAdminApi.moderateFaq('f1', false);
    expect(api.calls[1].body).toEqual({ approved: false });
    expect(item.approved).toBe(false);
  });
});

describe('settingsApi', () => {
  it('lists settings and patches only the given keys', async () => {
    const api = mockApi({
      'GET /admin/settings': { body: envelope([{ key: 'billing.invoice_due_days', type: 'number', value: 7 }]) },
      'PATCH /admin/settings': (call) => ({ body: envelope((call.body as { patch: object }).patch) }),
    });
    const rows = await settingsApi.list();
    expect(rows[0].value).toBe(7);
    const applied = await settingsApi.update({ 'billing.invoice_due_days': 10 });
    expect(api.calls[1].body).toEqual({ patch: { 'billing.invoice_due_days': 10 } });
    expect(applied).toEqual({ 'billing.invoice_due_days': 10 });
  });

  it('clears the Mushaf cache, optionally expired only', async () => {
    const api = mockApi({ 'DELETE /mushaf/cache': { body: envelope({ deleted: 4 }) } });
    expect((await settingsApi.clearMushafCache()).deleted).toBe(4);
    await settingsApi.clearMushafCache(true);
    expect(api.calls[0].url).toMatch(/\/mushaf\/cache$/);
    expect(api.calls[1].url).toContain('/mushaf/cache?expiredOnly=true');
  });
});

describe('auditApi', () => {
  it('passes filters and pagination and returns the items/total shape', async () => {
    const api = mockApi({
      'GET /admin/audit': { body: envelope({ items: [{ id: 'a1', action: 'bil.refund' }], total: 51, failedWrites: 0 }) },
    });
    const page = await auditApi.list({ action: 'bil.', targetType: 'refund', page: 2, limit: 25, from: '2026-10-01T00:00:00.000Z' });
    expect(api.calls[0].url).toContain('/admin/audit?action=bil.&targetType=refund&from=2026-10-01T00%3A00%3A00.000Z&page=2&limit=25');
    expect(page.total).toBe(51);
    expect(page.items[0].action).toBe('bil.refund');
  });
});
