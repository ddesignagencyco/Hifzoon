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
