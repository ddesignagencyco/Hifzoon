import { describe, it, expect } from 'vitest';
import { parseMajorToMinor, validateInvoice, validateRefund } from '@/lib/api/modules/billing-admin';
import { validatePeriod, validatePayoutReference, formatPeriodDate } from '@/lib/api/modules/payroll-admin';
import { slugify, validatePost } from '@/lib/api/modules/cms-admin';
import { diffSettings, groupSettings, settingLabel,
  groupKnownSettings, toDraft, SettingDescriptor } from '@/lib/api/modules/settings';
import { totalPages, validateAuditFilters } from '@/lib/api/modules/audit';
import { isUuid, objectivesToLines, validateCourse, validateLesson, validateLevel } from '@/lib/api/modules/courses-admin';

const UUID = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';

describe('money parsing', () => {
  it('parses major units into integer minor units without float error', () => {
    expect(parseMajorToMinor('12')).toBe(1200);
    expect(parseMajorToMinor('12.5')).toBe(1250);
    expect(parseMajorToMinor('0.29')).toBe(29);
    expect(parseMajorToMinor('1,234.56')).toBe(123456);
    expect(parseMajorToMinor('12.345')).toBeNull();
    expect(parseMajorToMinor('-1')).toBeNull();
    expect(parseMajorToMinor('abc')).toBeNull();
  });
});

describe('billing validation', () => {
  it('validates the invoice form', () => {
    expect(validateInvoice({ subscriptionId: 'nope', discount: '' }).errors.subscriptionId).toMatch(/UUID/);
    expect(validateInvoice({ subscriptionId: UUID, discount: 'x' }).errors.discount).toBeDefined();
    expect(validateInvoice({ subscriptionId: UUID, discount: '' }).body).toEqual({ subscriptionId: UUID });
    expect(validateInvoice({ subscriptionId: UUID, discount: '5' }).body).toEqual({ subscriptionId: UUID, discountMinor: 500 });
  });

  it('validates the refund form incl. the optional ceiling', () => {
    expect(validateRefund({ paymentId: UUID, amount: '0', reason: 'abc' }).errors.amount).toMatch(/greater than zero/);
    expect(validateRefund({ paymentId: UUID, amount: '10', reason: 'ab' }).errors.reason).toMatch(/at least 3/);
    expect(validateRefund({ paymentId: UUID, amount: '31', reason: 'abc', maxRefundable: '30' }).errors.amount).toMatch(/exceed/);
    expect(validateRefund({ paymentId: UUID, amount: '30', reason: 'abc', maxRefundable: '30' }).body).toEqual({
      paymentId: UUID,
      amountMinor: 3000,
      reason: 'abc',
    });
  });
});

describe('payroll validation', () => {
  it('requires an end after the start', () => {
    expect(validatePeriod('2026-09-30', '2026-09-01').endsOn).toMatch(/after/);
    expect(validatePeriod('', '2026-09-01').startsOn).toBeDefined();
    expect(validatePeriod('2026-09-01', '2026-09-30')).toEqual({});
  });
  it('validates payout references', () => {
    expect(validatePayoutReference(' ')).toBeTruthy();
    expect(validatePayoutReference('x'.repeat(121))).toBeTruthy();
    expect(validatePayoutReference('TX-1')).toBeNull();
  });
  it('formats @db.Date values in UTC', () => {
    expect(formatPeriodDate('2026-09-01T00:00:00.000Z')).toContain('2026');
  });
});

describe('cms validation', () => {
  const base = { type: 'BLOG' as const, slug: 'a-b', locale: 'en', title: 'T', body: 'B', countryCode: '', city: '', status: 'DRAFT' as const };
  it('mirrors savePostBody', () => {
    expect(validatePost({ ...base, slug: 'Bad Slug' }).errors.slug).toMatch(/kebab/);
    expect(validatePost({ ...base, locale: 'e' }).errors.locale).toBeDefined();
    expect(validatePost({ ...base, countryCode: 'GBR' }).errors.countryCode).toBeDefined();
    expect(validatePost({ ...base, countryCode: 'gb' }).body).toMatchObject({ countryCode: 'GB' });
    expect(validatePost(base).body).not.toHaveProperty('city');
  });
  it('slugifies titles', () => {
    expect(slugify('Choosing a Teacher — for Your Child!')).toBe('choosing-a-teacher-for-your-child');
  });
});

describe('settings diff', () => {
  const settings: SettingDescriptor[] = [
    { key: 'billing.invoice_due_days', type: 'number', value: 7 },
    { key: 'platform.registration.open', type: 'boolean', value: true },
    { key: 'platform.contact.email', type: 'string' },
  ];
  it('produces an empty patch for an untouched draft', () => {
    expect(diffSettings(settings, toDraft(settings))).toEqual({ patch: {}, errors: {} });
  });
  it('includes only changed keys, typed', () => {
    const draft = { ...toDraft(settings), 'billing.invoice_due_days': '10', 'platform.registration.open': false };
    expect(diffSettings(settings, draft).patch).toEqual({ 'billing.invoice_due_days': 10, 'platform.registration.open': false });
  });
  it('rejects negative or non-numeric numbers', () => {
    expect(diffSettings(settings, { ...toDraft(settings), 'billing.invoice_due_days': '-1' }).errors).toHaveProperty('billing.invoice_due_days');
    expect(diffSettings(settings, { ...toDraft(settings), 'billing.invoice_due_days': '' }).errors).toHaveProperty('billing.invoice_due_days');
  });
  it('groups and labels keys', () => {
    expect(groupSettings(settings).map((g) => g.group)).toEqual(['billing', 'platform']);
    // Settings the platform reads get plain-language labels; others fall back to the key.
    expect(settingLabel('billing.invoice_due_days')).toBe('Days to pay an invoice');
    expect(settingLabel('platform.branding.name')).toBe('Branding name');
  });

  it('shows only settings the platform actually reads, by section', () => {
    const groups = groupKnownSettings(settings);
    expect(groups.flatMap((g) => g.items.map((i) => i.key))).not.toContain('platform.branding.name');
    expect(groups.find((g) => g.section === 'Billing')?.items.map((i) => i.key)).toContain('billing.invoice_due_days');
  });
});

describe('audit + courses helpers', () => {
  it('computes pages and validates filters', () => {
    expect(totalPages(0, 50)).toBe(1);
    expect(totalPages(101, 50)).toBe(3);
    expect(validateAuditFilters({ actorId: 'x' }).actorId).toBeDefined();
    expect(validateAuditFilters({ from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' }).to).toBeDefined();
  });
  it('validates course, level and lesson DTOs', () => {
    expect(validateCourse({ code: '', name: 'a', type: 'HIFZ', description: '' })).toMatchObject({
      code: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
    });
    expect(validateLevel({ name: 'Level 1', passMark: '1.5' }).passMark).toBeDefined();
    expect(validateLesson({ title: 'x' }).title).toBeDefined();
    expect(isUuid(UUID)).toBe(true);
    expect(objectivesToLines(['a', '', 'b'])).toEqual(['a', 'b']);
    expect(objectivesToLines(null)).toEqual([]);
  });
});
