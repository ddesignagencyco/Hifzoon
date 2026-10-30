import { ErrorCode } from '@hifzoon/shared';
import { DateTime } from 'luxon';

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
  availabilityMonths: [],
  leaves: [],
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

  const reminders = {
    planForClass: jest.fn(async () => undefined),
  } as unknown as ClassReminderService;
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
describe('SchedulingService.studentTimetable (M49)', () => {
  it("queries by the caller's own user id and never by a supplied student id", async () => {
    const { service, prisma } = buildHarness();
    const findMany = jest.fn(async () => []);
    (prisma.classSession as unknown as { findMany: unknown }).findMany = findMany;

    await service.studentTimetable(
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-08T00:00:00Z'),
      'Asia/Karachi',
      { userId: 'student-user-1', roles: ['STUDENT'] },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          students: { some: { student: { userId: 'student-user-1' } } },
        }),
      }),
    );
  });

  it('returns the family-timetable row shape with the time in the viewer zone', async () => {
    const { service, prisma } = buildHarness();
    (prisma.classSession as unknown as { findMany: unknown }).findMany = jest.fn(async () => [
      {
        id: 'class-1',
        status: 'SCHEDULED',
        startsAt: new Date('2026-03-04T11:00:00Z'),
        endsAt: new Date('2026-03-04T12:00:00Z'),
      },
    ]);

    const [row] = await service.studentTimetable(
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-08T00:00:00Z'),
      'Asia/Karachi',
      { userId: 'student-user-1', roles: ['STUDENT'] },
    );

    expect(row).toMatchObject({ canRate: false, rated: false, viewerZone: 'Asia/Karachi' });
    expect(row.localStart).toContain('16:00:00');
  });

  it('rejects an invalid range', async () => {
    const { service } = buildHarness();
    await expect(
      service.studentTimetable(new Date('nope'), new Date(), 'UTC', {
        userId: 'u',
        roles: ['STUDENT'],
      }),
    ).rejects.toThrow(/valid ISO dates/);
  });
});

describe('SchedulingService.cancelSession keeps the class on timetables (B29, B38)', () => {
  function buildCancel() {
    const harness = buildHarness();
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    Object.assign(harness.prisma.classSession, {
      findUnique: jest.fn(async () => ({
        id: 'class-1',
        startsAt: new Date(Date.now() + 48 * 3_600_000),
        endsAt: new Date(Date.now() + 49 * 3_600_000),
        status: 'SCHEDULED',
        teacherId: 't1',
        teacher: { userId: 'teacher-user' },
        schedule: null,
        students: [{ studentId: 's1', student: { familyId: 'f1', displayName: 'Yusuf' } }],
      })),
      update: jest.fn(async () => ({})),
    });
    Object.assign(harness.prisma.classStudent, { updateMany, deleteMany });
    // cancelSession passes an array of operations rather than a callback.
    (harness.prisma as unknown as { $transaction: unknown }).$transaction = jest.fn(
      async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    );
    Object.assign(harness.prisma, {
      makeupCredit: { createMany: jest.fn(async () => ({ count: 1 })) },
    });
    (harness.service as unknown as { policies: Record<string, unknown> }).policies = {
      assertGuardianOwnsStudent: jest.fn(async () => undefined),
    };
    (harness.service as unknown as { reminders: unknown }).reminders = {
      cancelForClass: jest.fn(async () => ({ removed: true })),
    };
    const notifications = (harness.service as unknown as { notifications: { enqueue: jest.Mock } })
      .notifications;
    return { ...harness, updateMany, deleteMany, notifications };
  }

  it('releases the student slot instead of deleting the class_student rows', async () => {
    const { service, updateMany, deleteMany } = buildCancel();

    await service.cancelSession({
      classId: 'class-1',
      reason: 'Unwell',
      actorUserId: 'parent-1',
      roles: ['GUARDIAN'],
    });

    expect(deleteMany).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { classId: 'class-1' },
      data: { active: false },
    });
  });

  it('tells the teacher when the family cancels', async () => {
    const { service, notifications } = buildCancel();

    await service.cancelSession({
      classId: 'class-1',
      reason: 'Unwell',
      actorUserId: 'parent-1',
      roles: ['GUARDIAN'],
    });

    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['teacher-user'],
        data: expect.objectContaining({ cancelledBy: 'the family' }),
      }),
    );
  });
});

