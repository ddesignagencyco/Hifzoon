import { PracticeMode } from '@prisma/client';

import { allowedItemPrefixes, boardDisplay, boardLabel, itemRefInBoard } from './board';
import { passageOf, PracticeService } from './practice.service';

const TEACHER = { userId: 'teacher-user', roles: ['TEACHER'] };
const BASE = { studentId: 'student-1', mode: PracticeMode.MEMORISATION, targetMinutes: 20 };
const RANGE = { fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 10 };

/** Hisn al-Muslim chapter 1 has four duas. */
const WAKE_UP = 'Supplications for when you wake up';

function build(assignment: Record<string, unknown> = {}) {
  const prisma = {
    teacherProfile: {
      findUnique: jest.fn(async () => ({ id: 'tp-1', user: { name: 'Ustadh Bilal' } })),
    },
    practiceAssignment: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'pa-1',
        ...data,
      })),
      findUnique: jest.fn(async () => ({
        studentId: 'student-1',
        fromSurah: null,
        fromAyah: null,
        toSurah: null,
        toAyah: null,
        board: 'DUAS',
        ...assignment,
      })),
      findUniqueOrThrow: jest.fn(async () => ({
        fromSurah: null,
        fromAyah: null,
        toSurah: null,
        toAyah: null,
        board: 'DUAS',
        boardLesson: 1,
        boardItem: null,
        label: WAKE_UP,
        targetMinutes: 20,
        dueOn: null,
        student: {
          id: 'student-1',
          displayName: 'Amina',
          userId: null,
          family: { members: [{ userId: 'guardian-1' }] },
        },
      })),
    },
    practiceSession: {
      findUnique: jest.fn(async () => ({
        id: 'ps-1',
        studentId: 'student-1',
        startedAt: new Date('2026-11-05T10:00:00Z'),
        audioKey: 'practice/student-1/x.webm',
        audioDeleteAfter: null,
        reviewedAt: null,
        feedback: null,
        assignment: {
          id: 'pa-1',
          fromSurah: null,
          fromAyah: null,
          toSurah: null,
          toAyah: null,
          board: 'DUAS',
          boardLesson: 1,
          boardItem: null,
          label: WAKE_UP,
          teacher: { userId: 'teacher-user' },
          ...assignment,
        },
        mistakes: [],
      })),
      update: jest.fn(async () => ({})),
    },
    mistake: {
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const policies = {
    teacherOwnsStudent: jest.fn(async () => true),
    canAccessStudent: jest.fn(async () => true),
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const quran = { isLicensed: () => true, recitationAudioUrl: jest.fn(async () => 'https://x') };
  const service = new PracticeService(
    prisma as never,
    policies as never,
    {} as never,
    { value: { APP_WEB_URL: 'https://app.test' } } as never,
    {} as never,
    notifications as never,
    undefined,
    quran as never,
  );
  return { service, prisma, notifications, quran };
}

describe('board practice: validation', () => {
  it('needs exactly one of a surah range or a board item', () => {
    expect(() => passageOf({ ...BASE })).toThrow(
      /Choose a passage, a dua chapter or a Qaida lesson/,
    );
    expect(() => passageOf({ ...BASE, ...RANGE, board: 'DUAS', boardLesson: 1 })).toThrow(
      /not both/,
    );
    expect(() => passageOf({ ...BASE, fromSurah: 67, boardLesson: 2 })).toThrow(/not both/);
  });

  it('checks the range as before', () => {
    expect(passageOf({ ...BASE, ...RANGE })).toEqual({
      ...RANGE,
      board: null,
      boardLesson: null,
      boardItem: null,
      label: null,
    });
    expect(() => passageOf({ ...BASE, fromSurah: 67, fromAyah: 1 })).toThrow(/starts and ends/);
    expect(() => passageOf({ ...BASE, ...RANGE, toAyah: 1, fromAyah: 5 })).toThrow(/ends before/);
  });

  it('stores a dua chapter, or one dua of it, with its title as the label', () => {
    expect(passageOf({ ...BASE, board: 'DUAS', boardLesson: 1 })).toEqual({
      fromSurah: null,
      fromAyah: null,
      toSurah: null,
      toAyah: null,
      board: 'DUAS',
      boardLesson: 1,
      boardItem: null,
      label: WAKE_UP,
    });
    expect(passageOf({ ...BASE, board: 'DUAS', boardLesson: 1, boardItem: 1 }).label).toBe(
      `${WAKE_UP} (2)`,
    );
  });

  it('stores a Qaida lesson with its title; a Qaida item is not a practice', () => {
    expect(passageOf({ ...BASE, board: 'QAIDA', boardLesson: 3 })).toMatchObject({
      board: 'QAIDA',
      boardLesson: 3,
      boardItem: null,
      label: 'Huroof muqattaʿat',
    });
    expect(() => passageOf({ ...BASE, board: 'QAIDA', boardLesson: 18 })).toThrow(/17 lessons/);
    expect(() => passageOf({ ...BASE, board: 'QAIDA', boardLesson: 3, boardItem: 0 })).toThrow(
      /whole lesson/,
    );
  });

  it('refuses a missing board, a chapter or dua that does not exist', () => {
    expect(() => passageOf({ ...BASE, boardLesson: 1 })).toThrow(/Duas or Qaida/);
    expect(() => passageOf({ ...BASE, board: 'DUAS' })).toThrow(/dua chapter/);
    expect(() => passageOf({ ...BASE, board: 'DUAS', boardLesson: 999 })).toThrow(/does not exist/);
    expect(() => passageOf({ ...BASE, board: 'DUAS', boardLesson: 1, boardItem: 9 })).toThrow(
      /does not exist/,
    );
  });

  it('labels and item references match the classroom board names', () => {
    expect(boardLabel({ board: 'DUAS', boardLesson: 1 })).toBe(WAKE_UP);
    expect(boardDisplay({ board: 'QAIDA', boardLesson: 3, label: 'Huroof muqattaʿat' })).toBe(
      'Qaida: Lesson 3 — Huroof muqattaʿat',
    );
    expect(boardDisplay({ board: 'DUAS', boardLesson: 1, label: WAKE_UP })).toBe(
      `Duas: ${WAKE_UP}`,
    );
    expect(allowedItemPrefixes({ board: 'DUAS', boardLesson: 1 })).toEqual([
      `${WAKE_UP} (1)`,
      `${WAKE_UP} (2)`,
      `${WAKE_UP} (3)`,
      `${WAKE_UP} (4)`,
      WAKE_UP,
    ]);
    expect(
      itemRefInBoard(`${WAKE_UP} (2) · word 3 (الْحَمْدُ)`, { board: 'DUAS', boardLesson: 1 }),
    ).toBe(true);
    expect(itemRefInBoard(`${WAKE_UP} (2)`, { board: 'DUAS', boardLesson: 1, boardItem: 0 })).toBe(
      false,
    );
    expect(itemRefInBoard('Tanween: بً', { board: 'QAIDA', boardLesson: 5 })).toBe(true);
    expect(itemRefInBoard('Tashdeed: بّ', { board: 'QAIDA', boardLesson: 5 })).toBe(false);
  });
});

describe('board practice: service', () => {
  it('creates a board assignment and tells the family with its label', async () => {
    const { service, prisma, notifications } = build();
    const created = await service.assign(TEACHER, { ...BASE, board: 'DUAS', boardLesson: 1 });
    expect(prisma.practiceAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-1',
        teacherId: 'tp-1',
        fromSurah: null,
        toAyah: null,
        board: 'DUAS',
        boardLesson: 1,
        boardItem: null,
        label: WAKE_UP,
      }),
    });
    expect(created).toMatchObject({ board: 'DUAS', label: WAKE_UP });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ range: `Duas: ${WAKE_UP}` }) }),
    );
  });

  it('refuses a body with both a range and a board item before writing anything', async () => {
    const { service, prisma } = build();
    await expect(
      service.assign(TEACHER, { ...BASE, ...RANGE, board: 'QAIDA', boardLesson: 2 }),
    ).rejects.toThrow(/not both/);
    expect(prisma.practiceAssignment.create).not.toHaveBeenCalled();
  });

  it('has no qari audio for a board item', async () => {
    const { service, quran } = build();
    await expect(service.referenceAudio(TEACHER, 'pa-1')).resolves.toEqual({
      available: false,
      truncated: false,
      ayahs: [],
    });
    expect(quran.recitationAudioUrl).not.toHaveBeenCalled();
  });

  it('records review marks on dua words as item mistakes with the Duas categories', async () => {
    const { service, prisma } = build();
    const ref = `${WAKE_UP} (1) · word 2 (للَّهِ)`;
    const result = await service.review(TEACHER, 'ps-1', {
      feedback: 'Good',
      mistakes: [{ itemRef: ref, type: 'MEMORY' as never }],
    });
    expect(result.added).toBe(1);
    expect(prisma.mistake.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          surah: null,
          ayah: null,
          wordIndex: null,
          itemRef: ref,
          type: 'MEMORY',
          source: 'CLASS',
        }),
      ],
    });
  });

  it('refuses an ayah mark, another dua, or a recitation category on a board practice', async () => {
    const { service, prisma } = build();
    await expect(
      service.review(TEACHER, 'ps-1', {
        mistakes: [{ surah: 1, ayah: 1, wordIndex: 0, type: 'MEMORY' as never }],
      }),
    ).rejects.toThrow(/not an ayah/);
    await expect(
      service.review(TEACHER, 'ps-1', {
        mistakes: [{ itemRef: 'Before eating', type: 'MEMORY' as never }],
      }),
    ).rejects.toThrow(/not in this practice/);
    await expect(
      service.review(TEACHER, 'ps-1', {
        mistakes: [{ itemRef: WAKE_UP, type: 'SKIPPED_WORD' as never }],
      }),
    ).rejects.toThrow(/Duas mistake type/);
    expect(prisma.practiceSession.update).not.toHaveBeenCalled();
  });
});
