import { PracticeAssignmentStatus, PracticeMode } from '@prisma/client';

import { PracticeService } from './practice.service';

const TEACHER = { userId: 'teacher-user', roles: ['TEACHER'] };
const OTHER_TEACHER = { userId: 'other-teacher', roles: ['TEACHER'] };
const SUPERVISOR = { userId: 'sup-1', roles: ['SUPERVISOR'] };
const STUDENT = { userId: 'student-user', roles: ['STUDENT'] };
const STRANGER = { userId: 'someone', roles: ['GUARDIAN'] };
const AUDIO = 'practice/student-1/0190c3f4-1111-7222-8333-944445555666.webm';
const MARK = { surah: 67, ayah: 2, wordIndex: 3, type: 'SKIPPED_WORD' as never };

function build(
  opts: {
    teaches?: boolean;
    minutesSoFar?: number;
    status?: string;
    voiceConsent?: boolean;
    reviewedAt?: Date;
    feedback?: string;
    audioKey?: string | null;
    audioDeleteAfter?: Date | null;
    existingMarks?: Array<Record<string, unknown>>;
  } = {},
) {
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
        id: 'pa-1',
        studentId: 'student-1',
        status: opts.status ?? PracticeAssignmentStatus.ASSIGNED,
        targetMinutes: 30,
      })),
      findUniqueOrThrow: jest.fn(async () => ({
        fromSurah: 67,
        fromAyah: 1,
        toSurah: 67,
        toAyah: 10,
        targetMinutes: 30,
        dueOn: null,
        student: {
          id: 'student-1',
          displayName: 'Amina',
          userId: 'student-user',
          family: { members: [{ userId: 'guardian-1' }] },
        },
      })),
      findMany: jest.fn(async () => [] as unknown[]),
      update: jest.fn(async () => ({})),
    },
    practiceSession: {
      update: jest.fn(async () => ({})),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ps-1',
        ...data,
      })),
      aggregate: jest.fn(async () => ({ _sum: { minutes: opts.minutesSoFar ?? 10 } })),
      findMany: jest.fn(async () => [
        { id: 'ps-1', minutes: 10, audioKey: AUDIO, reviewedBy: null, mistakes: [] },
      ]),
      findUnique: jest.fn(async () => ({
        id: 'ps-1',
        studentId: 'student-1',
        startedAt: new Date('2026-11-05T10:00:00Z'),
        audioKey: opts.audioKey === undefined ? AUDIO : opts.audioKey,
        audioDeleteAfter: opts.audioDeleteAfter ?? null,
        reviewedAt: opts.reviewedAt ?? null,
        feedback: opts.feedback ?? null,
        assignment: {
          id: 'pa-1',
          fromSurah: 67,
          fromAyah: 1,
          toSurah: 67,
          toAyah: 10,
          teacher: { userId: 'teacher-user' },
        },
        mistakes: opts.existingMarks ?? [],
      })),
      findUniqueOrThrow: jest.fn(async () => ({
        assignment: { id: 'pa-1', fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 10 },
        _count: { mistakes: 1 },
        student: {
          id: 'student-1',
          displayName: 'Amina',
          userId: 'student-user',
          family: { members: [{ userId: 'guardian-1' }, { userId: 'student-user' }] },
        },
      })),
    },
    mistake: {
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    user: { findUnique: jest.fn(async () => ({ name: 'Ustadh Bilal' })) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const policies = {
    teacherOwnsStudent: jest.fn(async () => opts.teaches ?? true),
    studentSelf: jest.fn(async (userId: string) => userId === 'student-user'),
    guardianOwnsStudent: jest.fn(async () => false),
    canAccessStudent: jest.fn(async (s: { userId: string }) => s.userId !== 'someone'),
  };
  const storage = {
    buildKey: (...p: string[]) => p.join('/'),
    signedUploadUrl: jest.fn(async () => 'https://upload'),
    signedDownloadUrl: jest.fn(async () => 'https://download'),
    objectExists: jest.fn(async () => true),
  };
  const config = { value: { APP_WEB_URL: 'https://app.test/' } };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const audit = { record: jest.fn(async () => undefined) };
  const consent = { hasConsent: jest.fn(async () => opts.voiceConsent ?? true) };
  const quran = {
    isLicensed: () => true,
    recitationAudioUrl: jest.fn(
      async (s: number, a: number) => `https://verses.quran.foundation/Alafasy/${s}/${a}.mp3`,
    ),
  };
  const service = new PracticeService(
    prisma as never,
    policies as never,
    storage as never,
    config as never,
    consent as never,
    notifications as never,
    audit as never,
    quran as never,
  );
  return { service, prisma, storage, notifications, quran, audit, consent };
}

function createdSession(prisma: ReturnType<typeof build>['prisma']) {
  return (
    prisma.practiceSession.create.mock.calls[0] as never as [{ data: Record<string, unknown> }]
  )[0].data;
}

const ASSIGN = {
  studentId: 'student-1',
  fromSurah: 67,
  fromAyah: 1,
  toSurah: 67,
  toAyah: 10,
  mode: PracticeMode.MEMORISATION,
  targetMinutes: 30,
};

describe('PracticeService', () => {
  it('lets a teacher assign only to a student they teach', async () => {
    const { service, prisma } = build({ teaches: false });
    await expect(service.assign(TEACHER, ASSIGN)).rejects.toThrow(/students you teach/);
    expect(prisma.practiceAssignment.create).not.toHaveBeenCalled();
  });

  it('refuses a passage that ends before it starts, and a past due date', async () => {
    const { service } = build();
    await expect(service.assign(TEACHER, { ...ASSIGN, toAyah: 1, fromAyah: 5 })).rejects.toThrow(
      /ends before/,
    );
    await expect(service.assign(TEACHER, { ...ASSIGN, dueOn: '2020-01-01' })).rejects.toThrow(
      /past/,
    );
  });

  it('tells guardians and the student, each with a link into their own portal', async () => {
    const { service, notifications } = build();
    await service.assign(TEACHER, ASSIGN);

    const calls = (notifications.enqueue.mock.calls as unknown as unknown[][]).map(([c]) => c);
    expect(calls).toEqual([
      expect.objectContaining({
        userIds: ['guardian-1'],
        data: expect.objectContaining({
          url: 'https://app.test/parent/children/student-1/practice/pa-1',
        }),
      }),
      expect.objectContaining({
        userIds: ['student-user'],
        data: expect.objectContaining({ url: 'https://app.test/student/practice/pa-1' }),
      }),
    ]);
  });

  it('records a recitation for the teacher to review and completes the assignment at its target', async () => {
    const { service, prisma } = build({ minutesSoFar: 30 });
    const result = await service.logSession(STUDENT, {
      assignmentId: 'pa-1',
      minutes: 20,
      audioKey: AUDIO,
    });

    expect(result.assignmentStatus).toBe(PracticeAssignmentStatus.COMPLETED);
    const data = createdSession(prisma);
    expect(data.resultSummary).toEqual({
      scored: false,
      note: 'Your teacher will listen and reply.',
    });
    expect(JSON.stringify(data.resultSummary)).not.toMatch(/\bAI\b|automatic/i);
    expect(prisma.practiceAssignment.update).toHaveBeenCalledWith({
      where: { id: 'pa-1' },
      data: { status: PracticeAssignmentStatus.COMPLETED },
    });
  });

  it('accepts timer-logged minutes only as a whole number from 1 to 180', async () => {
    const { service, prisma } = build();
    for (const minutes of [0, -3, 1.5, 181]) {
      await expect(service.logSession(STUDENT, { assignmentId: 'pa-1', minutes })).rejects.toThrow(
        /between 1 and 180/,
      );
    }
    expect(prisma.practiceSession.create).not.toHaveBeenCalled();
    await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 1, revealsCount: 4 });
    expect(createdSession(prisma)).toMatchObject({ minutes: 1, revealsCount: 4 });
  });

  it('keeps audio 30 days, and refuses a recording key it did not issue', async () => {
    const { service, prisma } = build();
    await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 5, audioKey: AUDIO });
    const days =
      ((createdSession(prisma).audioDeleteAfter as Date).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    await expect(
      service.logSession(STUDENT, {
        assignmentId: 'pa-1',
        minutes: 5,
        audioKey: 'recitations/other-child/file.webm',
      }),
    ).rejects.toThrow(/does not belong/);
  });

  it('gives the reference recitation for each ayah of the passage', async () => {
    const { service, prisma } = build();
    prisma.practiceAssignment.findUnique.mockResolvedValueOnce({
      studentId: 'student-1',
      fromSurah: 113,
      fromAyah: 4,
      toSurah: 114,
      toAyah: 2,
    } as never);
    const result = await service.referenceAudio(STUDENT, 'pa-1');
    expect(result.available).toBe(true);
    expect(result.ayahs.map((a) => `${a.surah}:${a.ayah}`)).toEqual([
      '113:4',
      '113:5',
      '114:1',
      '114:2',
    ]);
    expect(result.ayahs[0].url).toMatch(/^https:\/\/verses\.quran\.foundation\//);
    await expect(service.referenceAudio(STRANGER, 'pa-1')).rejects.toThrow(/cannot see/);
  });

  it('lets only the student or their family log practice', async () => {
    const { service } = build();
    await expect(
      service.logSession(STRANGER, { assignmentId: 'pa-1', minutes: 5 }),
    ).rejects.toThrow(/student or their family/);
  });

  it('returns signed links, never storage keys', async () => {
    const { service } = build();
    const [session] = await service.sessions(TEACHER, 'pa-1');
    expect(session).toMatchObject({
      hasAudio: true,
      audioUrl: 'https://download',
      marks: [],
      kind: 'RECITATION',
    });
    expect(session).not.toHaveProperty('audioKey');
  });

  it('labels sessions: no audio is PREPARE, audio deleted after 30 days is still RECITATION', async () => {
    const { service, prisma } = build();
    prisma.practiceSession.findMany.mockResolvedValueOnce([
      {
        id: 'ps-1',
        minutes: 5,
        audioKey: null,
        audioDeleteAfter: null,
        reviewedAt: null,
        reviewedBy: null,
        mistakes: [],
      },
      {
        id: 'ps-2',
        minutes: 5,
        audioKey: null,
        audioDeleteAfter: new Date('2026-10-01'),
        reviewedAt: new Date('2026-09-05'),
        reviewedBy: { name: 'Ustadh Bilal' },
        mistakes: [],
      },
    ] as never);
    const [prepare, recitation] = await service.sessions(TEACHER, 'pa-1');
    expect(prepare).toMatchObject({ kind: 'PREPARE', hasAudio: false });
    expect(recitation).toMatchObject({ kind: 'RECITATION', hasAudio: false });
  });

  it('logs a prepare session (no audio) as self-practice, not for the teacher', async () => {
    const { service, prisma } = build();
    await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 5, revealsCount: 2 });
    const data = createdSession(prisma);
    expect(data).toMatchObject({ audioKey: null, audioDeleteAfter: null, revealsCount: 2 });
    expect(JSON.stringify(data.resultSummary)).toMatch(/does not review/);
  });

  it('says whether practice recordings are allowed, for whoever may see the student', async () => {
    const { service, consent } = build({ voiceConsent: false });
    await expect(service.recordingAllowed(STUDENT, 'pa-1')).resolves.toEqual({ allowed: false });
    expect(consent.hasConsent).toHaveBeenCalledWith('student-1', 'AI_VOICE');
    consent.hasConsent.mockResolvedValueOnce(true);
    await expect(service.recordingAllowed(STUDENT, 'pa-1')).resolves.toEqual({ allowed: true });
    await expect(service.recordingAllowed(STRANGER, 'pa-1')).rejects.toThrow(/cannot see/);
  });

  it('keeps no recording without AI_VOICE consent, but still logs the minutes', async () => {
    const { service, storage, prisma } = build({ voiceConsent: false });
    await expect(
      service.uploadUrl(STUDENT, { assignmentId: 'pa-1', contentType: 'audio/webm', size: 1000 }),
    ).rejects.toThrow(/not agreed/);
    expect(storage.signedUploadUrl).not.toHaveBeenCalled();
    await expect(
      service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 5, audioKey: AUDIO }),
    ).rejects.toThrow(/not agreed/);

    await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 5 });
    expect(prisma.practiceSession.create).toHaveBeenCalledTimes(1);
  });

  it('shows in the list whether the teacher has replied', async () => {
    const { service, prisma } = build();
    prisma.practiceAssignment.findMany.mockResolvedValueOnce([
      {
        id: 'pa-1',
        status: 'IN_PROGRESS',
        dueOn: null,
        sessions: [
          {
            minutes: 5,
            startedAt: new Date(),
            audioKey: AUDIO,
            reviewedAt: null,
            reviewedBy: null,
          },
          // A prepare session (no recording) never waits for the teacher.
          { minutes: 5, startedAt: new Date(), audioKey: null, reviewedAt: null, reviewedBy: null },
          {
            minutes: 5,
            startedAt: new Date(),
            audioKey: null,
            reviewedAt: new Date('2026-11-04'),
            reviewedBy: { name: 'Ustadh Bilal' },
          },
        ],
      },
    ]);
    const [row] = await service.list(TEACHER, {});
    expect(row).toMatchObject({
      awaitingReview: 1,
      minutesDone: 15,
      lastReview: { by: 'Ustadh Bilal' },
    });
    expect(row).not.toHaveProperty('aiScoring');
  });

  describe('teacher review', () => {
    it("lets only the assignment's teacher or staff review", async () => {
      const { service, prisma } = build();
      await expect(service.review(OTHER_TEACHER, 'ps-1', { feedback: 'Hi' })).rejects.toThrow(
        /teacher who set this practice/,
      );
      await expect(service.review(STUDENT, 'ps-1', { feedback: 'Hi' })).rejects.toThrow(
        /teacher who set this practice/,
      );
      expect(prisma.practiceSession.update).not.toHaveBeenCalled();
      await service.review(SUPERVISOR, 'ps-1', { feedback: 'Good' });
      await service.review(TEACHER, 'ps-1', { feedback: 'Good' });
      expect(prisma.practiceSession.update).toHaveBeenCalledTimes(2);
    });

    it('creates confirmed CLASS mistakes tied to the session, sets feedback and audits', async () => {
      const { service, prisma, audit } = build();
      const result = await service.review(TEACHER, 'ps-1', {
        feedback: '  Lovely, watch the madd.  ',
        mistakes: [MARK, MARK],
      });
      expect(result).toMatchObject({ added: 1, feedback: 'Lovely, watch the madd.' });
      expect(prisma.mistake.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            studentId: 'student-1',
            practiceSessionId: 'ps-1',
            surah: 67,
            ayah: 2,
            wordIndex: 3,
            type: 'SKIPPED_WORD',
            source: 'CLASS',
            confirmed: true,
          }),
        ],
      });
      expect(prisma.practiceSession.update).toHaveBeenCalledWith({
        where: { id: 'ps-1' },
        data: expect.objectContaining({
          reviewedAt: expect.any(Date),
          reviewedById: 'teacher-user',
          feedback: 'Lovely, watch the madd.',
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'practice.session.review', targetId: 'ps-1' }),
      );
    });

    it('refuses to review a prepare session (no recording), but not a reviewed one whose audio was deleted', async () => {
      const { service, prisma } = build({ audioKey: null });
      await expect(service.review(TEACHER, 'ps-1', { feedback: 'Hi' })).rejects.toThrow(
        'Only a recitation can be reviewed; this was a practice session.',
      );
      expect(prisma.practiceSession.update).not.toHaveBeenCalled();

      const old = build({
        audioKey: null,
        audioDeleteAfter: new Date('2026-10-01'),
        reviewedAt: new Date('2026-09-05'),
      });
      await old.service.review(TEACHER, 'ps-1', { feedback: 'Edited' });
      expect(old.prisma.practiceSession.update).toHaveBeenCalled();
    });

    it('refuses a word outside the passage, or a category that is not for recitation', async () => {
      const { service, prisma } = build();
      await expect(
        service.review(TEACHER, 'ps-1', { mistakes: [{ ...MARK, ayah: 20 }] }),
      ).rejects.toThrow(/not in this practice passage/);
      await expect(
        service.review(TEACHER, 'ps-1', { mistakes: [{ ...MARK, type: 'GRAMMAR' as never }] }),
      ).rejects.toThrow(/recitation mistake type/);
      expect(prisma.practiceSession.update).not.toHaveBeenCalled();
    });

    it('is idempotent: a second review updates the feedback and adds only new marks', async () => {
      const reviewedAt = new Date('2026-11-05T12:00:00Z');
      const { service, prisma, notifications } = build({
        reviewedAt,
        feedback: 'Old note',
        existingMarks: [{ id: 'm-old', ...MARK }],
      });
      const result = await service.review(TEACHER, 'ps-1', {
        feedback: 'New note',
        mistakes: [MARK, { surah: 67, ayah: 5, wordIndex: 1, type: 'VOWEL_HARAKAH' as never }],
      });
      expect(result).toMatchObject({ added: 1, feedback: 'New note', reviewedAt });
      const created = (prisma.mistake.createMany.mock.calls[0] as never as [{ data: unknown[] }])[0]
        .data;
      expect(created).toEqual([expect.objectContaining({ ayah: 5, wordIndex: 1 })]);
      // The first review time is kept.
      expect(prisma.practiceSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reviewedAt, feedback: 'New note' }),
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalled();

      // Nothing new said: nothing created and no second notification.
      const again = build({
        reviewedAt,
        feedback: 'Same',
        existingMarks: [{ id: 'm-old', ...MARK }],
      });
      await again.service.review(TEACHER, 'ps-1', { feedback: 'Same', mistakes: [MARK] });
      expect(again.prisma.mistake.createMany).not.toHaveBeenCalled();
      expect(again.notifications.enqueue).not.toHaveBeenCalled();
    });

    it('tells guardians and the student with PRACTICE_REVIEWED, each with their own link', async () => {
      const { service, notifications } = build();
      await service.review(TEACHER, 'ps-1', { feedback: 'Well done', mistakes: [MARK] });
      const calls = (notifications.enqueue.mock.calls as unknown as unknown[][]).map(([c]) => c);
      expect(calls).toEqual([
        expect.objectContaining({
          userIds: ['guardian-1'],
          template: 'practice.reviewed',
          data: expect.objectContaining({
            teacherName: 'Ustadh Bilal',
            feedback: 'Well done',
            url: 'https://app.test/parent/children/student-1/practice/pa-1',
          }),
        }),
        expect.objectContaining({
          userIds: ['student-user'],
          template: 'practice.reviewed',
          data: expect.objectContaining({ url: 'https://app.test/student/practice/pa-1' }),
        }),
      ]);
    });

    it("scopes the to-review list to the teacher's own unreviewed sessions of the last 30 days", async () => {
      const { service, prisma } = build();
      prisma.practiceSession.findMany.mockResolvedValueOnce([
        { id: 'ps-1', audioKey: AUDIO, minutes: 5 },
      ] as never);
      const rows = await service.toReview(TEACHER);
      type Where = { where: Record<string, { gte?: Date } | null | object> };
      const where = (prisma.practiceSession.findMany.mock.calls[0] as never as [Where])[0].where;
      expect(where.reviewedAt).toBeNull();
      // Only sessions with a recording wait for the teacher.
      expect(where.audioKey).toEqual({ not: null });
      expect(where).not.toHaveProperty('OR');
      expect(where.assignment).toEqual({ is: { teacher: { userId: 'teacher-user' } } });
      const since = (where.startedAt as { gte: Date }).gte;
      expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(30);
      expect(rows[0]).toMatchObject({ hasAudio: true });
      expect(rows[0]).not.toHaveProperty('audioKey');

      await service.toReview(SUPERVISOR);
      const staff = (prisma.practiceSession.findMany.mock.calls[1] as never as [Where])[0].where;
      expect(staff.assignment).toEqual({ isNot: null });
    });

    it('lists reviewed and all only as recitations, never prepare sessions', async () => {
      const { service, prisma } = build();
      type Where = { where: Record<string, unknown> };
      for (const status of ['reviewed', 'all'] as const) {
        prisma.practiceSession.findMany.mockResolvedValueOnce([] as never);
        await service.toReview(TEACHER, status);
      }
      const calls = prisma.practiceSession.findMany.mock.calls as never as [Where][];
      for (const [{ where }] of calls) {
        expect(where.OR).toEqual([{ audioKey: { not: null } }, { reviewedAt: { not: null } }]);
      }
    });
  });
});
