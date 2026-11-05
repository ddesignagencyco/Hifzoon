import { MistakesService, type MarkMistakeInput } from './mistakes.service';

const BASE: MarkMistakeInput = {
  classId: 'class-1',
  studentId: 'student-1',
  surah: 1,
  ayah: 2,
  wordIndex: 0,
  type: 'SKIPPED_WORD' as never,
  actorUserId: 'teacher-user',
  actorRoles: ['TEACHER'],
};

function build(
  options: {
    startsAt?: Date;
    joined?: number;
    card?: { id: string; submittedAt: Date | null; lockedAt: Date | null } | null;
    existing?: { source: string; lockedAt: Date | null };
    courseType?: string;
  } = {},
) {
  const prisma = {
    classStudent: { count: jest.fn(async () => 1) },
    lessonCard: { findFirst: jest.fn(async () => options.card ?? null) },
    classSession: {
      findUnique: jest.fn(async () => ({
        startsAt: options.startsAt ?? new Date(Date.now() - 10 * 60_000),
        course: { type: options.courseType ?? 'HIFZ' },
      })),
    },
    familyMember: { findMany: jest.fn(async () => [{ userId: 'guardian-1' }]) },
    classParticipant: { count: jest.fn(async () => options.joined ?? 1) },
    mistake: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'm1',
        ...data,
      })),
      findUnique: jest.fn(async () => ({
        id: 'm1',
        studentId: 'student-1',
        confirmed: false,
        dismissedAt: null,
        source: options.existing?.source ?? 'AI',
        lessonCard: options.existing ? { lockedAt: options.existing.lockedAt } : null,
      })),
      update: jest.fn(async () => ({ id: 'm1' })),
    },
  };
  const policies = {
    assertStudentAccess: jest.fn(async () => undefined),
    assertClassControl: jest.fn(async () => undefined),
  };
  const service = new MistakesService(prisma as never, policies as never);
  return { service, prisma };
}

describe('MistakesService.mark live-class rules (M50)', () => {
  it('refuses a mistake before the class has started', async () => {
    const { service, prisma } = build({ startsAt: new Date(Date.now() + 30 * 60_000) });
    await expect(service.mark(BASE)).rejects.toThrow(/has not started/);
    expect(prisma.mistake.create).not.toHaveBeenCalled();
  });

  it('refuses a mistake when nobody on the student side has joined', async () => {
    const { service, prisma } = build({ joined: 0 });
    await expect(service.mark(BASE)).rejects.toThrow(/has not joined/);
    expect(prisma.mistake.create).not.toHaveBeenCalled();
  });

  it('accepts a mistake once the class has started and the student side has joined', async () => {
    const { service, prisma } = build();
    await expect(service.mark(BASE)).resolves.toBeDefined();
    expect(prisma.mistake.create).toHaveBeenCalled();
  });

  it('counts the student themself or a guardian of that student, and no one else', async () => {
    const { service, prisma } = build();
    await service.mark(BASE);

    expect(prisma.classParticipant.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          classId: 'class-1',
          OR: [
            { role: 'STUDENT', studentId: 'student-1' },
            { role: 'GUARDIAN_VIEWER', userId: { in: ['guardian-1'] } },
          ],
        },
      }),
    );
  });

  it('lets staff correct a record outside a live class', async () => {
    const { service, prisma } = build({ startsAt: new Date(Date.now() + 60 * 60_000), joined: 0 });
    await expect(service.mark({ ...BASE, actorRoles: ['SUPERVISOR'] })).resolves.toBeDefined();
    // The live-class checks (who has joined) are skipped for staff.
    expect(prisma.classParticipant.count).not.toHaveBeenCalled();
  });
});

