import { ErrorCode } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { MessagingService } from '../parent-portal/messaging.service';
import { RevisionRequestsService } from './revision-requests.service';

function user(id: string, roles: string[]) {
  return { id, roles, name: id } as never;
}

const GUARDIAN = user('guardian-1', ['GUARDIAN']);
const TEACHER = user('teacher-1', ['GUARDIAN', 'TEACHER']);
const OTHER_TEACHER = user('teacher-2', ['GUARDIAN', 'TEACHER']);
const SUPERVISOR = user('super-1', ['SUPERVISOR']);

function build(
  options: {
    sharedAt?: Date | null;
    ownsStudent?: boolean;
    status?: string;
    supervises?: boolean;
  } = {},
) {
  const prisma = {
    lessonCard: {
      findUnique: jest.fn(async () => ({
        id: 'card-1',
        studentId: 'student-1',
        sharedAt: options.sharedAt === undefined ? new Date() : options.sharedAt,
        teacherId: 'teacher-1',
        class: { startsAt: new Date('2026-11-01T10:00:00Z') },
        student: { displayName: 'Maryam', familyId: 'family-1' },
      })),
    },
    revisionRequest: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rr-1',
        ...data,
        requestedBy: { id: 'guardian-1', name: 'Aisha' },
      })),
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status: options.status ?? 'OPEN',
        response: null,
        familyId: 'family-1',
        lessonCardId: 'card-1',
        student: { displayName: 'Maryam' },
        lessonCard: { teacherId: 'teacher-1' },
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'rr-1',
        ...data,
        respondedBy: { id: 'teacher-1', name: 'Ustadhah Zainab' },
      })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 3),
    },
    familyMember: {
      findMany: jest.fn(async () => [{ userId: 'guardian-1' }, { userId: 'guardian-2' }]),
    },
    supervisorAssignment: {
      findMany: jest.fn(async () => [{ teacher: { userId: 'teacher-1' } }]),
    },
  };
  const policies = {
    supervisesTeacherUser: jest.fn(async () => options.supervises !== false),
    assertGuardianOwnsStudent: jest.fn(async () => {
      if (options.ownsStudent === false) throw AppError.notOwner();
    }),
    assertGuardianInFamily: jest.fn(async (userId: string) => {
      if (userId !== 'guardian-1') throw AppError.notOwner();
    }),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
  const service = new RevisionRequestsService(
    prisma as never,
    policies as never,
    audit as never,
    notifications as never,
    { value: { APP_WEB_URL: 'http://localhost:3000/' } } as never,
  );
  return { service, prisma, policies, audit, notifications };
}

const CREATE = {
  lessonCardId: 'card-1',
  reason: 'REVISIT_PORTION' as const,
  message: 'Please go over 2:255 again',
};

describe('RevisionRequestsService.create', () => {
  it('records the request for the family and tells the card’s teacher', async () => {
    const { service, prisma, notifications } = build();

    await service.create({ ...CREATE, actor: GUARDIAN });

    expect(prisma.revisionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lessonCardId: 'card-1',
          studentId: 'student-1',
          familyId: 'family-1',
          requestedById: 'guardian-1',
          reason: 'REVISIT_PORTION',
        }),
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['teacher-1'],
        template: 'lesson-card.revision-requested',
        data: expect.objectContaining({
          reasonLabel: 'Revisit a portion',
          url: 'http://localhost:3000/teacher/revision-requests',
        }),
      }),
    );
  });

  it('refuses a guardian who does not own the student', async () => {
    const { service, prisma } = build({ ownsStudent: false });

    await expect(service.create({ ...CREATE, actor: GUARDIAN })).rejects.toBeInstanceOf(AppError);
    expect(prisma.revisionRequest.create).not.toHaveBeenCalled();
  });

  it('refuses a card that has not been shared with the family', async () => {
    const { service, prisma } = build({ sharedAt: null });

    await expect(service.create({ ...CREATE, actor: GUARDIAN })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
    expect(prisma.revisionRequest.create).not.toHaveBeenCalled();
  });

  it('refuses an empty or over-long message', async () => {
    const { service } = build();

    await expect(service.create({ ...CREATE, message: '   ', actor: GUARDIAN })).rejects.toThrow(
      /1 to 1000/,
    );
    await expect(
      service.create({ ...CREATE, message: 'x'.repeat(1001), actor: GUARDIAN }),
    ).rejects.toThrow(/1 to 1000/);
  });
});

