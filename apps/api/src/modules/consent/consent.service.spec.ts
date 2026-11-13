import { ConsentMethod, ConsentPurpose } from '@hifzoon/shared';

import { ConsentService } from './consent.service';

function build(options: { currentVersion?: string } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const tx = {
    consent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'c1', ...data };
      }),
      update: jest.fn(),
    },
    consentEvent: { create: jest.fn(async () => ({})) },
  };
  const prisma = {
    student: { findUnique: jest.fn(async () => ({ id: 'child-1', familyId: 'family-1' })) },
    userRole: { count: jest.fn(async () => 0) },
    consent: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (work: (t: typeof tx) => Promise<unknown>) => work(tx)),
  };
  const policies = { assertGuardianOwnsStudent: jest.fn(async () => undefined) };
  const settings = {
    getString: jest.fn(async () => options.currentVersion ?? 'v1'),
  };
  const service = new ConsentService(
    prisma as never,
    {} as never,
    policies as never,
    {} as never,
    settings as never,
  );
  return { service, created, settings };
}

const GRANT = {
  studentId: 'child-1',
  purposes: [ConsentPurpose.DATA_COLLECTION],
  method: ConsentMethod.OTHER,
  actorUserId: 'guardian-1',
};

describe('ConsentService policy version (M9)', () => {
  it('reports the version from settings', async () => {
    const { service, settings } = build({ currentVersion: 'v3' });

    await expect(service.currentPolicyVersion()).resolves.toBe('v3');
    expect(settings.getString).toHaveBeenCalledWith('consent.policy_version');
  });

  it('records the current version when the client sends none', async () => {
    const { service, created } = build({ currentVersion: 'v3' });

    await service.grant(GRANT);

    expect(created[0].policyVersion).toBe('v3');
  });

  it('keeps the version the client sent, so an older notice is recorded as the older one', async () => {
    const { service, created } = build({ currentVersion: 'v3' });

    await service.grant({ ...GRANT, policyVersion: 'v2' });

    expect(created[0].policyVersion).toBe('v2');
  });
});

describe('ConsentService withdrawal consequences', () => {
  function withdrawing() {
    const prisma = {
      consent: { findMany: jest.fn(async () => []) },
      practiceSession: { updateMany: jest.fn(async () => ({ count: 2 })) },
      classSession: { updateMany: jest.fn(async () => ({ count: 0 })) },
      $transaction: jest.fn(),
    };
    const queues = { add: jest.fn(async () => undefined) };
    const service = new ConsentService(
      prisma as never,
      {} as never,
      { assertGuardianOwnsStudent: jest.fn(async () => undefined) } as never,
      queues as never,
      {} as never,
    );
    return { service, prisma, queues };
  }

  it('makes practice audio due and queues its deletion, without forgetting the files', async () => {
    const { service, prisma, queues } = withdrawing();
    await service.withdraw({
      studentId: 'child-1',
      purposes: [ConsentPurpose.AI_VOICE],
      actorUserId: 'guardian-1',
    });

    expect(prisma.practiceSession.updateMany).toHaveBeenCalledWith({
      where: { studentId: 'child-1', audioKey: { not: null } },
      data: { audioDeleteAfter: expect.any(Date) },
    });
    expect(queues.add).toHaveBeenCalledWith(expect.anything(), 'delete-ai-audio', {});
  });

  it('withdrawing recording consent touches recordings only, not tajweed colours or practice audio', async () => {
    const { service, prisma, queues } = withdrawing();
    await service.withdraw({
      studentId: 'child-1',
      purposes: [ConsentPurpose.CLASS_RECORDING],
      actorUserId: 'guardian-1',
    });

    expect(queues.add).toHaveBeenCalledWith(
      expect.anything(),
      'withdrawal-recording-cleanup',
      expect.objectContaining({ studentId: 'child-1' }),
    );
    expect(prisma.classSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.practiceSession.updateMany).not.toHaveBeenCalled();
  });
});

describe('ConsentService.missingRequiredForGuardian (CR-01)', () => {
  it("lists only the guardian's children without lesson-records consent", async () => {
    const findMany = jest.fn(async () => [
      {
        id: 's1',
        familyId: 'f1',
        displayName: 'Amina',
        consents: [{ purpose: 'DATA_COLLECTION' }],
      },
      { id: 's2', familyId: 'f1', displayName: 'Yusuf', consents: [] },
    ]);
    const service = new ConsentService(
      { student: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.missingRequiredForGuardian('guardian-1')).resolves.toEqual([
      { studentId: 's2', familyId: 'f1', displayName: 'Yusuf', missing: ['DATA_COLLECTION'] },
    ]);
    const where = (findMany.mock.calls[0] as unknown as [{ where: any }])[0].where;
    expect(where.family.members).toEqual({ some: { userId: 'guardian-1' } });
    expect(where.deletedAt).toBeNull();
  });
});

describe('ConsentService.assertChildUsable (STU-01)', () => {
  function build(student: Record<string, unknown> | null) {
    const findUnique = jest.fn(async () => student);
    const service = new ConsentService(
      { student: { findUnique } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findUnique };
  }

  const thisYear = new Date().getUTCFullYear();

  it('STU-01 blocks an under-13 student with no verified guardian', async () => {
    const { service } = build({
      birthYear: thisYear - 8,
      family: { members: [] },
    });

    await expect(service.assertChildUsable('child-1')).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
  });

  it('STU-01 allows an under-13 student once a verified guardian exists', async () => {
    const { service, findUnique } = build({
      birthYear: thisYear - 8,
      family: { members: [{ id: 'fm1' }] },
    });

    await expect(service.assertChildUsable('child-1')).resolves.toBeUndefined();
    // Only verified members count towards the gate.
    const where = (findUnique.mock.calls[0] as unknown as [{ select: any }])[0].select;
    expect(where.family.select.members.where).toEqual({ verifiedAt: { not: null } });
  });

  it('STU-01 does not gate a student aged 13 or over', async () => {
    const { service } = build({
      birthYear: thisYear - 15,
      family: { members: [] },
    });

    await expect(service.assertChildUsable('child-1')).resolves.toBeUndefined();
  });

  it('STU-01 throws NOT_FOUND for an unknown student', async () => {
    const { service } = build(null);
    await expect(service.assertChildUsable('nope')).rejects.toThrow(/not found/i);
  });
});