describe('availability written in another time zone (M14)', () => {
  // Mon-Fri 21:00-23:00 in Karachi, for a teacher whose profile zone is London.
  const KARACHI_TEACHER = {
    ...TEACHER,
    availability: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startTime: new Date('1970-01-01T21:00:00.000Z'),
      endTime: new Date('1970-01-01T23:00:00.000Z'),
      timeZone: 'Asia/Karachi',
    })),
  };

  it('judges a booking in the zone the slot was written in', async () => {
    const { service } = buildHarness({ teacher: KARACHI_TEACHER });

    // Wednesday 17:00Z is 22:00 in Karachi (inside 21:00-23:00) but 17:00 in London.
    await expect(
      service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-04T17:00:00.000Z') }),
    ).resolves.toMatchObject({ id: 'class-1' });
  });

  it('refuses a time that fits the teacher profile zone but not the slot zone', async () => {
    const { service } = buildHarness({ teacher: KARACHI_TEACHER });

    // 21:30Z is 02:30 the next day in Karachi, outside the window.
    await expect(
      service.bookSlot({ ...BOOKING, startsAt: new Date('2026-03-04T21:30:00.000Z') }),
    ).rejects.toMatchObject({ code: ErrorCode.SLOT_UNAVAILABLE });
  });

  describe('setAvailability', () => {
    function build(profileZone = 'Europe/London') {
      const harness = buildHarness();
      const createMany = jest.fn(async () => ({ count: 1 }));
      Object.assign(harness.prisma, {
        availabilitySlot: {
          deleteMany: jest.fn(async () => ({})),
          createMany,
          findMany: jest.fn(async () => []),
        },
      });
      (harness.prisma as unknown as { $transaction: unknown }).$transaction = jest.fn(
        async (ops: Array<Promise<unknown>>) => Promise.all(ops),
      );
      (harness.prisma.teacherProfile as unknown as { findUnique: jest.Mock }).findUnique = jest
        .fn()
        .mockResolvedValue({
          id: 't1',
          userId: 'teacher-user',
          user: { name: 'Ustadh', timeZone: profileZone },
          availability: [],
        });
      return { ...harness, createMany };
    }

    const base = {
      teacherId: 't1',
      slots: [{ weekday: 1, startTime: '21:00', endTime: '23:00' }],
      actorUserId: 'teacher-user',
      actorRoles: ['TEACHER'],
    };

    it('stores the chosen zone on each slot', async () => {
      const { service, createMany } = build();
      await service.setAvailability({ ...base, timeZone: 'Asia/Karachi' });

      expect(createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ timeZone: 'Asia/Karachi' })],
      });
    });

    it("defaults to the teacher's own zone", async () => {
      const { service, createMany } = build('Europe/London');
      await service.setAvailability(base);

      expect(createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ timeZone: 'Europe/London' })],
      });
    });

    it('refuses a zone that is not an IANA name', async () => {
      const { service } = build();
      await expect(service.setAvailability({ ...base, timeZone: 'Mars/Olympus' })).rejects.toThrow(
        /not a valid IANA time zone/,
      );
    });
  });
});

