import { QaInsightsService, validateCriteria } from './qa-insights.service';

const admin = { userId: 'admin', roles: ['SUPER_ADMIN'] };
const supervisor = { userId: 'sup', roles: ['SUPERVISOR'] };

function build(over: Record<string, any> = {}) {
  const prisma: Record<string, any> = {
    supervisorAssignment: { findMany: jest.fn(async () => [{ teacherId: 't1' }]) },
    qaSample: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    qaReview: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findUnique: jest.fn(),
    },
    qaRubric: {
      findUnique: jest.fn(),
      update: jest.fn(async () => ({ id: 'r1', name: 'N', active: true })),
      updateMany: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'r2', ...data })),
      findMany: jest.fn(async () => []),
    },
    ...over,
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  return { svc: new QaInsightsService(prisma as never, { record: jest.fn() } as never), prisma };
}

describe('QaInsightsService — queue and reviews', () => {
  it('shows a scoped supervisor only their teachers, and never their own classes', async () => {
    const { svc, prisma } = build();
    await svc.reviewQueue(supervisor);
    const where = prisma.qaSample.findMany.mock.calls[0][0].where;
    expect(where.teacherId).toEqual({ in: ['t1'] });
    expect(where.class.qaReviews).toEqual({ none: {} });
    expect(where.class.teacher).toEqual({ userId: { not: 'sup' } });
  });

  it('an admin is unscoped', async () => {
    const { svc, prisma } = build();
    await svc.reviewQueue(admin);
    expect(prisma.qaSample.findMany.mock.calls[0][0].where.teacherId).toBeUndefined();
    expect(prisma.supervisorAssignment.findMany).not.toHaveBeenCalled();
  });

  it('refuses a teacher filter outside the caseload', async () => {
    const { svc } = build();
    await expect(svc.reviewQueue(supervisor, { teacherId: 'other' })).rejects.toThrow(/caseload/);
    await expect(svc.listReviews(supervisor, { teacherId: 'other' })).rejects.toThrow(/caseload/);
  });

  it('a review of a teacher outside the caseload reads as not found', async () => {
    const { svc } = build({
      qaReview: {
        findUnique: jest.fn(async () => ({
          id: 'v',
          scores: {},
          reviewedAt: new Date(),
          source: 'MANUAL',
          supervisor: { id: 's', name: 'S' },
          class: {
            id: 'c',
            startsAt: new Date(),
            course: { name: 'Hifz' },
            teacher: { id: 'other', user: { name: 'T' } },
          },
          rubric: { id: 'r', name: 'R', criteria: { items: [] } },
        })),
      },
    });
    await expect(svc.getReview(supervisor, 'v')).rejects.toThrow(/Review/);
  });

  it('labels each score with its rubric criterion', async () => {
    const { svc } = build({
      qaReview: {
        findUnique: jest.fn(async () => ({
          id: 'v',
          scores: { opening: 4, pacing: 2 },
          feedback: 'Good',
          teacherReply: 'Thanks',
          reviewedAt: new Date(),
          source: 'MANUAL',
          supervisor: { id: 's', name: 'S' },
          class: {
            id: 'c',
            startsAt: new Date(),
            course: { name: 'Hifz' },
            teacher: { id: 't1', user: { name: 'T' } },
          },
          rubric: {
            id: 'r',
            name: 'R',
            criteria: {
              items: [
                { key: 'opening', label: 'Opened well', weight: 1 },
                { key: 'pacing', label: 'Pace', weight: 2 },
              ],
            },
          },
        })),
      },
    });
    const r = await svc.getReview(supervisor, 'v');
    expect(r.criteria).toEqual([
      { key: 'opening', label: 'Opened well', weight: 1, score: 4 },
      { key: 'pacing', label: 'Pace', weight: 2, score: 2 },
    ]);
    expect(r.average).toBe(3);
    expect(r.hasReply).toBe(true);
  });
});

