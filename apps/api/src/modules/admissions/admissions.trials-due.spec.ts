import { AdmissionsService } from './admissions.service';

describe('AdmissionsService.trialsAwaitingResult', () => {
  it("asks only for the teacher's ended, uncancelled trials with no result on the class or its trial", async () => {
    const findMany = jest.fn(async () => [{ id: 'class-1' }]);
    const service = new AdmissionsService(
      { classSession: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const now = new Date('2026-11-06T12:00:00Z');

    await expect(service.trialsAwaitingResult('teacher-user', now)).resolves.toEqual([
      { id: 'class-1' },
    ]);
    const where = (findMany.mock.calls[0] as unknown as [{ where: any }])[0].where;
    expect(where).toMatchObject({
      teacher: { userId: 'teacher-user' },
      type: 'TRIAL',
      endsAt: { lt: now },
      status: { notIn: ['CANCELLED_FAMILY', 'CANCELLED_TEACHER'] },
      trialOutcomes: { none: {} },
      // One result per trial package: a result on another session of the trial counts.
      students: { none: { enrolment: { trialOutcome: { isNot: null } } } },
    });
  });
});