describe('monthly availability + leave (point 1, Oct 2026)', () => {
  function buildMonthlyHarness(profileZone = 'Europe/London') {
    const harness = buildHarness();
    const availabilityCreateMany = jest.fn(async () => ({ count: 1 }));
    const availabilityDeleteMany = jest.fn(async () => ({ count: 0 }));
    const availabilityFindMany = jest.fn(async () => []);
    const leaveCreateMany = jest.fn(async () => ({ count: 1 }));
    const leaveDeleteMany = jest.fn(async () => ({ count: 0 }));
    const leaveFindMany = jest.fn(async () => []);
    const monthUpsert = jest.fn(async () => ({}));
    const monthFindUnique = jest.fn(async () => null);

    Object.assign(harness.prisma, {
      availabilitySlot: {
        deleteMany: availabilityDeleteMany,
        createMany: availabilityCreateMany,
        findMany: availabilityFindMany,
      },
      teacherLeave: {
        deleteMany: leaveDeleteMany,
        createMany: leaveCreateMany,
        findMany: leaveFindMany,
      },
      teacherAvailabilityMonth: { upsert: monthUpsert, findUnique: monthFindUnique },
    });
    (harness.prisma as unknown as { $transaction: unknown }).$transaction = jest.fn(
      (ops: Array<Promise<unknown>>) => Promise.all(ops),
    );
    (harness.prisma.teacherProfile as unknown as { findUnique: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue({
        id: 't1',
        userId: 'teacher-user',
        user: { name: 'Ustadh', timeZone: profileZone },
      });

    return {
      ...harness,
      availabilityCreateMany,
      availabilityDeleteMany,
      leaveCreateMany,
      leaveDeleteMany,
      monthUpsert,
    };
  }

  describe('setAvailabilityForMonth', () => {
    const base = {
      teacherId: 't1',
      month: '2026-11',
      slots: [{ weekday: 1, startTime: '16:00', endTime: '20:00' }],
      actorUserId: 'teacher-user',
      actorRoles: ['TEACHER'],
    };

    it('scopes the replaced rows to the given month only', async () => {
      const { service, availabilityDeleteMany, availabilityCreateMany, monthUpsert } =
        buildMonthlyHarness();

      await service.setAvailabilityForMonth(base);

      expect(availabilityDeleteMany).toHaveBeenCalledWith({
        where: {
          teacherId: 't1',
          effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
          effectiveTo: new Date('2026-11-30T00:00:00.000Z'),
        },
      });
      expect(availabilityCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
            effectiveTo: new Date('2026-11-30T00:00:00.000Z'),
          }),
        ],
      });
      expect(monthUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teacherId_month: { teacherId: 't1', month: new Date('2026-11-01T00:00:00.000Z') },
          },
        }),
      );
    });

    it('refuses a malformed month', async () => {
      const { service } = buildMonthlyHarness();
      await expect(service.setAvailabilityForMonth({ ...base, month: '2026-13' })).rejects.toThrow(
        /YYYY-MM/,
      );
    });

    it('a non-owning teacher is refused', async () => {
      const { service } = buildMonthlyHarness();
      await expect(
        service.setAvailabilityForMonth({ ...base, actorUserId: 'someone-else' }),
      ).rejects.toThrow();
    });
  });

  describe('setLeaveForMonth', () => {
    const base = {
      teacherId: 't1',
      month: '2026-11',
      days: [{ date: '2026-11-05', reason: 'Eid' }],
      actorUserId: 'teacher-user',
      actorRoles: ['TEACHER'],
    };

    it('scopes the replaced leave rows to the given month and writes the given days', async () => {
      const { service, leaveDeleteMany, leaveCreateMany } = buildMonthlyHarness();

      await service.setLeaveForMonth(base);

      expect(leaveDeleteMany).toHaveBeenCalledWith({
        where: {
          teacherId: 't1',
          date: {
            gte: new Date('2026-11-01T00:00:00.000Z'),
            lte: new Date('2026-11-30T00:00:00.000Z'),
          },
        },
      });
      expect(leaveCreateMany).toHaveBeenCalledWith({
        data: [{ teacherId: 't1', date: new Date('2026-11-05T00:00:00.000Z'), reason: 'Eid' }],
      });
    });

    it('refuses a day outside the given month', async () => {
      const { service } = buildMonthlyHarness();
      await expect(
        service.setLeaveForMonth({ ...base, days: [{ date: '2026-12-01' }] }),
      ).rejects.toThrow(/outside 2026-11/);
    });

    it('an empty month clears leave without calling createMany', async () => {
      const { service, leaveCreateMany, leaveDeleteMany } = buildMonthlyHarness();
      await service.setLeaveForMonth({ ...base, days: [] });
      expect(leaveDeleteMany).toHaveBeenCalled();
      expect(leaveCreateMany).not.toHaveBeenCalled();
    });
  });
});

