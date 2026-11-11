import { PayrollService } from './payroll.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

function build(opts: { overlap?: unknown; classes?: unknown[] } = {}) {
  const entryUpdate = jest.fn();
  const classFindMany = jest.fn().mockResolvedValue(opts.classes ?? []);
  const tx = {
    payrollEntry: { create: jest.fn().mockResolvedValue({ id: 'e1' }), update: entryUpdate },
    payRate: {
      findUnique: jest.fn().mockResolvedValue({ classType: null, ratePerClassMinor: 1000 }),
    },
    payrollLine: { createMany: jest.fn() },
  };
  const prisma = {
    payrollPeriod: {
      findFirst: jest.fn().mockResolvedValue(opts.overlap ?? null),
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'p1',
        status: 'OPEN',
        startsOn: day('2026-11-01'),
        endsOn: day('2026-11-30'),
      }),
      update: jest.fn(),
    },
    classSession: { findMany: classFindMany },
    payrollEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const svc = new PayrollService(prisma as never, { record: jest.fn() } as never);
  return { svc, prisma, entryUpdate, classFindMany };
}

describe('PayrollService', () => {
  it('rejects a period that overlaps an existing one', async () => {
    const { svc, prisma } = build({ overlap: { id: 'x' } });
    await expect(svc.openPeriod(day('2026-11-15'), day('2026-12-15'), 'a')).rejects.toThrow(
      /overlaps/,
    );
    expect(prisma.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it('allows a one-day period but not an inverted one', async () => {
    const { svc } = build();
    await expect(svc.openPeriod(day('2026-11-15'), day('2026-11-15'), 'a')).resolves.toBeDefined();
    await expect(svc.openPeriod(day('2026-11-16'), day('2026-11-15'), 'a')).rejects.toThrow();
  });

  it('includes the whole last day of the period', async () => {
    const { svc, classFindMany } = build();
    await svc.calculatePeriod('p1', 'a');
    const where = classFindMany.mock.calls[0][0].where;
    expect(where.startsAt.lt).toEqual(new Date('2026-12-01T00:00:00.000Z'));
    expect(where.startsAt.lte).toBeUndefined();
  });

  it('records deductions separately and nets them from gross', async () => {
    const klass = (id: string, status: string) => ({
      id,
      teacherId: 't1',
      startsAt: new Date(),
      type: 'HIFZ',
      status,
      charged: true,
      teacher: { payRateId: 'r1' },
    });
    const { svc, entryUpdate } = build({
      classes: [klass('c1', 'COMPLETED'), klass('c2', 'COMPLETED'), klass('c3', 'NO_SHOW_TEACHER')],
    });
    await svc.calculatePeriod('p1', 'a');
    expect(entryUpdate.mock.calls[0][0].data).toEqual({
      grossMinor: 2000,
      deductionsMinor: 1000,
      bonusesMinor: 0,
      netMinor: 1000,
    });
  });
});
