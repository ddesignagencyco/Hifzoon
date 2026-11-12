import { QaService } from './qa.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function buildService(classTeacherUserId: string, assigned = true) {
  const prisma = {
    classSession: {
      findUnique: jest.fn(async () => ({
        id: 'class-1',
        teacherId: 'tp-1',
        teacher: { userId: classTeacherUserId },
      })),
    },
    qaRubric: { findUnique: jest.fn(async () => ({ criteria: { items: [] } })) },
    qaReview: { create: jest.fn(async () => ({ id: 'review-1' })) },
    supervisorAssignment: { count: jest.fn(async () => (assigned ? 1 : 0)) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new QaService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    {} as never,
  );
  return { service, prisma };
}

describe('QaService.submitReview', () => {
  it('refuses a reviewer grading a class they taught', async () => {
    const { service, prisma } = buildService('user-both');
    await expect(
      service.submitReview({
        classId: 'class-1',
        supervisorId: 'user-both',
        rubricId: 'r',
        scores: {},
      }),
    ).rejects.toThrow(/cannot review a class you taught/);
    expect(prisma.qaReview.create).not.toHaveBeenCalled();
  });

  it('lets a different supervisor review it', async () => {
    const { service, prisma } = buildService('user-teacher');
    await service.submitReview({
      classId: 'class-1',
      supervisorId: 'user-supervisor',
      rubricId: 'r',
      scores: {},
    });
    expect(prisma.qaReview.create).toHaveBeenCalled();
  });

  it('refuses a scoped supervisor reviewing a teacher who is not on their caseload', async () => {
    const { service, prisma } = buildService('user-teacher', false);
    await expect(
      service.submitReview({
        classId: 'class-1',
        supervisorId: 'user-supervisor',
        supervisorRoles: ['SUPERVISOR'],
        rubricId: 'r',
        scores: {},
      }),
    ).rejects.toThrow(/caseload/);
    expect(prisma.qaReview.create).not.toHaveBeenCalled();
  });

  it('lets an admin review any teacher', async () => {
    const { service } = buildService('user-teacher', false);
    await expect(
      service.submitReview({
        classId: 'class-1',
        supervisorId: 'user-admin',
        supervisorRoles: ['SUPERVISOR', 'ADMIN'],
        rubricId: 'r',
        scores: {},
      }),
    ).resolves.toBeDefined();
  });
});

describe('QaService.sampleForPeriod — random draw (medium)', () => {
  function sampler(ids: string[]) {
    const createMany = jest.fn(async () => ({ count: 2 }));
    const prisma = {
      qaSample: { findMany: jest.fn(async () => []), createMany },
      classSession: { findMany: jest.fn(async () => ids.map((id) => ({ id }))) },
    };
    const service = new QaService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { getNumber: jest.fn(async () => 2) } as never,
    );
    return { service, createMany, prisma };
  }

  it('draws from the whole eligible pool, not just the most recent classes', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const seen = new Set<string>();
    for (let run = 0; run < 40; run++) {
      const { service, createMany } = sampler(ids);
      await service.sampleForPeriod('t1', new Date('2026-11-20T00:00:00Z'));
      for (const row of (
        createMany.mock.calls[0] as unknown as [{ data: { classId: string }[] }]
      )[0].data) {
        seen.add(row.classId);
      }
    }
    // The old code always took the first two; a real draw reaches far more of the pool.
    expect(seen.size).toBeGreaterThan(10);
  });

  it('samples exactly the configured number', async () => {
    const { service, createMany } = sampler(['a', 'b', 'c', 'd']);
    await service.sampleForPeriod('t1');
    const data = (createMany.mock.calls[0] as unknown as [{ data: unknown[] }])[0].data;
    expect(data).toHaveLength(2);
  });
});

describe('QaService — monthly sampling job', () => {
  it('draws only from the month being sampled', async () => {
    const findMany = jest.fn(async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const prisma = {
      qaSample: {
        findMany: jest.fn(async () => []),
        createMany: jest.fn(async () => ({ count: 2 })),
      },
      classSession: { findMany },
    };
    const service = new QaService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { getNumber: jest.fn(async () => 2) } as never,
    );
    // The job's reference: the last instant of October.
    await service.sampleForPeriod('t1', new Date('2026-10-31T23:59:59.999Z'));
    const where = (findMany.mock.calls[0] as unknown as [{ where: any }])[0].where;
    expect(where.startsAt.gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(where.startsAt.lt).toEqual(new Date('2026-10-31T23:59:59.999Z'));
    const created = (prisma.qaSample.createMany.mock.calls[0] as unknown as [{ data: any[] }])[0]
      .data;
    expect(created.every((r) => r.period === '2026-10')).toBe(true);
  });

  it('samples every matchable teacher and survives one failing', async () => {
    const teachers = [{ id: 't1' }, { id: 't2' }];
    const prisma = {
      teacherProfile: {
        findMany: jest.fn(async (args: any) => (args.cursor ? [] : teachers)),
      },
      qaSample: {
        findMany: jest.fn(async () => {
          throw new Error('boom');
        }),
      },
    };
    const service = new QaService(
      prisma as unknown as PrismaService,
      { record: jest.fn() } as unknown as AuditService,
      { getNumber: jest.fn(async () => 2) } as never,
    );
    const spy = jest.spyOn(service, 'sampleForPeriod');
    spy.mockResolvedValueOnce({
      period: 'p',
      sampled: [],
      created: 2,
      alreadySampled: false,
    } as never);
    spy.mockRejectedValueOnce(new Error('boom'));
    const result = await service.sampleAllTeachers(new Date('2026-10-31T23:59:59.999Z'));
    expect(result).toEqual({ teachers: 2, created: 2, failed: 1 });
  });
});
