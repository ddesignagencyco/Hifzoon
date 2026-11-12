import { SchedulingAdminService } from './scheduling-admin.service';

const future = (hours: number) => new Date(Date.now() + hours * 3_600_000);

function build(over: Record<string, unknown> = {}) {
  const prisma: Record<string, any> = {
    recurringSchedule: {
      findUnique: jest.fn(async () => ({
        id: 's1',
        status: 'ACTIVE',
        startsOn: new Date('2026-11-01T00:00:00Z'),
        endsOn: null,
        familyTimeZone: 'UTC',
      })),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    classSession: {
      findMany: jest.fn(async () => [{ id: 'c1', scheduleId: 's1' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    academyHoliday: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 'h1', ...data })),
      findUnique: jest.fn(),
    },
    substituteOffer: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    teacherProfile: { findMany: jest.fn(async () => []), findUnique: jest.fn() },
    ...over,
  };
  prisma.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
  const materialiser = { materialiseDueSchedules: jest.fn(async () => ({})) };
  const reminders = {
    cancelForClass: jest.fn(async () => ({ removed: true })),
    planForClass: jest.fn(async () => ({ planned: 1 })),
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const service = new SchedulingAdminService(
    prisma as never,
    { record: jest.fn() } as never,
    materialiser as never,
    { getNumber: jest.fn(async () => 60) } as never,
    reminders as never,
    notifications as never,
  );
  return { service, prisma, materialiser, reminders, notifications };
}

describe('SchedulingAdminService — schedules', () => {
  it('pausing removes upcoming unstarted classes and marks the schedule PAUSED', async () => {
    const { service, prisma, reminders } = build();
    await service.pauseSchedule('s1', 'admin');
    expect(prisma.classSession.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] } } });
    expect(reminders.cancelForClass).toHaveBeenCalledWith('c1');
    expect(prisma.recurringSchedule.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'PAUSED', materialisedUntil: null },
    });
  });

  it('only classes that are scheduled, unstarted and in the future are cleared', async () => {
    const { service, prisma } = build();
    await service.pauseSchedule('s1', 'admin');
    const where = prisma.classSession.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'SCHEDULED', startedAt: null, scheduleId: 's1' });
    expect(where.startsAt.gt).toBeInstanceOf(Date);
  });

  it('refuses to pause a schedule that is not active, or resume one that is not paused', async () => {
    const paused = build({
      recurringSchedule: { findUnique: jest.fn(async () => ({ id: 's1', status: 'PAUSED' })) },
    });
    await expect(paused.service.pauseSchedule('s1', 'a')).rejects.toThrow(/only an active/);
    await expect(build().service.resumeSchedule('s1', 'a')).rejects.toThrow(/only a paused/);
  });

  it('resuming regenerates classes', async () => {
    const { service, materialiser } = build({
      recurringSchedule: {
        findUnique: jest.fn(async () => ({ id: 's1', status: 'PAUSED' })),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    });
    await service.resumeSchedule('s1', 'a');
    expect(materialiser.materialiseDueSchedules).toHaveBeenCalled();
  });

  it('refuses to edit an ended schedule or save an unusable rule', async () => {
    const ended = build({
      recurringSchedule: { findUnique: jest.fn(async () => ({ id: 's1', status: 'ENDED' })) },
    });
    await expect(ended.service.updateSchedule('s1', { durationMinutes: 30 }, 'a')).rejects.toThrow(
      /ended/,
    );
    await expect(
      build().service.updateSchedule('s1', { localStartTime: '25:00' }, 'a'),
    ).rejects.toThrow(/HH:MM/);
    await expect(build().service.updateSchedule('s1', { durationMinutes: 5 }, 'a')).rejects.toThrow(
      /between 10 and 180/,
    );
  });
});

describe('SchedulingAdminService — holidays', () => {
  const base = {
    name: 'Eid',
    type: 'HOLIDAY' as const,
    startsOn: new Date('2026-12-24'),
    endsOn: new Date('2026-12-26'),
  };

  it('creating a holiday rebuilds the classes in its range', async () => {
    const { service, materialiser } = build();
    const result = await service.createHoliday(base, 'admin');
    expect(result.classesRebuilt).toBe(1);
    expect(materialiser.materialiseDueSchedules).toHaveBeenCalled();
  });

  it('rejects a backwards range and a Ramadan timetable without a rule', async () => {
    await expect(
      build().service.createHoliday({ ...base, endsOn: new Date('2026-12-20') }, 'a'),
    ).rejects.toThrow(/before it starts/);
    await expect(
      build().service.createHoliday({ ...base, type: 'RAMADAN_TIMETABLE' }, 'a'),
    ).rejects.toThrow(/shiftRule/);
  });

  it('refuses overlapping Ramadan timetables', async () => {
    const { service } = build({
      academyHoliday: {
        findFirst: jest.fn(async () => ({ id: 'x', name: 'Ramadan 1448' })),
        create: jest.fn(),
        findMany: jest.fn(async () => []),
      },
    });
    await expect(
      service.createHoliday(
        { ...base, type: 'RAMADAN_TIMETABLE', shiftRule: { shiftMinutes: -60 } },
        'a',
      ),
    ).rejects.toThrow(/overlaps/);
  });
});

