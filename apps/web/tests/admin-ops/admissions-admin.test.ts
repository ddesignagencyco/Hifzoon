import { describe, it, expect } from 'vitest';
import { admissionsAdminApi, validateTrialOutcome } from '@/lib/api/modules/admissions-admin';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const STUDENT = '00000000-0000-7000-8000-000000000011';
const COURSE = '01a13f96-7076-7a90-b275-5151d68adb6e';
const CLASS = '01a13fa3-0000-7000-8000-0000000000c1';
const REQ = '01a13fa3-0000-7000-8000-0000000000r1';

describe('admissions admin API module', () => {
  it('books a trial with the bookTrialBody shape', async () => {
    const api = mockApi({
      'POST /trials': (call) => ({ status: 201, body: envelope({ id: CLASS, type: 'TRIAL', status: 'SCHEDULED', ...(call.body as object) }) }),
    });
    const body = { studentId: STUDENT, courseId: COURSE, startsAt: '2026-10-20T16:00:00.000Z', teacherId: 't1' };
    const trial = await admissionsAdminApi.bookTrial(body);
    expect(api.calls[0].body).toEqual(body);
    expect(trial.id).toBe(CLASS);
  });

  it('surfaces the double-booking conflict message', async () => {
    mockApi({ 'POST /trials': apiError(409, 'CONFLICT', 'Maryam already has a trial booked for 2026-10-20T16:00:00.000Z') });
    await expect(
      admissionsAdminApi.bookTrial({ studentId: STUDENT, courseId: COURSE, startsAt: '2026-10-20T16:00:00.000Z' }),
    ).rejects.toThrow('already has a trial booked');
  });

  it('records a trial outcome and returns the subscribe token', async () => {
    const api = mockApi({
      [`POST /trials/${CLASS}/outcome`]: {
        status: 201,
        body: envelope({ outcome: { id: 'o1', classId: CLASS, subscribeToken: 'tok', placementLevelId: null, recommendedPlanId: null, notes: null, completedAt: 'x' }, subscribeToken: 'tok', alreadyRecorded: false }),
      },
    });
    const res = await admissionsAdminApi.recordTrialOutcome(CLASS, { won: true, notes: 'Strong reader' });
    expect(api.calls[0].body).toEqual({ won: true, notes: 'Strong reader' });
    expect(res.subscribeToken).toBe('tok');
    expect(res.alreadyRecorded).toBe(false);
  });

  it('lists teacher changes with an optional status filter', async () => {
    const api = mockApi({
      'GET /teacher-changes': { body: envelope([{ id: REQ, status: 'OPEN', studentName: 'Maryam', family: { id: 'f', name: 'Khan Family' } }]) },
    });
    await admissionsAdminApi.listTeacherChanges();
    const rows = await admissionsAdminApi.listTeacherChanges('OPEN');
    expect(api.calls[0].url).toMatch(/\/teacher-changes$/);
    expect(api.calls[1].url).toContain('/teacher-changes?status=OPEN');
    expect(rows[0].studentName).toBe('Maryam');
  });

  it('approves a teacher change with the new teacher, and declines with the status only (B10)', async () => {
    const api = mockApi({ [`POST /teacher-changes/${REQ}/resolve`]: { body: envelope({ id: REQ, status: 'APPROVED' }) } });
    const res = await admissionsAdminApi.resolveTeacherChange(REQ, 'APPROVED', 'tp-new');
    expect(api.calls[0].body).toEqual({ status: 'APPROVED', newTeacherId: 'tp-new' });
    expect(res.status).toBe('APPROVED');
    await admissionsAdminApi.resolveTeacherChange(REQ, 'DECLINED', 'tp-ignored');
    expect(api.calls[1].body).toEqual({ status: 'DECLINED' });
  });

  it('lists plans with prices', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([{ id: 'p1', name: 'Standard', classesPerWeek: 3, classMinutes: 30, roomType: 'ONE_TO_ONE', prices: [{ id: 'x', currency: 'GBP', amountMinor: 6900 }] }]) } });
    const plans = await admissionsAdminApi.listPlans();
    expect(plans[0].prices[0].amountMinor).toBe(6900);
  });

  it('validates outcome text limits', () => {
    expect(validateTrialOutcome({ won: false })).toEqual({});
    expect(validateTrialOutcome({ won: true, notes: 'x'.repeat(4001) }).notes).toBeTruthy();
    expect(validateTrialOutcome({ won: false, lostReason: 'x'.repeat(2001) }).lostReason).toBeTruthy();
  });
});
