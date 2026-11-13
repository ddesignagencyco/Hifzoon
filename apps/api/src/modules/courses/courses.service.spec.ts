import { CoursesService } from './courses.service';

const ADMIN = { actorUserId: 'admin-1', actorRoles: ['ADMIN'] };

function build(options: { existing?: Record<string, unknown> | null; booked?: number } = {}) {
  const prisma = {
    student: { findUnique: jest.fn(async () => ({ id: 's1', displayName: 'Amina' })) },
    course: {
      findUnique: jest.fn(async () => ({
        id: 'c1',
        name: 'Noorani Qaida',
        levels: [{ id: 'l1' }],
      })),
    },
    enrolment: {
      findFirst: jest.fn(async () =>
        options.existing === undefined
          ? { id: 'e1', status: 'TRIAL', teacherId: null, currentLevelId: 'l1' }
          : options.existing,
      ),
      update: jest.fn(async ({ data }: { data: { status: string } }) => ({
        id: 'e1',
        status: data.status,
        course: { id: 'c1', code: 'QAIDA', name: 'Noorani Qaida' },
      })),
      create: jest.fn(async () => ({ id: 'e2', status: 'TRIAL', course: {} })),
      findUnique: jest.fn(async () => ({
        student: {
          displayName: 'Amina',
          userId: 'child-user',
          family: { members: [{ userId: 'g1' }, { userId: 'g2' }] },
        },
      })),
    },
    teacherProfile: {
      findUnique: jest.fn(async () => ({ user: { name: 'Ustadha Maryam' } })),
    },
    classStudent: { count: jest.fn(async () => options.booked ?? 0) },
  };
  const policies = {
    assertStudentAccess: jest.fn(async () => undefined),
    assertTeacherMatchable: jest.fn(async () => undefined),
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 3 })) };
  const service = new CoursesService(prisma as never, policies as never, notifications as never);
  return { service, prisma, notifications };
}

describe('CoursesService.createEnrolment — teacher assigned to a trial with no time', () => {
  it('tells the guardians and the child that the teacher is set and the time is coming', async () => {
    const { service, notifications } = build();
    await service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      teacherId: 't1',
      status: 'TRIAL' as never,
      ...ADMIN,
    });

    expect(notifications.enqueue).toHaveBeenCalledWith({
      userIds: ['g1', 'g2', 'child-user'],
      template: 'trial.teacher-assigned',
      data: { studentName: 'Amina', teacherName: 'Ustadha Maryam', course: 'Noorani Qaida' },
    });
  });

  it('says nothing when a trial class is already booked (the booking notice covered it)', async () => {
    const { service, notifications } = build({ booked: 1 });
    await service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      teacherId: 't1',
      status: 'TRIAL' as never,
      ...ADMIN,
    });
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('says nothing when the trial already had a teacher, or it became a regular enrolment', async () => {
    const changed = build({
      existing: { id: 'e1', status: 'TRIAL', teacherId: 't0', currentLevelId: 'l1' },
    });
    await changed.service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      teacherId: 't1',
      status: 'TRIAL' as never,
      ...ADMIN,
    });
    expect(changed.notifications.enqueue).not.toHaveBeenCalled();

    const upgraded = build();
    await upgraded.service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      teacherId: 't1',
      status: 'ACTIVE' as never,
      ...ADMIN,
    });
    expect(upgraded.notifications.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the assignment when the notice fails', async () => {
    const { service, notifications } = build();
    notifications.enqueue.mockRejectedValueOnce(new Error('queue down'));
    await expect(
      service.createEnrolment({
        studentId: 's1',
        courseId: 'c1',
        teacherId: 't1',
        status: 'TRIAL' as never,
        ...ADMIN,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'e1', status: 'TRIAL' }));
  });
});

describe('CoursesService.createEnrolment — SEC-02 a guardian can never set the status', () => {
  const GUARDIAN = { actorUserId: 'g1', actorRoles: ['GUARDIAN'] };

  it('forces a fresh guardian enrolment to TRIAL even when ACTIVE is posted', async () => {
    const { service, prisma } = build({ existing: null });
    await service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      status: 'ACTIVE' as never,
      ...GUARDIAN,
    });
    expect(prisma.enrolment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'TRIAL' }) }),
    );
  });

  it('keeps a guardian trial-upgrade on TRIAL even when ACTIVE is posted', async () => {
    const { service } = build({
      existing: { id: 'e1', status: 'TRIAL', teacherId: 't0', currentLevelId: 'l1' },
    });
    const result = await service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      status: 'ACTIVE' as never,
      ...GUARDIAN,
    });
    expect(result.status).toBe('TRIAL');
  });

  it('still lets staff set the status they asked for', async () => {
    const { service, prisma } = build({ existing: null });
    await service.createEnrolment({
      studentId: 's1',
      courseId: 'c1',
      status: 'ACTIVE' as never,
      ...ADMIN,
    });
    expect(prisma.enrolment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }),
    );
  });
});

