import { AdmissionsService } from './admissions.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PolicyService } from '../../common/services/policy.service';
import type { AuditService } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ClassReminderService } from '../notifications/class-reminder.service';

/**
 * "Ask the academy to choose a teacher": the family's request is a teacherless TRIAL
 * enrolment, and the office answers it with an ordinary trial booking (POST /trials). The
 * booking has to land on that same enrolment, give it the teacher, and tell the family.
 */
function build(existingTrial: { id: string; teacherId: string | null; classes: unknown[] }) {
  const prisma = {
    student: {
      findUnique: jest.fn(async () => ({
        id: 'student-1',
        displayName: 'Maryam',
        language: 'en',
        gender: 'FEMALE',
        familyId: 'family-1',
      })),
    },
    course: { findUnique: jest.fn(async () => ({ id: 'course-1', code: 'HIFZ', active: true })) },
    enrolment: {
      findFirst: jest.fn(async (args: { where?: { status?: unknown } }) =>
        args?.where?.status === 'TRIAL' ? existingTrial : null,
      ),
      create: jest.fn(async () => ({ id: 'enrolment-new' })),
      update: jest.fn(async () => ({})),
    },
    classSession: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'class-1',
        ...args.data,
      })),
      findUnique: jest.fn(async () => ({
        startsAt: new Date('2031-03-04T17:00:00.000Z'),
        teacher: { user: { name: 'Ustadha Aisha' } },
        students: [
          {
            student: {
              displayName: 'Maryam',
              timeZone: 'Europe/London',
              userId: 'student-user',
              family: {
                timeZone: 'Europe/London',
                members: [{ userId: 'guardian-1' }, { userId: 'guardian-2' }],
              },
            },
          },
        ],
      })),
    },
    classStudent: { create: jest.fn(async () => ({})) },
    teacherProfile: { findMany: jest.fn(async () => []) },
    lead: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  } as unknown as PrismaService;
  const notifications = {
    enqueue: jest.fn(async () => ({ queued: 1 })),
  } as unknown as NotificationsService;
  const service = new AdmissionsService(
    prisma,
    {} as unknown as PolicyService,
    { record: jest.fn(async () => undefined) } as unknown as AuditService,
    {
      getBoolean: jest.fn(async () => true),
      getNumber: jest.fn(async () => 30),
    } as unknown as SettingsService,
    undefined,
    notifications,
    { planForClass: jest.fn(async () => undefined) } as unknown as ClassReminderService,
  );
  return { service, prisma, notifications };
}

const BOOKING = {
  studentId: 'student-1',
  courseId: 'course-1',
  teacherId: 'teacher-1',
  actorId: 'staff-1',
  startsAt: new Date('2031-03-04T17:00:00.000Z'),
};

describe('AdmissionsService.bookTrial answers a family’s "choose a teacher for us"', () => {
  it('books onto the teacherless TRIAL enrolment and gives it the teacher', async () => {
    const { service, prisma } = build({ id: 'trial-1', teacherId: null, classes: [] });

    await service.bookTrial(BOOKING);

    expect(prisma.enrolment.create).not.toHaveBeenCalled();
    expect(prisma.enrolment.update).toHaveBeenCalledWith({
      where: { id: 'trial-1' },
      data: { teacherId: 'teacher-1' },
    });
    expect(prisma.classStudent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enrolmentId: 'trial-1' }) }),
    );
  });

  it('leaves a TRIAL enrolment that already has a teacher alone', async () => {
    const { service, prisma } = build({ id: 'trial-1', teacherId: 'teacher-9', classes: [] });

    await service.bookTrial(BOOKING);

    expect(prisma.enrolment.update).not.toHaveBeenCalled();
  });

  it('tells the guardians and the student’s own login, once each', async () => {
    const { service, notifications } = build({ id: 'trial-1', teacherId: null, classes: [] });

    await service.bookTrial(BOOKING);

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'trial.booked-by-academy',
        userIds: ['guardian-1', 'guardian-2', 'student-user'],
        data: expect.objectContaining({ studentName: 'Maryam', teacherName: 'Ustadha Aisha' }),
      }),
    );
  });
});
