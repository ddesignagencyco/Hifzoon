import { ApplicantTrainingService } from './applicant-training.service';
import { COURSE_MODULES } from './applicant-course';

const allRead = Object.fromEntries(COURSE_MODULES.map((m) => [m.id, '2026-11-02T10:00:00.000Z']));

function build(training: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    id: 't1',
    applicationId: 'a1',
    status: 'IN_PROGRESS',
    courseVersion: 'v',
    tokenExpiresAt: new Date(Date.now() + 86_400_000),
    acknowledgements: allRead,
    termsAcceptedAt: null,
    application: { applicantName: 'A', status: 'TRAINING' },
    ...training,
  };
  const prisma = {
    applicantTraining: {
      findUnique: jest.fn(async () => state),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(state, data),
      ),
    },
    teacherApplication: {
      update: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => ({ userId: null })),
    },
    teacherProfile: { updateMany: jest.fn(async () => ({ count: 0 })) },
    user: { findMany: jest.fn(async () => [{ id: 'staff1' }]) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const crypto = { hashToken: (t: string) => `h:${t}`, issueOpaqueToken: () => 'tok' };
  const config = { value: { APP_WEB_URL: 'http://localhost:3000' } };
  const notifications = { emailAddress: jest.fn(), enqueue: jest.fn() };
  const service = new ApplicantTrainingService(
    prisma as never,
    crypto as never,
    config as never,
    notifications as never,
  );
  return { service, prisma, state, notifications };
}

const TOKEN = 'x'.repeat(40);

describe('ApplicantTrainingService', () => {
  it('refuses the terms until every module is confirmed', async () => {
    const { service, prisma } = build({ acknowledgements: {} });
    await expect(service.acceptTerms(TOKEN)).rejects.toThrow(/every module/);
    expect(prisma.teacherApplication.update).not.toHaveBeenCalled();
  });

  it('completes the training when the terms are accepted, and tells the hiring team', async () => {
    const { service, prisma, state, notifications } = build();
    const result = await service.acceptTerms(TOKEN);

    expect(result).toMatchObject({ status: 'PASSED' });
    expect(state.status).toBe('PASSED');
    expect(state.termsAcceptedAt).toBeInstanceOf(Date);
    expect(state.passedAt).toBeInstanceOf(Date);
    // The completion is what fills the dates approval and readiness read.
    expect(prisma.teacherApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ safeguardingTrainingAt: expect.any(Date) }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['staff1'] }),
    );
  });

  it('keeps the first acceptance time for an applicant who accepted before completion moved here', async () => {
    const accepted = new Date('2026-11-02T12:16:16.826Z');
    const { service, state } = build({ termsAcceptedAt: accepted });
    await service.acceptTerms(TOKEN);
    expect(state.termsAcceptedAt).toBe(accepted);
    expect(state.status).toBe('PASSED');
  });

  it('does not complete a training twice', async () => {
    await expect(build({ status: 'PASSED' }).service.acceptTerms(TOKEN)).rejects.toThrow(
      /already completed/,
    );
  });

  it('leaves a link already sent alone on the automatic send, but re-sends on request', async () => {
    const { service, prisma, notifications } = build();
    const upsert = jest.fn(async () => ({ status: 'IN_PROGRESS' }));
    Object.assign(prisma.applicantTraining, { upsert });
    prisma.teacherApplication.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'TRAINING',
      applicantName: 'A',
      email: 'a@example.test',
      training: { status: 'IN_PROGRESS' },
    } as never);

    await expect(service.send('a1', { onlyIfUnsent: true })).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    expect(notifications.emailAddress).not.toHaveBeenCalled();

    await expect(service.send('a1')).resolves.toMatchObject({ status: 'IN_PROGRESS' });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(notifications.emailAddress).toHaveBeenCalledTimes(1);
  });

  it('treats an unknown or expired token as not found', async () => {
    await expect(
      build({ tokenExpiresAt: new Date(Date.now() - 1000) }).service.session(TOKEN),
    ).rejects.toThrow();
    await expect(build().service.session('short')).rejects.toThrow();
  });
});
