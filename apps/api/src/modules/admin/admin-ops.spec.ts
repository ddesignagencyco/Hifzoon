import { AdminFamiliesService } from './admin-families.service';
import {
  buildChurnSeries,
  buildCompletionSeries,
  buildRevenueSeries,
  buildUtilisation,
} from './admin-analytics.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('analytics series', () => {
  it('revenue nets refunds per bucket and currency', () => {
    const rows = buildRevenueSeries(
      [
        { bucket: d('2026-10-01'), currency: 'USD', minor: 10_000n },
        { bucket: d('2026-11-01'), currency: 'USD', minor: 5_000n },
      ],
      [{ bucket: d('2026-10-01'), currency: 'USD', minor: 1_500n }],
    );
    expect(rows).toEqual([
      {
        bucket: '2026-10-01',
        currency: 'USD',
        grossMinor: 10_000,
        refundedMinor: 1_500,
        netMinor: 8_500,
      },
      {
        bucket: '2026-11-01',
        currency: 'USD',
        grossMinor: 5_000,
        refundedMinor: 0,
        netMinor: 5_000,
      },
    ]);
  });

  it('completion rate counts only finished classes', () => {
    const rows = buildCompletionSeries([
      { bucket: d('2026-11-01'), status: 'COMPLETED', n: 8n },
      { bucket: d('2026-11-01'), status: 'NO_SHOW_TEACHER', n: 1n },
      { bucket: d('2026-11-01'), status: 'CANCELLED_FAMILY', n: 1n },
    ]);
    expect(rows[0]).toMatchObject({ finished: 10, completionRate: 0.8 });
  });

  it('churn is cancellations over the opening count, never above 100%, null with none', () => {
    const rows = buildChurnSeries(
      [{ bucket: d('2026-11-01'), n: 5n }],
      [
        { bucket: d('2026-10-01'), n: 0n },
        { bucket: d('2026-11-01'), n: 4n },
      ],
    );
    expect(rows[0]?.churnRate).toBeNull();
    expect(rows[1]).toMatchObject({ cancelled: 5, churnRate: 1 });
  });

  it('utilisation is taught ÷ offered, capped at 1, with an overall figure', () => {
    const r = buildUtilisation(
      ['a', 'b', 'c'],
      new Map([
        ['a', 'Ali'],
        ['b', 'Bilal'],
      ]),
      new Map([
        ['a', 300],
        ['b', 900],
      ]),
      new Map([
        ['a', 600],
        ['b', 300],
      ]),
      7,
    );
    expect(r.teachers.find((t) => t.teacherId === 'a')?.utilisation).toBe(0.5);
    expect(r.teachers.find((t) => t.teacherId === 'b')?.utilisation).toBe(1);
    expect(r.teachers.find((t) => t.teacherId === 'c')?.utilisation).toBeNull();
    expect(r.overall).toBe(1); // 1200 taught of 900 offered, capped
  });
});

describe('AdminFamiliesService.update', () => {
  function svc(current: unknown) {
    const update = jest.fn(async ({ data }: { data: unknown }) => data);
    const prisma = {
      family: { findUnique: jest.fn(async () => current), update },
      student: { findUnique: jest.fn(async () => current), update },
    };
    const audit = { record: jest.fn() };
    return { s: new AdminFamiliesService(prisma as never, audit as never), update, audit };
  }
  const fam = { id: 'f', name: 'Khan', country: 'GB', timeZone: 'UTC', billingName: null };

  it('validates and records only what changed', async () => {
    const { s, update, audit } = svc(fam);
    await s.updateFamily('f', { timeZone: 'Europe/London', country: 'gb' }, 'admin');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'f' },
      data: { timeZone: 'Europe/London', country: 'GB' },
    });
    expect(audit.record).toHaveBeenCalled();
  });

  it('rejects an unknown zone, a bad country and a too-short name', async () => {
    const { s } = svc(fam);
    await expect(s.updateFamily('f', { timeZone: 'Mars/Base' }, 'a')).rejects.toThrow(/time zone/);
    await expect(s.updateFamily('f', { country: 'GBR' }, 'a')).rejects.toThrow(/2-letter/);
    await expect(s.updateFamily('f', { name: ' ' }, 'a')).rejects.toThrow(/name/);
  });

  it('keeps a child’s notes out of the audit log', async () => {
    const { s, audit } = svc({
      id: 's',
      displayName: 'A',
      birthYear: 2018,
      gender: 'MALE',
      language: 'en',
      mushafLayout: 'MADANI_15',
    });
    await s.updateStudent('s', { notes: 'private detail' }, 'admin');
    expect(JSON.stringify((audit.record.mock.calls[0] as unknown[])[0])).not.toContain(
      'private detail',
    );
  });

  it('rejects an implausible birth year', async () => {
    const { s } = svc({ id: 's' });
    await expect(s.updateStudent('s', { birthYear: 1800 }, 'a')).rejects.toThrow(/plausible/);
  });
});
