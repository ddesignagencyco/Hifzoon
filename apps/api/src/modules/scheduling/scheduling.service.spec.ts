import { ErrorCode } from '@hifzoon/shared';

import { SchedulingService } from './scheduling.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PolicyService } from '../../common/services/policy.service';
import type { ClassReminderService } from '../notifications/class-reminder.service';
import type { ScheduleMaterialiser } from './schedule-materialiser.service';
import type { SettingsService } from '../settings/settings.service';
import type { NotificationsService } from '../notifications/notifications.service';

const TEACHER = {
  subjects: ['HIFZ', 'NAZRA'],
  user: { timeZone: 'Europe/London' },
  // Mon–Fri 16:00–20:00 London, stored as UTC instants.
  availability: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startTime: new Date('2026-01-01T16:00:00.000Z'),
    endTime: new Date('2026-01-01T20:00:00.000Z'),
  })),
  schedules: [],
};

function buildHarness(options: { teacher?: unknown; courseCode?: string } = {}) {
  const state = { sessionCreates: 0 };

  const prisma = {
    course: { findUnique: jest.fn(async () => ({ code: options.courseCode ?? 'HIFZ' })) },
    teacherProfile: {
      findUnique: jest.fn(async () => options.teacher ?? TEACHER),
    },
    consent: { findFirst: jest.fn(async () => ({ id: 'consent-1' })) },
    student: { findUnique: jest.fn(async () => ({ birthYear: 2015 })) },
    classSession: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.sessionCreates += 1;
        return { id: 'class-1', ...data };
      }),
    },
    classStudent: { create: jest.fn(async () => ({})) },
    enrolment: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'enrolment-1' })),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  } as unknown as PrismaService;

  const policies = {
    assertStudentAccess: jest.fn(async () => undefined),
    assertTeacherMatchable: jest.fn(async () => undefined),
  } as unknown as PolicyService;

  const reminders = { planForClass: jest.fn(async () => undefined) } as unknown as ClassReminderService;
  const materialiser = {} as unknown as ScheduleMaterialiser;
  const settings = {
    getNumber: jest.fn(async () => 4),
  } as unknown as SettingsService;
  const notifications = {
    guardiansForClass: jest.fn(async () => []),
    enqueue: jest.fn(async () => ({ queued: 0 })),
  } as unknown as NotificationsService;

  return {
    service: new SchedulingService(
      prisma,
      policies,
      reminders,
      materialiser,
      settings,
      notifications,
    ),
    state,
    prisma,
  };
}

const BOOKING = {
  teacherId: 'teacher-1',
  courseId: 'course-1',
  studentId: 'student-1',
  startsAt: new Date('2026-03-04T17:00:00.000Z'), // Wednesday 17:00 London
  durationMinutes: 60,
  roomType: 'ONE_TO_ONE' as const,
  type: 'TRIAL' as const,
  actorUserId: 'user-1',
  actorRoles: ['GUARDIAN'] as string[],
};

describe('SchedulingService.bookSlot (FR-SCH-03, B26, B27)', () => {
  it('books a slot inside the teacher’s availability', async () => {
    const { service, state } = buildHarness();

    await service.bookSlot(BOOKING);

    expect(state.sessionCreates).toBe(1);
  });

  describe('B26 — the teacher must teach the course', () => {
    it('refuses a teacher who does not list the course code as a subject', async () => {
      const { service, state } = buildHarness({ courseCode: 'QAIDA' });

      await expect(service.bookSlot(BOOKING)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_FAILED,
        details: { field: 'teacherId' },
      });
      expect(state.sessionCreates).toBe(0);
    });

    it('accepts a teacher who already teaches that course, whatever their subjects say', async () => {
      const { service } = buildHarness({
        courseCode: 'QAIDA',
        teacher: {
          ...TEACHER,
          schedules: [{ enrolment: { courseId: 'course-1' } }],
        },
      });

      await expect(service.bookSlot(BOOKING)).resolves.toMatchObject({ id: 'class-1' });
    });
  });

  describe('B27 — the slot must sit inside the availability', () => {
    it('refuses a time outside the window, on a weekday the teacher works', async () => {
      const { service, state } = buildHarness();

      await expect(
        service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-04T03:00:00.000Z') }),
      ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
      expect(state.sessionCreates).toBe(0);
    });

    it('refuses a weekend even when the clock time would otherwise fit', async () => {
      const { service } = buildHarness();

      await expect(
        service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-07T17:00:00.000Z') }),
      ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
    });

    it('refuses a class that would run past the end of the window', async () => {
      const { service } = buildHarness();

      await expect(
        service.bookSlot({
          ...BOOKING,
          startsAt: new Date('2026-03-04T19:30:00.000Z'),
          durationMinutes: 60,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
    });

    it('judges the time in the teacher’s own zone, not the request’s', async () => {
      // 23:30 UTC on Wednesday is 23:30 in London — still outside. 00:30 UTC on Thursday
      // is 00:30 Thursday in London — also outside. Both must be refused whatever a client
      // believed the local time to be.
      const { service } = buildHarness();

      await expect(
        service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-04T23:30:00.000Z') }),
      ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
      await expect(
        service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-05T00:30:00.000Z') }),
      ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
    });
  });

  describe('B28 — a trial booking creates the enrolment', () => {
    it('links the class student to a new TRIAL enrolment', async () => {
      const { service, prisma } = buildHarness();

      await service.bookSlot(BOOKING);

      expect(prisma.enrolment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'TRIAL', teacherId: 'teacher-1' }),
        }),
      );
      expect(prisma.classStudent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ enrolmentId: 'enrolment-1' }) }),
      );
    });
  });
});