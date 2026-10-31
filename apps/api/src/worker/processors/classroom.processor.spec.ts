import { ClassroomProcessor } from './classroom.processor';

/**
 * The recording lifecycle is driven by provider webhooks, which arrive out of order:
 * an `egress_started` can land after an `egress_ended` that already produced clips. The
 * processor must only ever advance the status, never rewind it, or a finished recording
 * would go back to RECORDING and become unplayable. These tests pin that monotonic rule
 * (FR-CLS-12, FR-REC-10).
 */
function buildProcessor(existingStatus: string) {
  const prisma = {
    recording: {
      findUnique: jest.fn(async () => ({ id: 'rec-1', status: existingStatus })),
      update: jest.fn(async ({ data }: { data: { status: string } }) => ({
        id: 'rec-1',
        status: data.status,
        deleteAfter: null,
      })),
    },
  };
  const processor = new ClassroomProcessor(prisma as never, {} as never, {} as never);
  return { processor, prisma };
}

function handle(processor: ClassroomProcessor, data: Record<string, unknown>) {
  return processor.handle({
    name: 'handle-recording-webhook',
    data,
  } as never);
}

describe('ClassroomProcessor.handleRecordingWebhook', () => {
  it('advances a RECORDING row to READY when the egress ends', async () => {
    const { processor, prisma } = buildProcessor('RECORDING');

    const result = await handle(processor, {
      recordingId: 'rec-1',
      classId: 'class-1',
      status: 'READY',
      storageKey: 'recordings/class-1/clip.mp4',
      durationSeconds: 1800,
    });

    expect(prisma.recording.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rec-1' },
        data: expect.objectContaining({ status: 'READY' }),
      }),
    );
    expect(result).toMatchObject({ status: 'READY' });
  });

  it('ignores an out-of-order RECORDING event once the row is already READY', async () => {
    const { processor, prisma } = buildProcessor('READY');

    const result = await handle(processor, {
      recordingId: 'rec-1',
      classId: 'class-1',
      status: 'RECORDING',
    });

    expect(result).toEqual({ ignored: true, current: 'READY' });
    expect(prisma.recording.update).not.toHaveBeenCalled();
  });

  it('ignores an out-of-order PENDING event once the row has FAILED', async () => {
    const { processor, prisma } = buildProcessor('FAILED');

    const result = await handle(processor, {
      recordingId: 'rec-1',
      classId: 'class-1',
      status: 'PENDING',
    });

    expect(result).toEqual({ ignored: true, current: 'FAILED' });
    expect(prisma.recording.update).not.toHaveBeenCalled();
  });

  it('treats a redelivered READY event as a harmless no-op change', async () => {
    const { processor, prisma } = buildProcessor('READY');

    const result = await handle(processor, {
      recordingId: 'rec-1',
      classId: 'class-1',
      status: 'READY',
      storageKey: 'recordings/class-1/clip.mp4',
    });

    // Equal rank is not a rewind, so the (idempotent) update runs and the row stays READY.
    expect(result).toMatchObject({ status: 'READY' });
    expect(prisma.recording.update).toHaveBeenCalledTimes(1);
  });

  it('skips cleanly when the recording row does not exist', async () => {
    const prisma = {
      recording: {
        findUnique: jest.fn(async () => null),
        update: jest.fn(),
      },
    };
    const processor = new ClassroomProcessor(prisma as never, {} as never, {} as never);

    const result = await handle(processor, { recordingId: 'missing', status: 'READY' });

    expect(result).toEqual({ skipped: 'recording not found' });
    expect(prisma.recording.update).not.toHaveBeenCalled();
  });
});

/**
 * Closing a finished class decides its outcome from who actually joined (B37). Payroll keys
 * off COMPLETED and families can rate COMPLETED classes, so a class nobody attended must
 * not land there.
 */
