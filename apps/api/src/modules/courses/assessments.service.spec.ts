import { ErrorCode } from '@hifzoon/shared';

import { AssessmentsService, computeAssessmentScore, effectiveRubric } from './assessments.service';

const RUBRIC = { Tajweed: 50, Fluency: 30, Memorisation: 20 };

function build(
  options: {
    teacherUserId?: string;
    level?: Partial<{
      id: string;
      name: string;
      position: number;
      passMark: number;
      rubric: unknown;
    }>;
    nextLevel?: { id: string; name: string; position: number } | null;
  } = {},
) {
  const level = {
    id: 'level-1',
    name: 'Level 1',
    position: 1,
    passMark: 70,
    rubric: RUBRIC,
    ...options.level,
  };
  const prisma = {
    enrolment: {
      findUnique: jest.fn(async () => ({
        id: 'enr-1',
        courseId: 'course-1',
        currentLevelId: level.id,
        currentLessonPosition: 12,
        teacher: { userId: options.teacherUserId ?? 'teacher-1' },
        course: { name: 'Noorani Qaida' },
        student: { id: 'student-1', displayName: 'Maryam', familyId: 'family-1' },
      })),
      update: jest.fn(async () => ({})),
    },
    courseLevel: {
      findUnique: jest.fn(async () => level),
      findFirst: jest.fn(async () =>
        options.nextLevel === undefined
          ? { id: 'level-2', name: 'Level 2', position: 2 }
          : options.nextLevel,
      ),
    },
    assessment: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'a-1',
        ...data,
      })),
    },
    familyMember: { findMany: jest.fn(async () => [{ userId: 'guardian-1' }]) },
  };
  const tx = {
    ...prisma,
    $transaction: jest.fn(async (work: (t: unknown) => Promise<unknown>) => work(prisma)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const service = new AssessmentsService(
    tx as never,
    { assertStudentAccess: jest.fn(async () => undefined) } as never,
    audit as never,
    notifications as never,
  );
  return { service, prisma, audit, notifications };
}

const TEACHER = { actorUserId: 'teacher-1', actorRoles: ['TEACHER'] };

describe('computeAssessmentScore', () => {
  it('weights each criterion by the rubric', () => {
    // 80*0.5 + 60*0.3 + 100*0.2 = 40 + 18 + 20
    expect(
      computeAssessmentScore(RUBRIC, { Tajweed: 80, Fluency: 60, Memorisation: 100 }).score,
    ).toBe(78);
  });

  it('rounds to one decimal place', () => {
    expect(computeAssessmentScore({ A: 1, B: 2 }, { A: 70, B: 70.1 }).score).toBe(70.1);
    expect(computeAssessmentScore({ A: 1, B: 1, C: 1 }, { A: 100, B: 100, C: 0 }).score).toBe(66.7);
  });

  it('refuses a missing criterion, an unknown one and a score out of range', () => {
    expect(() => computeAssessmentScore(RUBRIC, { Tajweed: 80, Fluency: 60 })).toThrow(
      /Memorisation/,
    );
    expect(() =>
      computeAssessmentScore(RUBRIC, { Tajweed: 80, Fluency: 60, Memorisation: 90, Extra: 1 }),
    ).toThrow(/not in this rubric/);
    expect(() =>
      computeAssessmentScore(RUBRIC, { Tajweed: 101, Fluency: 60, Memorisation: 90 }),
    ).toThrow(/0 to 100/);
  });

  it('marks a level with no rubric as one overall score', () => {
    expect(effectiveRubric(null)).toEqual({ Overall: 100 });
    expect(computeAssessmentScore(effectiveRubric(null), { Overall: 64 }).score).toBe(64);
  });
});

describe('AssessmentsService.record', () => {
  it('passes at the pass mark and moves the enrolment to lesson 1 of the next level', async () => {
    const { service, prisma, audit, notifications } = build();

    const result = await service.record({
      enrolmentId: 'enr-1',
      rubricScores: { Tajweed: 70, Fluency: 70, Memorisation: 70 },
      ...TEACHER,
    });

    expect(result.assessment).toMatchObject({ result: 'PASS', score: 70, levelId: 'level-1' });
    expect(result.advancedTo).toMatchObject({ id: 'level-2' });
    expect(prisma.enrolment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { currentLevelId: 'level-2', currentLessonPosition: 1 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'crs.assessment.level-passed',
        after: expect.objectContaining({ levelId: 'level-2', lessonPosition: 1 }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['guardian-1'],
        template: 'course.level-passed',
        data: expect.objectContaining({ levelName: 'Level 1', score: 70 }),
      }),
    );
  });

  it('records a fail without moving the enrolment or telling the family', async () => {
    const { service, prisma, notifications } = build();

    const result = await service.record({
      enrolmentId: 'enr-1',
      rubricScores: { Tajweed: 60, Fluency: 90, Memorisation: 50 },
      ...TEACHER,
    });

    expect(result.assessment).toMatchObject({ result: 'FAIL', score: 67 });
    expect(result.advancedTo).toBeNull();
    expect(prisma.courseLevel.findFirst).not.toHaveBeenCalled();
    expect(prisma.enrolment.update).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('keeps a pass on the last level where it is', async () => {
    const { service, prisma, notifications } = build({ nextLevel: null });

    const result = await service.record({
      enrolmentId: 'enr-1',
      rubricScores: { Tajweed: 90, Fluency: 90, Memorisation: 90 },
      ...TEACHER,
    });

    expect(result).toMatchObject({ advancedTo: null, finalLevel: true });
    expect(prisma.enrolment.update).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextStep: expect.stringMatching(/last level/) }),
      }),
    );
  });

  it('does not move the level on a passed milestone assessment', async () => {
    const { service, prisma } = build();

    await service.record({
      enrolmentId: 'enr-1',
      type: 'MILESTONE_JUZ' as never,
      rubricScores: { Tajweed: 90, Fluency: 90, Memorisation: 90 },
      ...TEACHER,
    });

    expect(prisma.enrolment.update).not.toHaveBeenCalled();
  });

  it('refuses a teacher who does not teach this enrolment', async () => {
    const { service, prisma } = build({ teacherUserId: 'someone-else' });

    await expect(
      service.record({
        enrolmentId: 'enr-1',
        rubricScores: { Tajweed: 90, Fluency: 90, Memorisation: 90 },
        ...TEACHER,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect(prisma.assessment.create).not.toHaveBeenCalled();
  });
});

describe('AssessmentsService — exams assigned to an examiner', () => {
  const examiner = { status: 'ACTIVE', deletedAt: null, roles: [{ role: 'EXAMINER' }] };

  function build(over: Record<string, any> = {}) {
    const prisma: Record<string, any> = {
      enrolment: {
        findUnique: jest.fn(async () => ({
          id: 'e1',
          status: 'ACTIVE',
          courseId: 'co',
          currentLevelId: 'l1',
          course: { name: 'Hifz' },
          student: { id: 's', displayName: 'Maryam', familyId: 'f' },
          currentLevel: { name: 'Level 1' },
        })),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(async () => examiner) },
      assessment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'a1', ...data })),
        findUnique: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUniqueOrThrow: jest.fn(async () => ({ id: 'a1', result: 'PASS' })),
        update: jest.fn(),
        delete: jest.fn(),
      },
      courseLevel: {
        findUnique: jest.fn(async () => ({
          id: 'l1',
          name: 'L1',
          position: 1,
          passMark: 70,
          rubric: null,
        })),
        findFirst: jest.fn(async () => ({ id: 'l2', name: 'L2', position: 2 })),
      },
      ...over,
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
    const svc = new AssessmentsService(
      prisma as never,
      {} as never,
      { record: jest.fn() } as never,
      notifications as never,
    );
    return { svc, prisma, notifications };
  }

  it('assigns a pending exam at the current level and tells the examiner', async () => {
    const { svc, prisma, notifications } = build();
    await svc.assign(
      { enrolmentId: 'e1', examinerId: 'x1', type: 'MILESTONE_JUZ' as never },
      'admin',
    );
    expect(prisma.assessment.create.mock.calls[0]?.[0].data).toMatchObject({
      levelId: 'l1',
      examinerId: 'x1',
      result: 'PENDING',
      assignedById: 'admin',
    });
    expect(notifications.enqueue).toHaveBeenCalled();
  });

  it('refuses a non-examiner, a duplicate pending exam and an inactive enrolment', async () => {
    await expect(
      build({
        user: { findUnique: jest.fn(async () => ({ ...examiner, roles: [{ role: 'TEACHER' }] })) },
      }).svc.assign({ enrolmentId: 'e1', examinerId: 'x1', type: 'IJAZAH' as never }, 'a'),
    ).rejects.toThrow(/not an examiner/);
    const dup = build();
    dup.prisma.assessment.findFirst.mockResolvedValueOnce({ id: 'old' });
    await expect(
      dup.svc.assign({ enrolmentId: 'e1', examinerId: 'x1', type: 'IJAZAH' as never }, 'a'),
    ).rejects.toThrow(/already assigned/);
    const paused = build();
    paused.prisma.enrolment.findUnique.mockResolvedValueOnce({
      id: 'e1',
      status: 'PAUSED',
      currentLevelId: 'l1',
      course: { name: 'x' },
      student: { displayName: 'y' },
      currentLevel: { name: 'z' },
    });
    await expect(
      paused.svc.assign({ enrolmentId: 'e1', examinerId: 'x1', type: 'IJAZAH' as never }, 'a'),
    ).rejects.toThrow(/PAUSED/);
  });

  it('only the assigned examiner may record the result', async () => {
    const { svc, prisma } = build();
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'l1',
      type: 'MILESTONE_JUZ',
      examinerId: 'x1',
      result: 'PENDING',
    });
    await expect(
      svc.recordAssigned('a1', { rubricScores: { Overall: 90 } }, 'someone-else', ['EXAMINER']),
    ).rejects.toThrow(/another examiner/);
  });

  it('records a passing result, and does not move the child for a milestone exam', async () => {
    const { svc, prisma } = build();
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'l1',
      type: 'MILESTONE_JUZ',
      examinerId: 'x1',
      result: 'PENDING',
    });
    const r = await svc.recordAssigned('a1', { rubricScores: { Overall: 90 } }, 'x1', ['EXAMINER']);
    expect(prisma.assessment.updateMany.mock.calls[0]?.[0].data).toMatchObject({
      result: 'PASS',
      score: 90,
    });
    expect(r.advancedTo).toBeNull();
    expect(prisma.enrolment.update).not.toHaveBeenCalled();
  });

  it('a passed LEVEL exam advances the child, but only if still on that level', async () => {
    const level = build();
    level.prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'l1',
      type: 'LEVEL',
      examinerId: 'x1',
      result: 'PENDING',
    });
    await level.svc.recordAssigned('a1', { rubricScores: { Overall: 90 } }, 'x1', ['EXAMINER']);
    expect(level.prisma.enrolment.update).toHaveBeenCalled();

    const moved = build();
    moved.prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'old-level',
      type: 'LEVEL',
      examinerId: 'x1',
      result: 'PENDING',
    });
    moved.prisma.courseLevel.findUnique.mockResolvedValue({
      id: 'old-level',
      name: 'Old',
      position: 1,
      passMark: 70,
      rubric: null,
    });
    await moved.svc.recordAssigned('a1', { rubricScores: { Overall: 90 } }, 'x1', ['EXAMINER']);
    expect(moved.prisma.enrolment.update).not.toHaveBeenCalled();
  });

  it('a second submission loses the race with a conflict', async () => {
    const { svc, prisma } = build();
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'l1',
      type: 'LEVEL',
      examinerId: 'x1',
      result: 'PENDING',
    });
    prisma.assessment.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      svc.recordAssigned('a1', { rubricScores: { Overall: 90 } }, 'x1', ['EXAMINER']),
    ).rejects.toThrow(/already been recorded/);
  });

  it('cannot withdraw or reassign an exam that was already taken', async () => {
    const { svc, prisma } = build();
    prisma.assessment.findUnique.mockResolvedValue({
      id: 'a1',
      enrolmentId: 'e1',
      levelId: 'l1',
      type: 'LEVEL',
      examinerId: 'x1',
      result: 'PASS',
    });
    await expect(svc.cancelAssigned('a1', 'a')).rejects.toThrow(/already been taken/);
    await expect(svc.reassign('a1', { scheduledFor: null }, 'a')).rejects.toThrow(
      /already been taken/,
    );
  });
});
