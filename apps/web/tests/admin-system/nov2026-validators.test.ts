import { describe, expect, it } from 'vitest';
import { validateAdjustment, validatePayRate } from '@/lib/api/modules/payroll-admin';
import { validateRubric } from '@/lib/api/modules/qa';
import { validateHoliday } from '@/lib/api/modules/scheduling-admin';
import { validateLessonFile } from '@/lib/api/modules/courses-extras';
import { pct } from '@/lib/api/modules/ops-admin';
import { payslipLineLabel } from '@/lib/api/modules/payroll-teacher';

describe('payroll forms', () => {
  it('requires a positive amount, a 3-letter currency and a date', () => {
    expect(validatePayRate({ name: 'Std', currency: 'USD', amount: '4.5', effectiveFrom: '2026-11-01' })).toEqual({});
    const bad = validatePayRate({ name: '', currency: 'US', amount: '0', effectiveFrom: '' });
    expect(Object.keys(bad).sort()).toEqual(['amount', 'currency', 'effectiveFrom', 'name']);
  });
  it('requires an amount and a reason for adjustments', () => {
    expect(validateAdjustment('10', 'Eid bonus')).toEqual({});
    expect(validateAdjustment('-1', 'x').amount).toBeDefined();
    expect(validateAdjustment('5', 'x').reason).toBeDefined();
  });
  it('labels manual payslip lines', () => {
    expect(payslipLineLabel('DEDUCTION_MANUAL')).toBe('Deduction');
    expect(payslipLineLabel('BONUS')).toBe('Bonus');
  });
});

describe('rubric rules', () => {
  const ok = [{ key: 'pacing', label: 'Kept pace', weight: 2 }];
  it('accepts a valid rubric', () => expect(validateRubric('Standard', ok)).toBeNull());
  it('rejects bad keys, duplicate keys and weights', () => {
    expect(validateRubric('Standard', [{ key: 'Bad Key', label: 'Label', weight: 1 }])).toMatch(/key/i);
    expect(validateRubric('Standard', [...ok, ...ok])).toMatch(/twice/);
    expect(validateRubric('Standard', [{ key: 'pacing', label: 'Kept pace', weight: 9 }])).toMatch(/Weight/);
    expect(validateRubric('Standard', [])).toMatch(/1 to 20/);
  });
});

describe('holiday rules', () => {
  const base = { name: 'Eid', type: 'HOLIDAY' as const, startsOn: '2026-12-01', endsOn: '2026-12-03', shiftMinutes: '', durationMinutes: '' };
  it('accepts a closure and rejects reversed dates', () => {
    expect(validateHoliday(base)).toBeNull();
    expect(validateHoliday({ ...base, endsOn: '2026-11-01' })).toMatch(/before/);
  });
  it('needs a shift or length for a Ramadan timetable, within range', () => {
    const r = { ...base, type: 'RAMADAN_TIMETABLE' as const };
    expect(validateHoliday(r)).toMatch(/shift/i);
    expect(validateHoliday({ ...r, shiftMinutes: '400' })).toMatch(/-360/);
    expect(validateHoliday({ ...r, shiftMinutes: '-30', durationMinutes: '30' })).toBeNull();
  });
});

describe('lesson file rules', () => {
  it('allows PDFs, images and audio within their limits', () => {
    expect(validateLessonFile({ name: 'a.pdf', type: 'application/pdf', size: 1024 })).toBeNull();
    expect(validateLessonFile({ name: 'a.png', type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/too large/);
    expect(validateLessonFile({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toMatch(/PDF/);
  });
});

describe('rates', () => {
  it('shows a dash when there is nothing to measure', () => {
    expect(pct(null)).toBe('—');
    expect(pct(0.256)).toBe('25.6%');
  });
});

import { overlapping } from '@/components/teacher/HolidayNotice';

describe('holiday overlay', () => {
  const h = (id: string, startsOn: string, endsOn: string) =>
    ({ id, name: id, type: 'HOLIDAY', startsOn, endsOn, shiftRule: null }) as never;
  it('keeps only holidays that overlap the visible range', () => {
    const list = [h('in', '2026-12-02T00:00:00.000Z', '2026-12-03T00:00:00.000Z'), h('before', '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z'), h('after', '2026-12-08T00:00:00.000Z', '2026-12-09T00:00:00.000Z')];
    const got = overlapping(list, '2026-12-01T00:00:00.000Z', '2026-12-08T00:00:00.000Z').map((x) => x.id);
    expect(got).toEqual(['in']);
  });
});
