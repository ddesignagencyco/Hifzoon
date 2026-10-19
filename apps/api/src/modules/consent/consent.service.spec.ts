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
