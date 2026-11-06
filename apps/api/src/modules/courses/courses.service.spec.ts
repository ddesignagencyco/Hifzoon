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
