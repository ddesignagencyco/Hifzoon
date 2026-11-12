import { ClassCreditsService } from './class-credits.service';

function build(opts: { replay?: Record<string, unknown> | null; family?: unknown } = {}) {
  const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    ...data,
  }));
  const prisma = {
    classCredit: {
      findUnique: jest.fn(async () => opts.replay ?? null),
      create,
      findMany: jest.fn(async () => []),
      delete: jest.fn(),
    },
    family: {
      findUnique: jest.fn(async () =>
        opts.family === undefined ? { id: 'f1', deletedAt: null, name: 'Khan' } : opts.family,
      ),
    },
    user: { findMany: jest.fn(async () => []) },
  };
  const audit = { record: jest.fn() };
  return {
    service: new ClassCreditsService(prisma as never, audit as never),
    create,
    audit,
    prisma,
  };
}

describe('ClassCreditsService', () => {
  const base = { familyId: 'f1', amountClasses: 2, reason: 'Missed class', idempotencyKey: 'k1' };

  it('issues a credit and audits it', async () => {
    const { service, create, audit } = build();
    await service.issue(base, 'admin');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ familyId: 'f1', amountClasses: 2, issuedById: 'admin' }),
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('returns the original credit when the same key is replayed', async () => {
    const { service, create } = build({ replay: { id: 'c9', familyId: 'f1', amountClasses: 2 } });
    const result = await service.issue(base, 'admin');
    expect(result.id).toBe('c9');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a key reused for a different family or amount', async () => {
    const { service } = build({ replay: { id: 'c9', familyId: 'other', amountClasses: 2 } });
    await expect(service.issue(base, 'admin')).rejects.toThrow(/already used/);
  });

  it('bounds the amount and needs a reason and a real family', async () => {
    await expect(build().service.issue({ ...base, amountClasses: 0 }, 'a')).rejects.toThrow(
      /between/,
    );
    await expect(build().service.issue({ ...base, amountClasses: 500 }, 'a')).rejects.toThrow(
      /between/,
    );
    await expect(build().service.issue({ ...base, reason: ' ' }, 'a')).rejects.toThrow(/reason/);
    await expect(build({ family: null }).service.issue(base, 'a')).rejects.toThrow(/Family/);
  });
});
