import { LESSON_CARD_LOCK_HOURS, Role } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { LessonCardsService } from './lesson-cards.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QueueService } from '../../queue/queue.service';
import type { PolicyService } from '../../common/services/policy.service';
import type { ClassReminderService } from '../notifications/class-reminder.service';

const HOUR = 3_600_000;

function buildHarness(card: Record<string, unknown> | null = {}) {
  const rows: Record<string, unknown> = {
    id: 'card-1',
    studentId: 'student-1',
    teacher: { id: 'teacher-user-1' },
    class: { mushafLayout: 'MADANI_15' },
    sharedAt: new Date('2026-03-01T11:00:00Z'),
    summaryApprovedAt: null,
    homework: 'Read pages 10-12',
    parentNote: null,
    submittedAt: new Date('2026-03-01T10:00:00Z'),
    lockedAt: null,
    portions: [
      {
        id: 'p1',
        kind: 'SABAQ',
        fromSurah: 1,
        fromAyah: 1,
        toSurah: 1,
        toAyah: 5,
        grade: 'GOOD',
        position: 0,
      },
    ],
    ...card,
  };

  const state = {
    card: rows,
    updates: [] as Array<Record<string, unknown>>,
    editLog: [] as Array<Record<string, unknown>>,
    portionWrites: 0,
  };

  const prisma = {
    lessonCard: {
      findUnique: jest.fn(async () => (state.card ? { ...(state.card as object) } : null)),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.updates.push(data);
        Object.assign(state.card, data);
        return { id: 'card-1', ...state.card };
      }),
    },
    lessonPortion: {
      deleteMany: jest.fn(async () => {
        state.portionWrites += 1;
      }),
      createMany: jest.fn(async () => {
        state.portionWrites += 1;
      }),
    },
    lessonEditLog: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.editLog.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
  } as unknown as PrismaService;

  const queues = { add: jest.fn(), addDelayed: jest.fn() } as unknown as QueueService;
  const reminders = { scheduleLessonCardShare: jest.fn() } as unknown as ClassReminderService;
  const policies = {
    assertGuardianOwnsStudent: jest.fn(async () => undefined),
    canAccessStudent: jest.fn(async () => true),
    assertClassControl: jest.fn(async () => undefined),
  } as unknown as PolicyService;

  const service = new LessonCardsService(prisma, policies, reminders, queues);
  return { service, state, prisma, queues, policies };
}

const teacher = { id: 'teacher-user-1', roles: [Role.TEACHER], name: 'Ustadh Bilal' } as never;
const supervisor = { id: 'sup-1', roles: [Role.SUPERVISOR], name: 'Supervisor' } as never;
const guardian = { id: 'guardian-1', roles: [Role.GUARDIAN], name: 'Parent' } as never;

