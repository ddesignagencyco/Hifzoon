import { describe, it, expect } from 'vitest';
import {
  HiringStage,
  HiringStepStatus,
  nextActionableStep,
  outstandingSteps,
  sortSteps,
  teacherHiringApi,
  validateRecordStep,
} from '@/lib/api/modules/teacher-hiring';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const APP = '01a13fa3-aa2d-7512-865f-d5613c10e08f';
const PROFILE = '01a13fa3-a29e-7ee2-b12d-31d933c03130';

function steps(statuses: Partial<Record<HiringStage, HiringStepStatus>>) {
  const order: HiringStage[] = ['SUBMITTED', 'RECITATION_REVIEW', 'DEMO_CLASS', 'ID_CHECK', 'REFERENCE_CHECK', 'TRAINING', 'APPROVED'];
  return order.map((step) => ({ step, status: statuses[step] ?? ('PENDING' as HiringStepStatus) }));
}

describe('teacher hiring API module', () => {
  it('lists applications, optionally by stage', async () => {
    const api = mockApi({ 'GET /teachers/applications/list': { body: envelope([{ id: APP, applicantName: 'A', status: 'SUBMITTED', steps: [], documents: [] }]) } });
    await teacherHiringApi.listApplications();
    const rows = await teacherHiringApi.listApplications('DEMO_CLASS');
    expect(api.calls[0].url).toMatch(/\/teachers\/applications\/list$/);
    expect(api.calls[1].url).toContain('status=DEMO_CLASS');
    expect(rows[0].id).toBe(APP);
  });

  it('gets one application', async () => {
    const api = mockApi({ [`GET /teachers/applications/${APP}`]: { body: envelope({ id: APP, userId: null, steps: [{ id: 's', step: 'SUBMITTED', status: 'PASSED' }], documents: [] }) } });
    const app = await teacherHiringApi.getApplication(APP);
    expect(api.calls[0].url).toContain(`/teachers/applications/${APP}`);
    expect(app.steps[0].status).toBe('PASSED');
  });

  it('records a step with the RecordStepDto body', async () => {
    const api = mockApi({
      [`POST /teachers/applications/${APP}/steps`]: { body: envelope({ step: { id: 's1', step: 'DEMO_CLASS', status: 'PASSED', completedAt: 'x' }, applicationStatus: 'ID_CHECK' }) },
    });
    const res = await teacherHiringApi.recordStep(APP, { step: 'DEMO_CLASS', status: 'PASSED', notes: 'Clear tajweed' });
    expect(api.calls[0].body).toEqual({ step: 'DEMO_CLASS', status: 'PASSED', notes: 'Clear tajweed' });
    expect(res.applicationStatus).toBe('ID_CHECK');
  });

  it('surfaces the premature-approval 409', async () => {
    mockApi({ [`POST /teachers/applications/${APP}/steps`]: apiError(409, 'CONFLICT', 'Cannot approve: 5 hiring step(s) are not passed') });
    await expect(teacherHiringApi.recordStep(APP, { step: 'APPROVED', status: 'PASSED' })).rejects.toThrow('Cannot approve');
  });

  it('records safeguarding training and reviews profile changes', async () => {
    const api = mockApi({
      [`POST /teachers/profiles/${PROFILE}/safeguarding-training`]: { body: envelope({ id: PROFILE, safeguardingTrainingCompletedAt: '2026-10-15T12:00:00.000Z', readyToMatch: false }) },
      [`POST /teachers/profiles/${PROFILE}/review`]: { body: envelope({ id: PROFILE, pendingProfileChanges: null }) },
    });
    const t = await teacherHiringApi.recordSafeguardingTraining(PROFILE, '2026-10-15T12:00:00.000Z');
    expect(api.calls[0].body).toEqual({ completedAt: '2026-10-15T12:00:00.000Z' });
    expect(t.readyToMatch).toBe(false);
    await teacherHiringApi.reviewProfileChange(PROFILE, true);
    expect(api.calls[1].body).toEqual({ approve: true });
  });

  it('works out the next actionable step and outstanding steps', () => {
    expect(nextActionableStep(steps({ SUBMITTED: 'PASSED' }))).toBe('RECITATION_REVIEW');
    expect(nextActionableStep(steps({ SUBMITTED: 'PASSED', RECITATION_REVIEW: 'PASSED', DEMO_CLASS: 'FAILED' }))).toBe('DEMO_CLASS');
    const allPassed = steps({ SUBMITTED: 'PASSED', RECITATION_REVIEW: 'PASSED', DEMO_CLASS: 'PASSED', ID_CHECK: 'PASSED', REFERENCE_CHECK: 'PASSED', TRAINING: 'PASSED' });
    expect(nextActionableStep(allPassed)).toBe('APPROVED');
    expect(nextActionableStep(allPassed.map((s) => ({ ...s, status: 'PASSED' as const })))).toBeNull();
    expect(outstandingSteps(steps({ SUBMITTED: 'PASSED' }))).toEqual(['RECITATION_REVIEW', 'DEMO_CLASS', 'ID_CHECK', 'REFERENCE_CHECK', 'TRAINING']);
    expect(sortSteps([{ step: 'TRAINING' as HiringStage }, { step: 'SUBMITTED' as HiringStage }]).map((s) => s.step)).toEqual(['SUBMITTED', 'TRAINING']);
  });

  it('refuses approval client-side while steps are outstanding', () => {
    expect(validateRecordStep({ step: 'APPROVED', status: 'PASSED' }, steps({ SUBMITTED: 'PASSED' }))).toMatch(/outstanding/);
    expect(validateRecordStep({ step: 'ID_CHECK', status: 'FAILED', notes: 'x'.repeat(2001) }, [])).toMatch(/2000/);
    expect(validateRecordStep({ step: 'ID_CHECK', status: 'PASSED' }, [])).toBeNull();
  });
});