describe('CoursesService.updateEnrolmentStatus — SEC-02 state machine, SEC-03 one transaction', () => {
  function buildUpdate(options: {
    current: string;
    updateCount?: number;
    memberUserId?: string;
  }) {
    const state = {
      newStatus: options.current,
      classStudentUpdated: false,
      classSessionUpdated: false,
    };
    const tx = {
      enrolment: {
        updateMany: jest.fn(async ({ data }: { data: { status: string } }) => {
          state.newStatus = data.status;
          return { count: options.updateCount ?? 1 };
        }),
        findUniqueOrThrow: jest.fn(async () => ({
          id: 'e1',
          status: state.newStatus,
          pausedUntil: null,
        })),
      },
      classStudent: {
        updateMany: jest.fn(async () => {
          state.classStudentUpdated = true;
          return { count: 0 };
        }),
      },
      classSession: {
        updateMany: jest.fn(async () => {
          state.classSessionUpdated = true;
          return { count: 0 };
        }),
      },
    };
    const prisma = {
      enrolment: {
        findUnique: jest.fn(async () => ({
          id: 'e1',
          status: options.current,
          student: {
            id: 's1',
            displayName: 'Amina',
            family: {
              id: 'f1',
              members: options.memberUserId ? [{ userId: options.memberUserId }] : [],
            },
          },
          course: { name: 'Noorani Qaida' },
          teacher: null,
        })),
      },
      $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(tx)),
    };
    const policies = { assertStudentAccess: jest.fn(async () => undefined) };
    const notifications = { enqueue: jest.fn(async () => ({ queued: 0 })) };
    const service = new CoursesService(prisma as never, policies as never, notifications as never);
    return { service, prisma, tx, state };
  }

  it('allows a live transition (ACTIVE → PAUSED) and withdraws future classes in the same tx', async () => {
    const { service, state, prisma } = buildUpdate({ current: 'ACTIVE' });
    const result = await service.updateEnrolmentStatus({
      enrolmentId: 'e1',
      status: 'PAUSED' as never,
      actorUserId: 'admin-1',
      actorRoles: ['ADMIN'],
    });
    expect(result.status).toBe('PAUSED');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(state.classStudentUpdated).toBe(true);
    expect(state.classSessionUpdated).toBe(true);
  });

  it('forbids reviving a terminal enrolment (CANCELLED → ACTIVE), even for staff', async () => {
    const { service } = buildUpdate({ current: 'CANCELLED' });
    await expect(
      service.updateEnrolmentStatus({
        enrolmentId: 'e1',
        status: 'ACTIVE' as never,
        actorUserId: 'admin-1',
        actorRoles: ['ADMIN'],
      }),
    ).rejects.toThrow(/cannot move from CANCELLED to ACTIVE/);
  });

  it('forbids COMPLETED → TRIAL', async () => {
    const { service } = buildUpdate({ current: 'COMPLETED' });
    await expect(
      service.updateEnrolmentStatus({
        enrolmentId: 'e1',
        status: 'TRIAL' as never,
        actorUserId: 'admin-1',
        actorRoles: ['ADMIN'],
      }),
    ).rejects.toThrow(/cannot move from COMPLETED to TRIAL/);
  });

  it('is race-safe: a conditional update that matched nothing is a conflict', async () => {
    const { service, state } = buildUpdate({ current: 'ACTIVE', updateCount: 0 });
    await expect(
      service.updateEnrolmentStatus({
        enrolmentId: 'e1',
        status: 'PAUSED' as never,
        actorUserId: 'admin-1',
        actorRoles: ['ADMIN'],
      }),
    ).rejects.toThrow(/changed by someone else/);
    // The calendar withdrawal never runs when the claim failed.
    expect(state.classStudentUpdated).toBe(false);
  });

  it('lets a guardian cancel their own child’s live enrolment', async () => {
    const { service } = buildUpdate({ current: 'ACTIVE', memberUserId: 'g1' });
    const result = await service.updateEnrolmentStatus({
      enrolmentId: 'e1',
      status: 'CANCELLED' as never,
      actorUserId: 'g1',
      actorRoles: ['GUARDIAN'],
    });
    expect(result.status).toBe('CANCELLED');
  });
});