describe('Lesson card 48-hour lock (FR-REC-08)', () => {
  const submittedAt = new Date('2026-03-01T10:00:00Z');

  describe('isLocked', () => {
    it('FR-REC-08 is not locked before submission', () => {
      const service = buildHarness().service;
      expect(service.isLocked({ submittedAt: null, lockedAt: null })).toBe(false);
    });

    it('FR-REC-08 is not locked inside the 48 hour window', () => {
      const service = buildHarness().service;
      const now = new Date(submittedAt.getTime() + 47 * HOUR);
      expect(service.isLocked({ submittedAt, lockedAt: null }, now)).toBe(false);
    });

    it('FR-REC-08 is locked exactly at 48 hours', () => {
      const service = buildHarness().service;
      const now = new Date(submittedAt.getTime() + LESSON_CARD_LOCK_HOURS * HOUR);
      expect(service.isLocked({ submittedAt, lockedAt: null }, now)).toBe(true);
    });

    it('FR-REC-08 honours an explicit locked_at even inside the window', () => {
      const service = buildHarness().service;
      // A supervisor can lock early; the stored stamp wins over the derived one.
      expect(
        service.isLocked({ submittedAt, lockedAt: new Date(submittedAt.getTime() + HOUR) }),
      ).toBe(true);
    });
  });

  describe('update', () => {
    it('FR-REC-08 lets the owning teacher edit inside 48 hours without a reason', async () => {
      const now = new Date(submittedAt.getTime() + 2 * HOUR);
      jest.useFakeTimers().setSystemTime(now);

      const { service, state } = buildHarness();
      const result = await service.update('card-1', { homework: 'Read pages 10-14' }, teacher);

      expect(result.locked).toBe(false);
      expect(state.updates[0]).toMatchObject({ homework: 'Read pages 10-14' });
      expect(state.editLog).toHaveLength(0);
      jest.useRealTimers();
    });

    it('FR-REC-08 refuses a teacher edit once locked', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 50 * HOUR));

      const { service } = buildHarness();
      await expect(
        service.update('card-1', { homework: 'silently changed' }, teacher),
      ).rejects.toThrow(/locked 48 hours after submission/);

      jest.useRealTimers();
    });

    it('FR-REC-08 lets a supervisor edit a locked card and logs it', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 50 * HOUR));

      const { service, state } = buildHarness();
      const result = await service.update(
        'card-1',
        { parentNote: 'Corrected after review', reason: 'Wrong page recorded' },
        supervisor,
      );

      expect(result.locked).toBe(true);
      expect(result.loggedAsSupervisorEdit).toBe(true);
      expect(state.editLog).toHaveLength(1);
      // The log carries the before state, which is the whole point of it.
      expect(state.editLog[0]).toMatchObject({
        editorId: 'sup-1',
        reason: 'Wrong page recorded',
      });
      expect((state.editLog[0] as { before: { homework: string } }).before.homework).toBe(
        'Read pages 10-12',
      );

      jest.useRealTimers();
    });

    it('FR-REC-08 requires a reason for a supervisor edit after the lock', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 50 * HOUR));

      const { service, state } = buildHarness();
      await expect(service.update('card-1', { parentNote: 'changed' }, supervisor)).rejects.toThrow(
        /must state a reason/,
      );
      expect(state.editLog).toHaveLength(0);

      jest.useRealTimers();
    });

    it('FR-REC-08 refuses an unrelated user entirely', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 2 * HOUR));

      const { service } = buildHarness();
      await expect(service.update('card-1', { homework: 'not mine' }, guardian)).rejects.toThrow(
        /Only the teacher who wrote this card/,
      );

      jest.useRealTimers();
    });

    it('FR-REC-08 does not log edits made inside the window', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 2 * HOUR));

      const { service, state } = buildHarness();
      await service.update('card-1', { homework: 'normal edit' }, teacher);
      expect(state.editLog).toHaveLength(0);

      jest.useRealTimers();
    });
  });

  describe('portion validation', () => {
    it('refuses a card with no portions', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + HOUR));
      const { service } = buildHarness();

      await expect(service.update('card-1', { portions: [] }, teacher)).rejects.toBeInstanceOf(
        AppError,
      );
      jest.useRealTimers();
    });

    it('refuses an impossible surah number', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + HOUR));
      const { service } = buildHarness();

      await expect(
        service.update(
          'card-1',
          { portions: [{ kind: 'SABAQ' as never, fromSurah: 115 }] },
          teacher,
        ),
      ).rejects.toThrow(/between 1 and 114/);
      jest.useRealTimers();
    });
  });

  describe('reads', () => {
    it('FR-REC-06 hides the AI draft from a guardian until it is approved', async () => {
      const { service } = buildHarness({ aiSummaryDraft: 'Maryam recited beautifully today.' });
      const card = await service.get('card-1', guardian);

      expect(card.aiSummaryDraft).toBeNull();
    });

    it('FR-REC-05 shows the draft to the owning teacher', async () => {
      const { service } = buildHarness({ aiSummaryDraft: 'Maryam recited beautifully today.' });
      const card = await service.get('card-1', teacher);

      expect(card.aiSummaryDraft).toBe('Maryam recited beautifully today.');
    });

    it('returns the derived lock state alongside the card', async () => {
      jest.useFakeTimers().setSystemTime(new Date(submittedAt.getTime() + 60 * HOUR));
      const { service } = buildHarness();

      const card = await service.get('card-1', teacher);
      expect(card.locked).toBe(true);
      jest.useRealTimers();
    });

    it('S13 refuses an unshared card to a guardian, as the list already did', async () => {
      const { service } = buildHarness({ sharedAt: null });

      await expect(service.get('card-1', guardian)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('S13 keeps the recording storage key away from a guardian', async () => {
      const { service } = buildHarness({
        class: {
          mushafLayout: 'MADANI_15',
          recording: { id: 'rec-1', storageKey: 'recordings/class-1.m4a', status: 'READY' },
        },
      });

      const forGuardian = await service.get('card-1', guardian);
      expect((forGuardian.class.recording as Record<string, unknown>).storageKey).toBeUndefined();

      const forTeacher = await service.get('card-1', teacher);
      expect((forTeacher.class.recording as Record<string, unknown>).storageKey).toBe(
        'recordings/class-1.m4a',
      );
    });
  });
});

describe('AI summary approval', () => {
  it('asks for approval again when an approved summary is edited', async () => {
    const { service, state } = buildHarness({
      aiSummaryDraft: 'Approved words',
      summaryApprovedAt: new Date('2026-03-01T12:00:00Z'),
    });

    await service.saveAiDraft('card-1', 'Changed words', 'teacher-user-1');

    expect(state.card.aiSummaryDraft).toBe('Changed words');
    expect(state.card.summaryApprovedAt).toBeNull();
  });
});

describe('Lesson card rules added in the regression pass', () => {
  it('asks a supervisor for a reason even on a locked card they wrote themselves', async () => {
    const { service } = buildHarness({
      teacher: { id: 'sup-1' },
      lockedAt: new Date('2026-03-03T10:00:00Z'),
    });
    await expect(service.update('card-1', { parentNote: 'x' }, supervisor)).rejects.toThrow(
      /must state a reason/,
    );
  });

  it('refuses to submit a card for a class that is still running', async () => {
    const { service, prisma } = buildHarness();
    (prisma as unknown as { classSession: unknown }).classSession = {
      findUnique: jest.fn(async () => ({
        id: 'class-1',
        teacher: { id: 'tp-1', userId: 'teacher-user-1' },
        courseId: 'course-1',
        status: 'LIVE',
        startsAt: new Date(Date.now() - 10 * 60_000),
        endsAt: new Date(Date.now() + 40 * 60_000),
        students: [{ studentId: 'student-1' }],
        lessonCard: null,
      })),
    };
    await expect(
      service.submit({ classId: 'class-1', portions: [{ kind: 'SABAQ' as never }] }, teacher),
    ).rejects.toThrow(/once the class has ended/);
  });
});

describe('Lesson cards in a circle class', () => {
  function circle(written: string[]) {
    const harness = buildHarness();
    const created: Array<Record<string, unknown>> = [];
    Object.assign(harness.prisma as object, {
      classSession: {
        findUnique: jest.fn(async () => ({
          id: 'class-1',
          teacher: { id: 'tp-1', userId: 'teacher-user-1' },
          courseId: 'course-1',
          status: 'COMPLETED',
          startsAt: new Date(Date.now() - 60 * 60_000),
          endsAt: new Date(Date.now() - 10 * 60_000),
          students: [{ studentId: 'amina' }, { studentId: 'bilal' }],
          lessonCards: written.map((id) => ({
            id: `card-${id}`,
            studentId: id,
            submittedAt: new Date(),
          })),
        })),
      },
    });
    (harness.prisma as unknown as { lessonCard: Record<string, unknown> }).lessonCard.create =
      jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'card-new', submittedAt: new Date(), portions: [], ...data };
      });
    return { ...harness, created };
  }

  it('writes the next student’s card once the first student has one', async () => {
    const { service, created } = circle(['amina']);
    await service
      .submit({ classId: 'class-1', portions: [{ kind: 'OTHER' as never }] }, teacher)
      .catch(() => undefined);
    expect(created[0]).toMatchObject({ studentId: 'bilal' });
  });

  it('refuses a second card for the same student', async () => {
    const { service } = circle(['amina']);
    await expect(
      service.submit(
        { classId: 'class-1', studentId: 'amina', portions: [{ kind: 'OTHER' as never }] },
        teacher,
      ),
    ).rejects.toThrow(/already been submitted/);
  });
});

