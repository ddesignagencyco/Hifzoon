import { RetentionProcessor } from './retention.processor';

const HOUR = 3_600_000;

function build(objects: Record<string, Array<{ key: string; ageHours: number }>>) {
  const now = Date.now();
  const prisma = {
    teacherApplication: {
      findMany: jest.fn(async () => [{ recitationAudioUrl: 'recitations/2026/submitted.webm' }]),
    },
    applicationDocument: {
      findMany: jest.fn(async () => [{ fileUrl: 'documents/2026/id.pdf' }]),
    },
    teacherProfile: {
      findMany: jest.fn(async () => [{ recitationSampleUrl: 'recitations/2026/sample.webm' }]),
    },
  };
  const storage = {
    listObjects: jest.fn(async (prefix: string) =>
      (objects[prefix] ?? []).map((o) => ({
        key: o.key,
        lastModified: new Date(now - o.ageHours * HOUR),
      })),
    ),
    remove: jest.fn(async () => undefined),
  };
  const processor = new RetentionProcessor(prisma as never, storage as never);
  return { processor, prisma, storage };
}

describe('RetentionProcessor public uploads nothing refers to', () => {
  it('removes day-old uploads no application or profile refers to, and only those', async () => {
    const { processor, storage } = build({
      'recitations/': [
        { key: 'recitations/2026/abandoned.webm', ageHours: 30 },
        { key: 'recitations/2026/submitted.webm', ageHours: 30 },
        { key: 'recitations/2026/sample.webm', ageHours: 300 },
        // Still inside the day an applicant has to press submit.
        { key: 'recitations/2026/in-progress.webm', ageHours: 2 },
      ],
      'documents/': [
        { key: 'documents/2026/id.pdf', ageHours: 48 },
        { key: 'documents/2026/stray.png', ageHours: 48 },
      ],
    });

    await expect(
      processor.handle({ name: 'delete-orphan-uploads', data: {} } as never),
    ).resolves.toEqual({ deleted: 2 });
    expect(storage.remove.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'recitations/2026/abandoned.webm',
      'documents/2026/stray.png',
    ]);
  });

  it('asks the database only about the stale keys', async () => {
    const { processor, prisma } = build({
      'recitations/': [
        { key: 'recitations/2026/old.webm', ageHours: 25 },
        { key: 'recitations/2026/new.webm', ageHours: 1 },
      ],
    });

    await processor.handle({ name: 'delete-orphan-uploads', data: {} } as never);
    expect(prisma.teacherApplication.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.teacherApplication.findMany).toHaveBeenCalledWith({
      where: { recitationAudioUrl: { in: ['recitations/2026/old.webm'] } },
      select: { recitationAudioUrl: true },
    });
  });
});