describe('ClassroomProcessor close-classes (B37)', () => {
  function buildCloser(roles: Record<string, string[]>) {
    const ids = Object.keys(roles);
    const updates: Array<{ ids: string[]; status: string }> = [];
    const prisma = {
      classSession: {
        findMany: jest.fn(async () => ids.map((id) => ({ id }))),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: { in: string[] } };
            data: { status: string };
          }) => {
            updates.push({ ids: where.id.in, status: data.status });
            return { count: where.id.in.length };
          },
        ),
      },
      classParticipant: {
        findMany: jest.fn(async () =>
          ids.flatMap((classId) => roles[classId].map((role) => ({ classId, role }))),
        ),
      },
    };
    const classroom = {
      promoteStartedClasses: jest.fn(async () => 0),
      closeAttendance: jest.fn(async () => ({ closed: 0 })),
      endRooms: jest.fn(async (ids: string[]) => ids.length),
    };
    const processor = new ClassroomProcessor(prisma as never, {} as never, classroom as never);
    return { processor, updates, classroom };
  }

  const statusOf = (updates: Array<{ ids: string[]; status: string }>, id: string) =>
    updates.find((u) => u.ids.includes(id))?.status;

  it('marks a class COMPLETED only when the teacher and the student side both joined', async () => {
    const { processor, updates } = buildCloser({
      both: ['TEACHER', 'STUDENT'],
      guardianOnly: ['TEACHER', 'GUARDIAN_VIEWER'],
      noStudent: ['TEACHER'],
      noTeacher: ['STUDENT'],
      nobody: [],
      supervisorOnly: ['SUPERVISOR'],
    });

    await processor.handle({ name: 'close-classes', data: {} } as never);

    expect(statusOf(updates, 'both')).toBe('COMPLETED');
    expect(statusOf(updates, 'guardianOnly')).toBe('COMPLETED');
    expect(statusOf(updates, 'noStudent')).toBe('NO_SHOW_STUDENT');
    expect(statusOf(updates, 'noTeacher')).toBe('NO_SHOW_TEACHER');
    expect(statusOf(updates, 'nobody')).toBe('NO_SHOW_TEACHER');
    expect(statusOf(updates, 'supervisorOnly')).toBe('NO_SHOW_TEACHER');
  });

  it('promotes started classes to LIVE before closing (B36)', async () => {
    const { processor, classroom } = buildCloser({ a: ['TEACHER', 'STUDENT'] });
    await processor.handle({ name: 'close-classes', data: {} } as never);
    expect(classroom.promoteStartedClasses).toHaveBeenCalledTimes(1);
  });
});

/**
 * Reconciliation talks to the *recording* bucket, not Cloudinary. A storage outage must
 * never be read as "the file is gone": that would turn every READY recording into FAILED.
 */
describe('ClassroomProcessor reconcile-recordings', () => {
  function buildReconciler(configured: boolean, objectExists: jest.Mock) {
    const prisma = {
      recording: {
        findMany: jest.fn(async () => [
          { id: 'rec-1', storageKey: 'recordings/class-1/class.mp4' },
        ]),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const recordings = { configured, objectExists };
    const processor = new ClassroomProcessor(prisma as never, recordings as never, {} as never);
    return { processor, prisma, recordings };
  }

  it('skips when recording storage is not configured instead of failing every row', async () => {
    const { processor, prisma, recordings } = buildReconciler(false, jest.fn());

    const result = await processor.handle({ name: 'reconcile-recordings', data: {} } as never);

    expect(result).toMatchObject({ scanned: 0, skipped: 'recording storage not configured' });
    expect(recordings.objectExists).not.toHaveBeenCalled();
    expect(prisma.recording.updateMany).not.toHaveBeenCalled();
  });

  it('does not mark a recording FAILED when the bucket is unreachable', async () => {
    const exists = jest.fn(async () => {
      throw new Error('connection reset');
    });
    const { processor, prisma } = buildReconciler(true, exists);

    const result = await processor.handle({ name: 'reconcile-recordings', data: {} } as never);

    expect(result).toMatchObject({ scanned: 1, missing: 0 });
    expect(prisma.recording.updateMany).not.toHaveBeenCalled();
  });

  it('marks only a genuinely missing object FAILED', async () => {
    const { processor, prisma } = buildReconciler(
      true,
      jest.fn(async () => false),
    );

    const result = await processor.handle({ name: 'reconcile-recordings', data: {} } as never);

    expect(result).toMatchObject({ scanned: 1, missing: 1 });
    expect(prisma.recording.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['rec-1'] } },
      data: { status: 'FAILED' },
    });
  });
});