describe('MistakesService mistakes per course', () => {
  it('logs a Qaida mistake against its lesson item, with no surah or ayah', async () => {
    const { service, prisma } = build({ courseType: 'QAIDA' });
    await service.mark({
      classId: 'class-1',
      studentId: 'student-1',
      type: 'LETTER_RECOGNITION' as never,
      itemRef: 'Single letters: ث',
      actorUserId: 'teacher-user',
      actorRoles: ['TEACHER'],
    });
    expect(prisma.mistake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ surah: null, ayah: null, itemRef: 'Single letters: ث' }),
      }),
    );
  });

  it('refuses a Mushaf category on a Qaida class, and a Qaida mistake with nothing to point at', async () => {
    const { service } = build({ courseType: 'QAIDA' });
    await expect(service.mark({ ...BASE, type: 'STOP_WAQF' as never })).rejects.toThrow(
      /not a mistake type for this course/,
    );
    await expect(
      service.mark({
        classId: 'class-1',
        studentId: 'student-1',
        type: 'OTHER' as never,
        actorUserId: 'teacher-user',
        actorRoles: ['TEACHER'],
      }),
    ).rejects.toThrow(/lesson item, or a short note/);
  });

  it('still needs surah, ayah and word on a Mushaf course', async () => {
    const { service } = build({ courseType: 'HIFZ' });
    await expect(service.mark({ ...BASE, surah: undefined })).rejects.toThrow(
      /surah, ayah and word/,
    );
  });
});

describe('MistakesService and the lesson card', () => {
  it('puts a mistake marked after submission on the submitted card', async () => {
    const { service, prisma } = build({
      card: { id: 'card-1', submittedAt: new Date(), lockedAt: null },
    });
    await service.mark(BASE);
    expect(prisma.mistake.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lessonCardId: 'card-1' }) }),
    );
  });

  it('refuses a new mistake once the card is locked', async () => {
    const { service, prisma } = build({
      card: { id: 'card-1', submittedAt: new Date(), lockedAt: new Date() },
    });
    await expect(service.mark(BASE)).rejects.toThrow(/locked/);
    expect(prisma.mistake.create).not.toHaveBeenCalled();
  });

  it('confirms AI flags only, and changes nothing on a locked card', async () => {
    const subject = { userId: 'teacher-user', roles: ['TEACHER'] };
    await expect(
      build({ existing: { source: 'CLASS', lockedAt: null } }).service.confirm('m1', subject),
    ).rejects.toThrow(/Only practice/);
    await expect(
      build({ existing: { source: 'AI', lockedAt: new Date() } }).service.confirm('m1', subject),
    ).rejects.toThrow(/locked/);
    await expect(
      build({ existing: { source: 'CLASS', lockedAt: new Date() } }).service.dismiss('m1', subject),
    ).rejects.toThrow(/locked/);
  });
});

describe('MistakesService.listForClass (R7)', () => {
  function buildList(options: { controls: boolean; ownStudents: string[] }) {
    const prisma = {
      classStudent: {
        findMany: jest.fn(async () => [{ studentId: 'child-1' }, { studentId: 'child-2' }]),
      },
      mistake: { findMany: jest.fn(async () => []) },
    };
    const policies = {
      assertClassControl: jest.fn(async () => {
        if (!options.controls) throw new Error('not owner');
      }),
      assertStudentAccess: jest.fn(async (_subject: unknown, studentId: string) => {
        if (!options.ownStudents.includes(studentId)) throw new Error('not owner');
      }),
    };
    const service = new MistakesService(prisma as never, policies as never);
    return { service, prisma, policies };
  }

  const guardian = { userId: 'guardian-1', roles: ['GUARDIAN'] };

  it('gives the class teacher every mistake in the class', async () => {
    const { service, prisma } = buildList({ controls: true, ownStudents: [] });
    await service.listForClass('class-1', { userId: 'teacher-user', roles: ['TEACHER'] });

    expect(prisma.mistake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: 'class-1' } }),
    );
  });

  it("gives a guardian only their own child's mistakes", async () => {
    const { service, prisma, policies } = buildList({ controls: false, ownStudents: ['child-2'] });
    await service.listForClass('class-1', guardian);

    expect(policies.assertStudentAccess).toHaveBeenCalledWith(guardian, 'child-1', 'self');
    expect(prisma.mistake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { classId: 'class-1', studentId: { in: ['child-2'] } } }),
    );
  });

  it('refuses someone with no child on the class', async () => {
    const { service, prisma } = buildList({ controls: false, ownStudents: [] });
    await expect(service.listForClass('class-1', guardian)).rejects.toMatchObject({
      code: 'NOT_RESOURCE_OWNER',
    });
    expect(prisma.mistake.findMany).not.toHaveBeenCalled();
  });
});