describe('RevisionRequestsService.respond', () => {
  it('answers, audits and notifies every guardian in the family', async () => {
    const { service, prisma, audit, notifications } = build();

    await service.respond({
      id: 'rr-1',
      response: 'We will revisit it on Tuesday',
      actor: TEACHER,
    });

    expect(prisma.revisionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ANSWERED',
          response: 'We will revisit it on Tuesday',
          respondedById: 'teacher-1',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rec.revision-request.respond',
        targetId: 'rr-1',
        before: { status: 'OPEN', response: null },
      }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['guardian-1', 'guardian-2'],
        template: 'lesson-card.revision-answered',
        data: expect.objectContaining({ url: 'http://localhost:3000/parent/lesson-cards/card-1' }),
      }),
    );
  });

  it('a supervisor not assigned to the card’s teacher cannot answer it', async () => {
    const { service, prisma } = build({ supervises: false });
    await expect(
      service.respond({ id: 'rr-1', response: 'Answered', actor: SUPERVISOR }),
    ).rejects.toThrow(/Revision request/);
    expect(prisma.revisionRequest.update).not.toHaveBeenCalled();
  });

  it('an assigned supervisor’s all-requests view is limited to their teachers’ cards', async () => {
    const { service, prisma } = build();
    await service.list({ actor: SUPERVISOR, scope: 'all' });
    const where = (
      prisma.revisionRequest.findMany.mock.calls[0] as unknown as [{ where: unknown }]
    )[0].where;
    expect(JSON.stringify(where)).toContain('teacher-1');
  });

  it('lets a supervisor answer a request on an assigned teacher’s card', async () => {
    const { service, prisma } = build();

    await service.respond({ id: 'rr-1', response: 'Answered', actor: SUPERVISOR });

    expect(prisma.revisionRequest.update).toHaveBeenCalled();
  });

  it('refuses a teacher who did not write the card', async () => {
    const { service, prisma, notifications } = build();

    await expect(
      service.respond({ id: 'rr-1', response: 'Answered', actor: OTHER_TEACHER }),
    ).rejects.toBeInstanceOf(AppError);
    expect(prisma.revisionRequest.update).not.toHaveBeenCalled();
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('refuses to answer a request the family has closed', async () => {
    const { service } = build({ status: 'CLOSED' });

    await expect(
      service.respond({ id: 'rr-1', response: 'Answered', actor: TEACHER }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });
});

describe('RevisionRequestsService.close and list scopes', () => {
  it('lets a guardian of the family close it, and no one else', async () => {
    const { service, prisma } = build();

    await service.close({ id: 'rr-1', actor: GUARDIAN });
    expect(prisma.revisionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED' }) }),
    );

    await expect(service.close({ id: 'rr-1', actor: TEACHER })).rejects.toBeInstanceOf(AppError);
  });

  it('scopes a teacher’s queue to the cards they wrote', async () => {
    const { service, prisma } = build();

    await service.list({ actor: TEACHER, scope: 'teacher', status: 'OPEN' as never });

    expect(prisma.revisionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ lessonCard: { teacherId: 'teacher-1' } }, { status: 'OPEN' }] },
      }),
    );
  });

  it('scopes a guardian to their own family', async () => {
    const { service, prisma } = build();

    await service.list({ actor: GUARDIAN, scope: 'family' });

    expect(prisma.revisionRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ family: { members: { some: { userId: 'guardian-1' } } } }] },
      }),
    );
  });

  it('keeps the teacher queue and the all-requests view from non-staff', async () => {
    const { service } = build();

    await expect(service.list({ actor: GUARDIAN, scope: 'teacher' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    await expect(service.list({ actor: TEACHER, scope: 'all' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    await expect(service.list({ actor: SUPERVISOR, scope: 'all' })).resolves.toEqual([]);
  });
});

describe('RevisionRequestsService with messaging', () => {
  function buildThreaded(options: { openFails?: boolean; existingThread?: string | null } = {}) {
    const base = build();
    const prisma = Object.assign(base.prisma, {
      teacherProfile: { findUnique: jest.fn(async () => ({ id: 'profile-1' })) },
      messageThread: {
        findFirst: jest.fn(async () =>
          options.existingThread ? { id: options.existingThread } : null,
        ),
      },
    });
    prisma.revisionRequest.findUnique = jest.fn(async () => ({
      id: 'rr-1',
      status: 'OPEN',
      response: null,
      familyId: 'family-1',
      lessonCardId: 'card-1',
      threadId: 'thread-1',
      student: { displayName: 'Maryam' },
      lessonCard: { teacherId: 'teacher-1' },
    }));
    const messaging = {
      openThread: jest.fn(async () => {
        if (options.openFails) throw AppError.forbidden('That teacher does not teach your child');
        return { id: 'thread-1' };
      }),
      postMessage: jest.fn(async () => ({ id: 'msg-1' })),
    };
    const service = new RevisionRequestsService(
      prisma as never,
      base.policies as never,
      base.audit as never,
      base.notifications as never,
      { value: { APP_WEB_URL: 'http://localhost:3000/' } } as never,
      messaging as never,
    );
    return { ...base, service, prisma, messaging };
  }

  it('posts the request as a guardian message in the family-teacher thread', async () => {
    const { service, prisma, messaging, notifications } = buildThreaded();

    await service.create({ ...CREATE, actor: GUARDIAN });

    expect(messaging.openThread).toHaveBeenCalledWith(
      expect.objectContaining({
        familyId: 'family-1',
        teacherId: 'profile-1',
        studentId: 'student-1',
        actorRole: 'GUARDIAN',
      }),
    );
    expect(prisma.revisionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-1' }) }),
    );
    expect(messaging.postMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      senderId: 'guardian-1',
      senderRole: 'GUARDIAN',
      body: 'Revision request — Revisit a portion — lesson card 2026-11-01: Please go over 2:255 again',
    });
    // The new-message notification replaces the dedicated one.
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('reuses an existing thread when a new one may not be opened', async () => {
    const { service, prisma, messaging } = buildThreaded({
      openFails: true,
      existingThread: 'thread-old',
    });

    await service.create({ ...CREATE, actor: GUARDIAN });

    expect(prisma.revisionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ threadId: 'thread-old' }) }),
    );
    expect(messaging.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-old' }),
    );
  });

  it('falls back to the teacher notification when there is no thread', async () => {
    const { service, messaging, notifications } = buildThreaded({ openFails: true });

    await service.create({ ...CREATE, actor: GUARDIAN });

    expect(messaging.postMessage).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'lesson-card.revision-requested' }),
    );
  });

  it('posts the teacher’s reply in the thread and marks the request answered', async () => {
    const { service, prisma, messaging, notifications } = buildThreaded();

    await service.respond({ id: 'rr-1', response: 'Tuesday, in sha Allah', actor: TEACHER });

    expect(messaging.postMessage).toHaveBeenCalledWith({
      threadId: 'thread-1',
      senderId: 'teacher-1',
      senderRole: 'STAFF',
      body: 'Tuesday, in sha Allah',
    });
    expect(prisma.revisionRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ANSWERED' }) }),
    );
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('a supervisor answers on the request only, not in the thread', async () => {
    const { service, messaging, notifications } = buildThreaded();

    await service.respond({ id: 'rr-1', response: 'Answered', actor: SUPERVISOR });

    expect(messaging.postMessage).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'lesson-card.revision-answered' }),
    );
  });
});