describe('findOpenSlots excludes declared leave days (point 1, Oct 2026)', () => {
  function buildOpenSlotsHarness(leaves: Array<{ date: Date }>) {
    const teacher = {
      id: 'teacher-1',
      subjects: ['HIFZ'],
      user: { name: 'Ustadh', timeZone: 'Europe/London' },
      // Every weekday 16:00-20:00 London.
      availability: [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: new Date('1970-01-01T16:00:00.000Z'),
        endTime: new Date('1970-01-01T20:00:00.000Z'),
        timeZone: 'Europe/London',
      })),
      availabilityMonths: [],
      schedules: [],
      leaves,
    };
    const prisma = {
      teacherProfile: { findMany: jest.fn(async () => [teacher]) },
      classSession: { findMany: jest.fn(async () => []) },
    } as unknown as PrismaService;
    const policies = {} as unknown as PolicyService;
    const reminders = {} as unknown as ClassReminderService;
    const materialiser = {} as unknown as ScheduleMaterialiser;
    const settings = {} as unknown as SettingsService;
    const notifications = {} as unknown as NotificationsService;
    return new SchedulingService(
      prisma,
      policies,
      reminders,
      materialiser,
      settings,
      notifications,
    );
  }

  // A Mon–Fri window well in the future, so the ">2 hours from now" filter never trims it.
  const from = new Date('2031-03-03T00:00:00.000Z'); // Monday
  const to = new Date('2031-03-07T00:00:00.000Z'); // Friday

  it('offers slots on a normal working day', async () => {
    const service = buildOpenSlotsHarness([]);
    const slots = await service.findOpenSlots({ from, to, visitorZone: 'Europe/London' });
    expect(slots.length).toBeGreaterThan(0);
  });

  it('offers nothing on a day the teacher declared as leave', async () => {
    // Every weekday in the window is leave, so no slot should be offered at all.
    const days = ['03', '04', '05', '06', '07'];
    const service = buildOpenSlotsHarness(
      days.map((d) => ({ date: new Date(`2031-03-${d}T00:00:00.000Z`) })),
    );
    const slots = await service.findOpenSlots({ from, to, visitorZone: 'Europe/London' });
    expect(slots).toHaveLength(0);
  });
});

