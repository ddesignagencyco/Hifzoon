import { PracticeAssignmentStatus, PracticeMode } from '@prisma/client';

import { PracticeService } from './practice.service';

const TEACHER = { userId: 'teacher-user', roles: ['TEACHER'] };
const STUDENT = { userId: 'student-user', roles: ['STUDENT'] };
const STRANGER = { userId: 'someone', roles: ['GUARDIAN'] };
const AUDIO = 'practice/student-1/0190c3f4-1111-7222-8333-944445555666.webm';

function build(
  opts: { teaches?: boolean; minutesSoFar?: number; status?: string; voiceConsent?: boolean } = {},
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
      update: jest.fn(async () => ({})),
    },
    practiceSession: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ps-1',
        ...data,
      })),
      aggregate: jest.fn(async () => ({ _sum: { minutes: opts.minutesSoFar ?? 10 } })),
      findMany: jest.fn(async () => [{ id: 'ps-1', minutes: 10, audioKey: AUDIO }]),
    },
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
  const consent = { hasConsent: jest.fn(async () => opts.voiceConsent ?? true) };
  const service = new PracticeService(
    prisma as never,
    policies as never,
    storage as never,
    config as never,
    consent as never,
    notifications as never,
  );
  return { service, prisma, storage, notifications };
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

  it('records a session unscored and completes the assignment at its target', async () => {
    const { service, prisma } = build({ minutesSoFar: 30 });
    const result = await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 20 });

    expect(result.assignmentStatus).toBe(PracticeAssignmentStatus.COMPLETED);
    const data = (
      prisma.practiceSession.create.mock.calls[0] as never as [{ data: Record<string, unknown> }]
    )[0].data;
    expect(data.resultSummary).toMatchObject({ scored: false });
    expect(prisma.practiceAssignment.update).toHaveBeenCalledWith({
      where: { id: 'pa-1' },
      data: { status: PracticeAssignmentStatus.COMPLETED },
    });
  });

  it('keeps audio 30 days, and refuses a recording key it did not issue', async () => {
    const { service, prisma } = build();
    await service.logSession(STUDENT, { assignmentId: 'pa-1', minutes: 5, audioKey: AUDIO });
    const data = (
      prisma.practiceSession.create.mock.calls[0] as never as [{ data: Record<string, unknown> }]
    )[0].data;
    const days = ((data.audioDeleteAfter as Date).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    await expect(
      service.logSession(STUDENT, {
        assignmentId: 'pa-1',
        minutes: 5,
        audioKey: 'recitations/other-child/file.webm',
      }),
    ).rejects.toThrow(/does not belong/);
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
    expect(session).toMatchObject({ hasAudio: true, audioUrl: 'https://download' });
    expect(session).not.toHaveProperty('audioKey');
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
});
