import { csvCell, minorToDecimal, PayrollService, totalsOf } from './payroll.service';

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

describe('PayrollService — rates, adjustments and export (missing features)', () => {
  function svc(prisma: Record<string, unknown>) {
    const audit = { record: jest.fn() };
    return { service: new PayrollService(prisma as never, audit as never), audit };
  }

  it('refuses to switch off a rate teachers are still on', async () => {
    const update = jest.fn();
    const { service } = svc({
      payRate: {
        findUnique: jest.fn(async () => ({ id: 'r1', active: true, _count: { teachers: 3 } })),
        update,
      },
    });
    await expect(service.setRateActive('r1', false, 'a')).rejects.toThrow(/3 teacher/);
    expect(update).not.toHaveBeenCalled();
  });

  it('will not put a teacher on a switched-off rate', async () => {
    const { service } = svc({
      teacherProfile: { findUnique: jest.fn(async () => ({ id: 't1', payRateId: null })) },
      payRate: { findUnique: jest.fn(async () => ({ id: 'r1', active: false })) },
    });
    await expect(service.assignRate('t1', 'r1', 'a')).rejects.toThrow(/switched off/);
  });

  it('rejects a non-positive rate', async () => {
    const { service } = svc({});
    await expect(
      service.createRate(
        { name: 'Std', currency: 'USD', ratePerClassMinor: 0, effectiveFrom: new Date() },
        'a',
      ),
    ).rejects.toThrow(/above zero/);
  });

  it('recomputes entry totals from its lines when a bonus is added', async () => {
    const entryUpdate = jest.fn(async ({ data }: { data: Record<string, number> }) => data);
    const tx = {
      payrollLine: {
        create: jest.fn(),
        findMany: jest.fn(async () => [
          { kind: 'CLASS', amountMinor: 3000 },
          { kind: 'DEDUCTION_MISSED', amountMinor: -1000 },
          { kind: 'BONUS', amountMinor: 500 },
        ]),
      },
      payrollEntry: { update: entryUpdate },
    };
    const { service } = svc({
      payrollEntry: {
        findUnique: jest.fn(async () => ({
          id: 'e1',
          teacherId: 't1',
          status: 'OPEN',
          period: { status: 'CALCULATED' },
        })),
      },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    });
    await service.addAdjustment(
      'e1',
      { kind: 'BONUS', amountMinor: 500, reason: 'Extra class' },
      'a',
    );
    expect(entryUpdate.mock.calls[0]?.[0].data).toEqual({
      grossMinor: 3000,
      deductionsMinor: 1000,
      bonusesMinor: 500,
      netMinor: 2500,
    });
  });

  it('refuses an adjustment once the period is exported or the entry paid', async () => {
    const { service } = svc({
      payrollEntry: {
        findUnique: jest.fn(async () => ({
          id: 'e1',
          teacherId: 't1',
          status: 'OPEN',
          period: { status: 'EXPORTED' },
        })),
      },
    });
    await expect(
      service.addAdjustment('e1', { kind: 'DEDUCTION', amountMinor: 100, reason: 'Late' }, 'a'),
    ).rejects.toThrow(/not yet exported/);
  });

  it('refuses to export a period that has not been calculated', async () => {
    const { service } = svc({
      payrollPeriod: {
        findUnique: jest.fn(async () => ({ id: 'p', status: 'OPEN', entries: [] })),
      },
    });
    await expect(service.exportPeriodCsv('p', 'a')).rejects.toThrow(/Calculate/);
  });

  it('exports a calculated period and marks it EXPORTED', async () => {
    const update = jest.fn();
    const { service } = svc({
      payrollPeriod: {
        findUnique: jest.fn(async () => ({
          id: 'p',
          status: 'CALCULATED',
          startsOn: day('2026-11-01'),
          endsOn: day('2026-11-30'),
          entries: [
            {
              grossMinor: 3000,
              deductionsMinor: 1000,
              bonusesMinor: 0,
              netMinor: 2000,
              status: 'OPEN',
              payoutReference: null,
              teacher: {
                user: { name: 'Ali, Jr', email: 'a@x.com' },
                payRate: { currency: 'GBP' },
              },
            },
          ],
        })),
        update,
      },
    });
    const { filename, csv } = await service.exportPeriodCsv('p', 'a');
    expect(filename).toBe('payroll-2026-11-01-2026-11-30.csv');
    expect(csv.split('\r\n')[1]).toBe(
      '"Ali, Jr",a@x.com,2026-11-01,2026-11-30,GBP,30.00,10.00,0.00,20.00,OPEN,',
    );
    expect(update).toHaveBeenCalledWith({ where: { id: 'p' }, data: { status: 'EXPORTED' } });
  });

  it('formats money without floats and neutralises spreadsheet formulas', () => {
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(123456, 'USD')).toBe('1234.56');
    expect(minorToDecimal(-250, 'USD')).toBe('-2.50');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('plain')).toBe('plain');
    expect(totalsOf([{ kind: 'DEDUCTION_MANUAL', amountMinor: -200 }]).deductions).toBe(200);
  });
});

describe('PayrollService.periodReport — per-row figures', () => {
  it('returns deductions, bonuses, payout reference and teacher id on every entry', async () => {
    const prisma = {
      payrollPeriod: {
        findUnique: jest.fn(async () => ({
          id: 'p',
          startsOn: day('2026-11-01'),
          endsOn: day('2026-11-30'),
          status: 'CALCULATED',
          entries: [
            {
              id: 'e1',
              grossMinor: 3000,
              deductionsMinor: 1000,
              bonusesMinor: 500,
              netMinor: 2500,
              status: 'OPEN',
              payoutReference: null,
              teacher: { id: 't1', user: { name: 'Ali', email: 'a@x.com' } },
              lines: [{}, {}],
            },
          ],
        })),
      },
    };
    const service = new PayrollService(prisma as never, { record: jest.fn() } as never);
    const report = await service.periodReport('p');
    expect(report.entries[0]).toEqual({
      id: 'e1',
      teacher: 'Ali',
      teacherId: 't1',
      grossMinor: 3000,
      deductionsMinor: 1000,
      bonusesMinor: 500,
      netMinor: 2500,
      status: 'OPEN',
      payoutReference: null,
      lineCount: 2,
    });
    // The row figures agree with the totals the report already returned.
    expect(report.totals).toEqual({ gross: 3000, deductions: 1000, bonuses: 500, net: 2500 });
  });
});