describe('Lesson cards a teacher still owes', () => {
  it('lists each student of a finished class whose card is not submitted, within 7 days', async () => {
    const { service, prisma } = buildHarness();
    const findMany = jest.fn(async () => [
      {
        id: 'class-circle',
        type: 'CIRCLE',
        startsAt: new Date('2026-11-05T09:00:00Z'),
        endsAt: new Date('2026-11-05T10:00:00Z'),
        course: { id: 'c1', name: 'Qaida' },
        students: [
          { student: { id: 's1', displayName: 'Amina' } },
          { student: { id: 's2', displayName: 'Yusuf' } },
        ],
        // Amina's card is in; Yusuf's is still owed.
        lessonCards: [{ studentId: 's1' }],
      },
      {
        id: 'class-done',
        type: 'REGULAR',
        startsAt: new Date('2026-11-04T09:00:00Z'),
        endsAt: new Date('2026-11-04T10:00:00Z'),
        course: { id: 'c2', name: 'Hifz' },
        students: [{ student: { id: 's3', displayName: 'Zayd' } }],
        lessonCards: [{ studentId: 's3' }],
      },
    ]);
    (prisma as unknown as { classSession: unknown }).classSession = { findMany };

    const now = new Date('2026-11-06T12:00:00Z');
    const rows = await service.outstandingForTeacher('teacher-user-1', now);

    expect(rows).toEqual([
      expect.objectContaining({
        classId: 'class-circle',
        student: { id: 's2', displayName: 'Yusuf' },
      }),
    ]);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, any> }])[0].where;
    expect(where.teacher).toEqual({ userId: 'teacher-user-1' });
    expect(where.endsAt.lt).toEqual(now);
    expect(where.endsAt.gte).toEqual(new Date('2026-10-30T12:00:00Z'));
    // Cancelled and no-show classes never owe a card.
    expect(where.status.in).toEqual(['SCHEDULED', 'LIVE', 'COMPLETED']);
  });
});