function bareService(prisma: unknown, policies: unknown = {}) {
  return new SchedulingService(
    prisma as PrismaService,
    policies as PolicyService,
    {} as unknown as ClassReminderService,
    {} as unknown as ScheduleMaterialiser,
    {} as unknown as SettingsService,
    {} as unknown as NotificationsService,
  );
}

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00.000Z`);

describe('weekly availability leaves month rows alone (R1)', () => {
  const WEEKLY = {
    id: 'weekly-1',
    weekday: 1,
    startTime: time('16:00'),
    endTime: time('20:00'),
    timeZone: 'Europe/London',
    effectiveFrom: utc('2026-10-01'),
    effectiveTo: null,
  };
  const MONTH = {
    id: 'month-1',
    weekday: 2,
    startTime: time('09:00'),
    endTime: time('11:00'),
    timeZone: 'Europe/London',
    effectiveFrom: utc('2026-11-01'),
    effectiveTo: utc('2026-11-30'),
  };
  // A weekly save with an explicit end date is still part of the weekly pattern.
  const BOUNDED_WEEKLY = {
    ...WEEKLY,
    id: 'weekly-2',
    effectiveFrom: utc('2026-11-05'),
    effectiveTo: utc('2026-12-20'),
  };

  function build() {
    const deleteMany = jest.fn(async () => ({}));
    const prisma = {
      teacherProfile: {
        findUnique: jest.fn(async () => ({
          id: 't1',
          userId: 'teacher-user',
          user: { name: 'Ustadh', timeZone: 'Europe/London' },
          availability: [WEEKLY, MONTH, BOUNDED_WEEKLY],
        })),
      },
      availabilitySlot: {
        findMany: jest.fn(async () => [WEEKLY, MONTH, BOUNDED_WEEKLY]),
        deleteMany,
        createMany: jest.fn(async () => ({ count: 1 })),
      },
      $transaction: jest.fn((ops: Array<Promise<unknown>>) => Promise.all(ops)),
    };
    return { service: bareService(prisma), deleteMany };
  }

  it('deletes only the weekly rows when the weekly pattern is saved', async () => {
    const { service, deleteMany } = build();
    await service.setAvailability({
      teacherId: 't1',
      slots: [{ weekday: 1, startTime: '16:00', endTime: '20:00' }],
      actorUserId: 'teacher-user',
      actorRoles: ['TEACHER'],
    });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { teacherId: 't1', id: { in: ['weekly-1', 'weekly-2'] } },
    });
  });

  it('reads back only the weekly pattern', async () => {
    const { service } = build();
    const result = await service.getAvailability('t1', {
      userId: 'teacher-user',
      roles: ['TEACHER'],
    });

    expect(result.slots.map((s) => s.weekday)).toEqual([1, 1]);
  });
});

describe('findOpenSlots combines month hours with the weekly pattern (R5, R6)', () => {
  const weekdays = [1, 2, 3, 4, 5];
  // Weekly Mon–Fri 16:00–20:00 London, open-ended.
  const weekly = weekdays.map((weekday) => ({
    weekday,
    startTime: time('16:00'),
    endTime: time('20:00'),
    timeZone: 'Europe/London',
    effectiveFrom: utc('2031-01-01'),
    effectiveTo: null as Date | null,
  }));
  // March 2031 only: Mon–Fri 09:00–11:00 London.
  const march = weekdays.map((weekday) => ({
    weekday,
    startTime: time('09:00'),
    endTime: time('11:00'),
    timeZone: 'Europe/London',
    effectiveFrom: utc('2031-03-01'),
    effectiveTo: utc('2031-03-31') as Date | null,
  }));

  function search(teacher: {
    availability: typeof weekly;
    availabilityMonths?: Array<{ month: Date }>;
    leaves?: Array<{ date: Date }>;
  }) {
    const prisma = {
      teacherProfile: {
        findMany: jest.fn(async () => [
          {
            id: 'teacher-1',
            subjects: ['HIFZ'],
            user: { name: 'Ustadh', timeZone: 'Europe/London' },
            schedules: [],
            availabilityMonths: [],
            leaves: [],
            ...teacher,
          },
        ]),
      },
      classSession: { findMany: jest.fn(async () => []) },
    };
    // Mon 24 Mar – Fri 4 Apr 2031: straddles the end of March.
    return bareService(prisma).findOpenSlots({
      from: utc('2031-03-24'),
      to: utc('2031-04-04'),
      visitorZone: 'Europe/London',
      limit: 10_000,
    });
  }

  const londonDay = (d: Date) => DateTime.fromJSDate(d, { zone: 'Europe/London' }).toISODate()!;
  const londonHour = (d: Date) => DateTime.fromJSDate(d, { zone: 'Europe/London' }).hour;

  it('uses the month hours inside that month and the weekly pattern outside it', async () => {
    const slots = await search({ availability: [...weekly, ...march] });

    const inMarch = slots.filter((s) => londonDay(s.startsAt) <= '2031-03-31');
    const inApril = slots.filter((s) => londonDay(s.startsAt) >= '2031-04-01');
    expect(inMarch.length).toBeGreaterThan(0);
    expect(inApril.length).toBeGreaterThan(0);
    // March: month rows only (09–11), the weekly 16–20 is replaced.
    expect(inMarch.every((s) => londonHour(s.startsAt) >= 9 && londonHour(s.startsAt) < 11)).toBe(
      true,
    );
    // April: the March rows do not leak; the weekly pattern applies.
    expect(inApril.every((s) => londonHour(s.startsAt) >= 16)).toBe(true);
  });

  it('never offers a month row outside its month', async () => {
    const slots = await search({ availability: march });
    expect(slots.every((s) => londonDay(s.startsAt) <= '2031-03-31')).toBe(true);
    expect(slots.length).toBeGreaterThan(0);
  });

  it('a submitted month with no hours offers nothing that month', async () => {
    const slots = await search({
      availability: weekly,
      availabilityMonths: [{ month: utc('2031-04-01') }],
    });
    expect(slots.some((s) => londonDay(s.startsAt) >= '2031-04-01')).toBe(false);
    expect(slots.some((s) => londonDay(s.startsAt) <= '2031-03-31')).toBe(true);
  });

  it('skips a declared leave day inside a month with its own hours', async () => {
    const slots = await search({
      availability: march,
      leaves: [{ date: utc('2031-03-25') }],
    });
    expect(slots.some((s) => londonDay(s.startsAt) === '2031-03-25')).toBe(false);
    expect(slots.some((s) => londonDay(s.startsAt) === '2031-03-26')).toBe(true);
  });

  it('returns each teacher and start time once, even when rows overlap', async () => {
    const overlapping = weekly.map((row) => ({ ...row, endTime: time('18:00') }));
    const slots = await search({ availability: [...weekly, ...overlapping] });

    const keys = slots.map((s) => `${s.teacherId}|${s.startsAt.toISOString()}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('bookSlot applies the same month and leave rules (R5)', () => {
  // BOOKING is Wednesday 4 March 2026, 17:00 London.
  const weekly = TEACHER.availability.map((row) => ({
    ...row,
    timeZone: 'Europe/London',
    effectiveFrom: utc('2026-01-01'),
    effectiveTo: null as Date | null,
  }));

  it('refuses the weekly pattern in a month that has its own hours', async () => {
    const { service } = buildHarness({
      teacher: {
        ...TEACHER,
        availability: weekly,
        availabilityMonths: [{ month: utc('2026-03-01') }],
      },
    });
    await expect(service.bookSlot(BOOKING)).rejects.toMatchObject({
      code: ErrorCode.SLOT_UNAVAILABLE,
    });
  });

  it('refuses a month row outside its month', async () => {
    const april = weekly.map((row) => ({
      ...row,
      effectiveFrom: utc('2026-04-01'),
      effectiveTo: utc('2026-04-30'),
    }));
    const { service } = buildHarness({ teacher: { ...TEACHER, availability: april } });
    await expect(service.bookSlot(BOOKING)).rejects.toMatchObject({
      code: ErrorCode.SLOT_UNAVAILABLE,
    });
  });

  it('refuses a declared leave day', async () => {
    const { service } = buildHarness({
      teacher: { ...TEACHER, availability: weekly, leaves: [{ date: utc('2026-03-04') }] },
    });
    await expect(service.bookSlot(BOOKING)).rejects.toMatchObject({
      code: ErrorCode.SLOT_UNAVAILABLE,
    });
  });

  it('accepts a month row on a date inside its month', async () => {
    const march = weekly.map((row) => ({
      ...row,
      effectiveFrom: utc('2026-03-01'),
      effectiveTo: utc('2026-03-31'),
    }));
    const { service } = buildHarness({ teacher: { ...TEACHER, availability: march } });
    await expect(service.bookSlot(BOOKING)).resolves.toMatchObject({ id: 'class-1' });
  });
});

