import { describe, it, expect } from 'vitest';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { casesApi, validateReport } from '@/lib/api/modules/cases';
import { crmApi, toCreateLeadInput, validateLeadForm, EMPTY_LEAD_FORM } from '@/lib/api/modules/crm';
import { teacherHiringApi } from '@/lib/api/modules/teacher-hiring';
import { teacherApi } from '@/lib/api/modules/teacher';
import { teacherMeApi } from '@/lib/api/modules/teacher-me';
import { teacherTiersApi, monthlyAvailabilityApi } from '@/lib/api/modules/backend-updates-oct2026';
import { isMonthScopedSlot, validateAvailability } from '@/components/teacher/availability-form';
import { currentMonth, monthGrid, quickFillSlots, shiftMonth, todayIn, validateQuickFill } from '@/components/teacher/MonthlyAvailabilityEditor';
import { validateTierForm } from '@/components/admin/teachers/TeacherTiersCatalogue';

describe('report a concern (M56)', () => {
  it('posts a trimmed report and reads my reports', async () => {
    const api = mockApi({
      'POST /cases/report': { status: 201, body: envelope({ reference: 'AB12CD34', receivedAt: '2026-10-29T10:00:00Z' }) },
      'GET /cases/mine': { body: envelope([{ reference: 'AB12CD34', type: 'SAFEGUARDING', status: 'OPEN', receivedAt: '2026-10-29T10:00:00Z', closedAt: null }]) },
    });
    const receipt = await casesApi.report({ type: 'SAFEGUARDING', description: '  The teacher asked for a phone number  ' });
    expect(receipt.reference).toBe('AB12CD34');
    expect(api.calls[0].body).toEqual({ type: 'SAFEGUARDING', description: 'The teacher asked for a phone number' });
    expect((await casesApi.mine())[0].status).toBe('OPEN');
  });

  it('needs at least 10 characters', () => {
    expect(validateReport({ type: 'COMPLAINT', description: ' short ' })).toMatch(/at least 10/);
    expect(validateReport({ type: 'COMPLAINT', description: 'Class started 20 minutes late' })).toBeNull();
  });
});

describe('CRM geography (M-GEO-01)', () => {
  it('sends region, city and postcode and reads counts by area', async () => {
    const api = mockApi({ 'GET /admin/crm/leads/by-area': { body: envelope([{ country: 'PK', region: 'Punjab', count: 4 }]) } });
    const body = toCreateLeadInput({ ...EMPTY_LEAD_FORM, contactName: 'Amina', country: 'pk', region: ' Punjab ', city: 'Lahore', postcode: '54000' });
    expect(body).toMatchObject({ country: 'PK', region: 'Punjab', city: 'Lahore', postcode: '54000' });
    expect(validateLeadForm({ ...EMPTY_LEAD_FORM, contactName: 'A', postcode: 'x'.repeat(21) }).postcode).toBeTruthy();
    const rows = await crmApi.leadsByArea('pk');
    expect(api.calls[0].url).toContain('/admin/crm/leads/by-area?country=PK');
    expect(rows[0].count).toBe(4);
  });
});

describe('teacher profile review and credentials (M54, M57, #7)', () => {
  it('lists pending changes and sends a rejection reason only when given', async () => {
    const api = mockApi({
      'GET /teachers/profile-changes': { body: envelope([{ profileId: 'tp1', teacherName: 'Bilal', submittedAt: null, changes: { bio: 'New' }, current: { bio: 'Old' } }]) },
      'POST /teachers/profiles/tp1/review': { body: envelope({ id: 'tp1', pendingProfileChanges: null }) },
    });
    const rows = await teacherHiringApi.listProfileChanges();
    expect(rows[0].current.bio).toBe('Old');
    await teacherHiringApi.reviewProfileChange('tp1', false, '  Photo is blurry ');
    expect(api.calls[1].body).toEqual({ approve: false, reason: 'Photo is blurry' });
    await teacherHiringApi.reviewProfileChange('tp1', true, '   ');
    expect(api.calls[2].body).toEqual({ approve: true });
  });

  it('lets a teacher withdraw their staged change and read their own student', async () => {
    const api = mockApi({
      'DELETE /teachers/me/profile/pending': { body: envelope({ id: 'tp1', pendingProfileChanges: null, profileChangeOutcome: 'WITHDRAWN' }) },
      'GET /teachers/me/students/s1': { body: envelope({ id: 's1', displayName: 'Maryam', family: { name: 'Khan', guardians: [] }, consents: { classRecording: true, aiVoice: false, aiTraining: false } }) },
    });
    expect((await teacherMeApi.withdrawPendingChange()).profileChangeOutcome).toBe('WITHDRAWN');
    expect(api.calls[0].method).toBe('DELETE');
    expect((await teacherApi.student('s1')).consents.classRecording).toBe(true);
  });
});