describe('QaInsightsService — rubric', () => {
  const good = [{ key: 'opening', label: 'Opened well', weight: 2 }];

  it('validates criteria', () => {
    expect(validateCriteria(good)).toEqual(good);
    expect(() => validateCriteria([])).toThrow(/between 1 and 20/);
    expect(() => validateCriteria([{ key: 'Bad Key', label: 'Label', weight: 1 }])).toThrow(
      /lowercase/,
    );
    expect(() => validateCriteria([...good, ...good])).toThrow(/twice/);
    expect(() => validateCriteria([{ key: 'ok_key', label: 'x', weight: 1 }])).toThrow(/label/);
    expect(() => validateCriteria([{ key: 'ok_key', label: 'Label', weight: 9 }])).toThrow(
      /weight/,
    );
  });

  it('will not change the criteria of a rubric that reviews already use', async () => {
    const { svc } = build({
      qaRubric: {
        findUnique: jest.fn(async () => ({ id: 'r1', _count: { reviews: 4 } })),
        update: jest.fn(),
      },
    });
    await expect(svc.updateRubric('r1', { criteria: good }, 'a')).rejects.toThrow(/new version/);
  });

  it('allows a rename of a used rubric', async () => {
    const { svc, prisma } = build({
      qaRubric: {
        findUnique: jest.fn(async () => ({ id: 'r1', _count: { reviews: 4 } })),
        update: jest.fn(async () => ({ id: 'r1', name: 'Renamed', active: true })),
      },
    });
    await svc.updateRubric('r1', { name: 'Renamed' }, 'a');
    expect(prisma.qaRubric.update).toHaveBeenCalled();
  });

  it('activating one rubric deactivates the others', async () => {
    const { svc, prisma } = build({
      qaRubric: {
        findUnique: jest.fn(async () => ({ id: 'r1' })),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
    });
    await svc.activateRubric('r1', 'a');
    expect(prisma.qaRubric.updateMany).toHaveBeenCalledWith({
      where: { id: { not: 'r1' } },
      data: { active: false },
    });
  });
});

describe('QaInsightsService — metrics', () => {
  it('computes ratios with their counts and keeps student no-shows out of attendance', async () => {
    const { svc } = build({
      teacherProfile: {
        findUnique: jest.fn(async () => ({ id: 't', userId: 'u', user: { name: 'Ali' } })),
      },
      classSession: {
        groupBy: jest.fn(async () => [
          { status: 'COMPLETED', _count: { _all: 8 } },
          { status: 'NO_SHOW_TEACHER', _count: { _all: 1 } },
          { status: 'CANCELLED_TEACHER', _count: { _all: 1 } },
          { status: 'NO_SHOW_STUDENT', _count: { _all: 5 } },
        ]),
      },
      enrolment: {
        groupBy: jest.fn(async () => [
          { status: 'ACTIVE', _count: { _all: 3 } },
          { status: 'CANCELLED', _count: { _all: 1 } },
        ]),
      },
      lessonPortion: {
        groupBy: jest.fn(async () => [
          { grade: 'EXCELLENT', _count: { _all: 6 } },
          { grade: 'NEEDS_WORK', _count: { _all: 2 } },
        ]),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ total: 8n, on_time: 6n, late_minutes: 1.25 }])
        .mockResolvedValueOnce([{ completed: 8n, with_card: 4n }]),
    });
    const m = await svc.teacherMetrics(admin, 't');
    expect(m.attendance.rate).toBe(0.8); // 8 / (8 + 1 + 1), not counting the 5 student no-shows
    expect(m.punctuality).toMatchObject({ onTime: 6, classes: 8, rate: 0.75 });
    expect(m.lessonCards.rate).toBe(0.5);
    expect(m.retention).toMatchObject({ stillEnrolled: 3, enrolmentsBeforeWindow: 4, rate: 0.75 });
    expect(m.progress).toMatchObject({ gradedPortions: 8, goodShare: 0.75 });
  });

  it('returns null rates, not zero, when there is nothing to measure', async () => {
    const { svc } = build({
      teacherProfile: {
        findUnique: jest.fn(async () => ({ id: 't', userId: 'u', user: { name: 'A' } })),
      },
      classSession: { groupBy: jest.fn(async () => []) },
      enrolment: { groupBy: jest.fn(async () => []) },
      lessonPortion: { groupBy: jest.fn(async () => []) },
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    });
    const m = await svc.teacherMetrics(admin, 't');
    expect(m.attendance.rate).toBeNull();
    expect(m.punctuality.rate).toBeNull();
    expect(m.progress.goodShare).toBeNull();
  });

  it('a scoped supervisor cannot read an unassigned teacher', async () => {
    const { svc } = build();
    await expect(svc.teacherMetrics(supervisor, 'other')).rejects.toThrow(/Teacher/);
  });
});