describe('MessagingService.postMessage and revision requests', () => {
  function buildMessaging() {
    const createdAt = new Date('2026-11-06T09:00:00Z');
    const prisma = {
      messageThread: {
        findUnique: jest.fn(async () => ({
          id: 'thread-1',
          familyId: 'family-1',
          teacherId: 'profile-1',
        })),
        update: jest.fn(async () => ({})),
      },
      message: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'msg-1',
          ...data,
          createdAt,
        })),
      },
      teacherProfile: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [{ userId: 'teacher-1' }]),
      },
      familyMember: { findMany: jest.fn(async () => [{ userId: 'guardian-1' }]) },
      revisionRequest: { updateMany: jest.fn(async () => ({ count: 1 })) },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(prisma)),
    };
    const policy = { assertGuardianInFamily: jest.fn(async () => undefined) };
    const audit = { record: jest.fn(async () => undefined) };
    const notifications = { enqueue: jest.fn(async () => ({ queued: 1 })) };
    const service = new MessagingService(
      prisma as never,
      policy as never,
      audit as never,
      notifications as never,
    );
    return { service, prisma, notifications, createdAt };
  }

  it('a teacher message answers the open requests raised earlier in the thread', async () => {
    const { service, prisma, notifications, createdAt } = buildMessaging();

    await service.postMessage({
      threadId: 'thread-1',
      senderId: 'teacher-1',
      body: 'We will revisit it',
      senderRole: 'STAFF',
    });

    expect(prisma.revisionRequest.updateMany).toHaveBeenCalledWith({
      where: { threadId: 'thread-1', status: 'OPEN', createdAt: { lte: createdAt } },
      data: {
        status: 'ANSWERED',
        response: 'We will revisit it',
        respondedById: 'teacher-1',
        respondedAt: createdAt,
      },
    });
    // One notification, to the family.
    expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['guardian-1'], template: 'message.new' }),
    );
  });

  it('a guardian message leaves requests alone and notifies the teacher', async () => {
    const { service, prisma, notifications } = buildMessaging();

    await service.postMessage({
      threadId: 'thread-1',
      senderId: 'guardian-1',
      body: 'Thank you',
      senderRole: 'GUARDIAN',
    });

    expect(prisma.revisionRequest.updateMany).not.toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['teacher-1'], template: 'message.new' }),
    );
  });
});
