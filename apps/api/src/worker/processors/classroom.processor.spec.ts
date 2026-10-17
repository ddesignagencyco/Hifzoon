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