describe('teacher tiers (#4)', () => {
  it('creates, updates and assigns tiers', async () => {
    const api = mockApi({
      'POST /teachers/teacher-tiers': { status: 201, body: envelope({ id: 't1', code: 'SENIOR' }) },
      'PATCH /teachers/teacher-tiers/t1': { body: envelope({ id: 't1', active: false }) },
      'PATCH /teachers/tp1/tier': { body: envelope({ id: 'tp1', tierId: null, tier: null }) },
    });
    await teacherTiersApi.create({ code: 'SENIOR', name: 'Senior' });
    await teacherTiersApi.update('t1', { active: false });
    await teacherTiersApi.assign('tp1', null);
    expect(api.calls.map((c) => c.method)).toEqual(['POST', 'PATCH', 'PATCH']);
    expect(api.calls[2].body).toEqual({ tierId: null });
  });

  it('validates the tier form like the DTO', () => {
    const blank = { code: '', name: '', badgeIcon: '', description: '', sortOrder: '' };
    expect(validateTierForm({ ...blank, code: 'senior tier', name: 'Senior' }, true).code).toBeTruthy();
    expect(validateTierForm({ ...blank, code: 'SENIOR', name: 'S' }, true).name).toBeTruthy();
    expect(validateTierForm({ ...blank, code: 'SENIOR', name: 'Senior', sortOrder: '1.5' }, true).sortOrder).toBeTruthy();
    expect(validateTierForm({ ...blank, code: '', name: 'Senior' }, false)).toEqual({});
  });
});

describe('monthly availability and leave (#1)', () => {
  it('sends a month of slots and replaces the month of leave (empty clears it)', async () => {
    const month = { teacherId: 'tp1', month: '2026-11', submittedAt: null, slots: [], leaveDays: [] };
    const api = mockApi({
      'PUT /scheduling/teachers/tp1/availability-month/2026-11': { body: envelope(month) },
      'PUT /scheduling/teachers/tp1/leave-month/2026-11': { body: envelope(month) },
    });
    await monthlyAvailabilityApi.setMonth('tp1', '2026-11', [{ weekday: 1, startTime: '16:00', endTime: '18:00' }]);
    await monthlyAvailabilityApi.setLeaveMonth('tp1', '2026-11', []);
    expect(api.calls[0].body).toMatchObject({ slots: [{ weekday: 1, startTime: '16:00', endTime: '18:00' }] });
    expect(api.calls[1].body).toEqual({ days: [] });
  });

  it('builds a Monday-first month grid and steps months', () => {
    const nov = monthGrid('2026-11');
    expect(nov.days).toHaveLength(30);
    expect(nov.days[0]).toBe('2026-11-01');
    expect(nov.leading).toBe(6);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(currentMonth(new Date(2026, 9, 29))).toBe('2026-10');
  });

  it('tells month-scoped slots apart from weekly ones and allows an empty month', () => {
    expect(isMonthScopedSlot({ effectiveFrom: '2026-11-01T00:00:00.000Z', effectiveTo: '2026-11-30T00:00:00.000Z' })).toBe(true);
    expect(isMonthScopedSlot({ effectiveFrom: '2026-10-29T00:00:00.000Z', effectiveTo: null })).toBe(false);
    expect(isMonthScopedSlot({ effectiveFrom: '2026-11-01T00:00:00.000Z', effectiveTo: '2026-12-31T00:00:00.000Z' })).toBe(false);
    expect(validateAvailability([]).valid).toBe(false);
    expect(validateAvailability([], {}, { allowEmpty: true }).valid).toBe(true);
  });

  it('fills the same range on every chosen day, Monday first', () => {
    expect(quickFillSlots([0, 1, 3], '16:00', '20:00')).toEqual([
      { weekday: 1, startTime: '16:00', endTime: '20:00' },
      { weekday: 3, startTime: '16:00', endTime: '20:00' },
      { weekday: 0, startTime: '16:00', endTime: '20:00' },
    ]);
    expect(validateQuickFill([], '16:00', '20:00')).toMatch(/at least one day/);
    expect(validateQuickFill([1], '20:00', '16:00')).toMatch(/after the start/);
    expect(validateQuickFill([1], '', '16:00')).toMatch(/both times/);
    expect(validateQuickFill([1, 2], '16:00', '20:00')).toBeNull();
  });

  it("works out today in the teacher's own zone, not UTC", () => {
    const lateEvening = new Date('2026-10-30T02:00:00Z');
    expect(todayIn('America/New_York', lateEvening)).toBe('2026-10-29');
    expect(todayIn('Asia/Karachi', lateEvening)).toBe('2026-10-30');
  });
});
