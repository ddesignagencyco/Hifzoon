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