describe('SchedulingAdminService — substitutes', () => {
  function withOffer(offer: Record<string, unknown> | null) {
    return build({
      substituteOffer: {
        findUnique: jest.fn(async () => offer),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    });
  }

  it("won't show an offer to a teacher it does not belong to", async () => {
    const { service } = withOffer({
      id: 'o1',
      status: 'OFFERED',
      expiresAt: future(2),
      teacher: { id: 't1', userId: 'someone-else' },
    });
    await expect(service.respondToOffer('o1', 'me', true)).rejects.toThrow(/Offer/);
  });

  it('closes an expired offer instead of accepting it', async () => {
    const { service, prisma } = withOffer({
      id: 'o1',
      classId: 'c1',
      teacherId: 't1',
      status: 'OFFERED',
      expiresAt: new Date(Date.now() - 1000),
      teacher: { id: 't1', userId: 'me' },
    });
    await expect(service.respondToOffer('o1', 'me', true)).rejects.toThrow(/expired/);
    expect(prisma.substituteOffer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
  });

  it('declining just records the decline', async () => {
    const { service, prisma } = withOffer({
      id: 'o1',
      classId: 'c1',
      teacherId: 't1',
      status: 'OFFERED',
      expiresAt: future(2),
      teacher: { id: 't1', userId: 'me' },
    });
    await expect(service.respondToOffer('o1', 'me', false)).resolves.toEqual({
      offerId: 'o1',
      status: 'DECLINED',
    });
    expect(prisma.substituteOffer.update).toHaveBeenCalled();
  });

  it('accepting moves the class to the teacher, closes the other offers, and re-plans reminders', async () => {
    const klass = {
      id: 'c1',
      teacherId: 'old',
      courseId: 'course',
      status: 'SCHEDULED',
      startsAt: future(5),
      endsAt: future(6),
      womenOnly: false,
      course: { code: 'HIFZ', name: 'Hifz' },
      teacher: { userId: 'old-user' },
      students: [{ student: { family: { members: [{ userId: 'parent' }] } } }],
    };
    const { service, prisma, reminders, notifications } = build({
      substituteOffer: {
        findUnique: jest.fn(async () => ({
          id: 'o1',
          classId: 'c1',
          teacherId: 't1',
          status: 'OFFERED',
          expiresAt: future(2),
          teacher: { id: 't1', userId: 'me' },
        })),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      classSession: {
        findUnique: jest.fn(async () => klass),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      teacherProfile: {
        findUnique: jest.fn(async () => ({ userId: 'me', user: { name: 'New' } })),
        findMany: jest.fn(),
      },
    });
    const result = await service.respondToOffer('o1', 'me', true);
    expect(result.status).toBe('ACCEPTED');
    expect(prisma.classSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { teacherId: 't1' } }),
    );
    expect(prisma.substituteOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
    );
    expect(reminders.planForClass).toHaveBeenCalledWith('c1');
    expect(notifications.enqueue).toHaveBeenCalled();
  });

  it('is first-come: a class already taken is a conflict', async () => {
    const klass = {
      id: 'c1',
      teacherId: 'old',
      status: 'SCHEDULED',
      startsAt: future(5),
      endsAt: future(6),
      course: { name: 'Hifz', code: 'HIFZ' },
      teacher: { userId: 'u' },
      students: [],
    };
    const { service } = build({
      substituteOffer: {
        findUnique: jest.fn(async () => ({
          id: 'o1',
          classId: 'c1',
          teacherId: 't1',
          status: 'OFFERED',
          expiresAt: future(2),
          teacher: { id: 't1', userId: 'me' },
        })),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      classSession: {
        findUnique: jest.fn(async () => klass),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    });
    await expect(service.respondToOffer('o1', 'me', true)).rejects.toThrow(/already been taken/);
  });
});