describe('Lesson cards listed for a child', () => {
  it("carries the class date and course so the family's Lessons page can filter by them", async () => {
    const { service, prisma } = buildHarness();
    const findMany = jest.fn(async () => []);
    (prisma.lessonCard as unknown as { findMany: jest.Mock }).findMany = findMany;

    await service.listForStudent('student-1', guardian);

    const args = (
      findMany.mock.calls[0] as unknown as [{ where: unknown; select: Record<string, unknown> }]
    )[0];
    expect(args.select.class).toEqual({
      select: { startsAt: true, course: { select: { id: true, name: true, code: true } } },
    });
    // Still shared cards only for a family.
    expect(args.where).toEqual({
      studentId: 'student-1',
      OR: [{ sharedAt: { not: null } }, { teacherId: 'guardian-1' }],
    });
  });
});

describe('Lesson card portions for Qaida and Duas classes', () => {
  function boardClass(
    type: 'DUAS' | 'QAIDA',
    lessons: Array<{ board: 'QAIDA' | 'DUAS'; lesson: number }>,
  ) {
    const harness = buildHarness();
    const created: Array<Record<string, unknown>> = [];
    Object.assign(harness.prisma as object, {
      classSession: {
        findUnique: jest.fn(async () => ({
          id: 'class-1',
          startsAt: new Date(Date.now() - 60 * 60_000),
          endsAt: new Date(Date.now() - 10 * 60_000),
          status: 'COMPLETED',
          lastPage: 1,
          mushafLayout: 'MADANI_15',
          teacher: { id: 'tp-1', userId: 'teacher-user-1', user: { name: 'Ustadh Bilal' } },
          course: { id: 'course-1', name: 'Masnoon Duas', type },
          courseId: 'course-1',
          students: [{ studentId: 'amina', student: { id: 'amina', displayName: 'Amina' } }],
          lessonCards: [],
          mistakes: [],
          participants: [],
        })),
      },
    });
    (harness.prisma as unknown as { lessonCard: Record<string, unknown> }).lessonCard.create =
      jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'card-new', submittedAt: new Date(), portions: [] };
      });
    (harness.prisma as unknown as { mistake: Record<string, unknown> }).mistake = {
      updateMany: jest.fn(async () => ({ count: 0 })),
    };
    const coverage = { pages: [1], firstAyah: null, lastAyah: null, lessons };
    const redis = {
      key: (...parts: string[]) => parts.join(':'),
      getJson: jest.fn(async () => coverage),
    };
    const service = new LessonCardsService(
      harness.prisma,
      harness.policies,
      { scheduleLessonCardShare: jest.fn() } as never,
      harness.queues,
      redis as never,
    );
    return { service, created };
  }

  it('names each dua chapter shown, one portion per chapter', async () => {
    const { service } = boardClass('DUAS', [
      { board: 'DUAS', lesson: 3 },
      { board: 'DUAS', lesson: 1 },
    ]);
    const prefill = await service.prefill('class-1', teacher);
    expect(prefill.portions).toEqual([
      { kind: 'OTHER', label: 'Invocation when putting on new clothes' },
      { kind: 'OTHER', label: 'Supplications for when you wake up' },
    ]);
    expect(prefill.coverage?.lessons).toHaveLength(prefill.portions.length);
  });

  it('names the Qaida lesson shown', async () => {
    const { service } = boardClass('QAIDA', [{ board: 'QAIDA', lesson: 5 }]);
    const prefill = await service.prefill('class-1', teacher);
    expect(prefill.portions).toEqual([{ kind: 'OTHER', label: 'Tanween' }]);
  });

  it('stores the label, trimmed, with the portion', async () => {
    const { service, created } = boardClass('DUAS', []);
    await service.submit(
      {
        classId: 'class-1',
        portions: [{ kind: 'OTHER' as never, label: '  Supplications for when you wake up ' }],
      },
      teacher,
    );
    const portions = (created[0].portions as { create: Array<Record<string, unknown>> }).create;
    expect(portions[0]).toMatchObject({ label: 'Supplications for when you wake up' });
  });

  it('refuses a label over 200 characters', async () => {
    const { service } = boardClass('DUAS', []);
    await expect(
      service.submit(
        { classId: 'class-1', portions: [{ kind: 'OTHER' as never, label: 'x'.repeat(201) }] },
        teacher,
      ),
    ).rejects.toThrow(/at most 200/);
  });
});

describe('Lesson card mistakes fixed later', () => {
  it('reads resolvedAt with each mistake, so the card can show "Fixed"', async () => {
    const { service, prisma } = buildHarness();
    await service.get('card-1', teacher);
    const args = (prisma.lessonCard.findUnique as jest.Mock).mock.calls[0][0] as {
      select: { mistakes: { select: Record<string, boolean> } };
    };
    expect(args.select.mistakes.select.resolvedAt).toBe(true);
  });
});