describe('suggestTeachers reads this and next month (R14)', () => {
  afterEach(() => jest.useRealTimers());

  it('limits availability to rows in effect over this month and next', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T12:00:00.000Z') });
    const findMany = jest.fn(async () => [
      {
        id: 't1',
        bio: null,
        photoUrl: null,
        gender: null,
        languages: ['en'],
        subjects: ['HIFZ'],
        ageGroups: [],
        ratingAvg: 0,
        ratingCount: 0,
        user: { name: 'Ustadh', timeZone: 'Europe/London' },
        availability: [{ weekday: 3 }, { weekday: 1 }, { weekday: 3 }],
      },
    ]);
    const prisma = {
      student: {
        findUnique: jest.fn(async () => ({ language: 'en', gender: null, birthYear: 2015 })),
      },
      course: { findUnique: jest.fn(async () => ({ code: 'HIFZ', name: 'Hifz' })) },
      teacherProfile: { findMany },
    };
    const service = bareService(prisma, { assertStudentAccess: jest.fn(async () => undefined) });

    const result = await service.suggestTeachers(
      { studentId: 's1', courseId: 'c1' },
      { userId: 'admin', roles: ['ADMIN'] },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          availability: {
            where: {
              effectiveFrom: { lte: utc('2026-11-30') },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: utc('2026-10-01') } }],
            },
            select: { weekday: true },
          },
        }),
      }),
    );
    expect(result.suggestions[0]?.availableWeekdays).toEqual([1, 3]);
  });
});
