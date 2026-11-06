import { RetentionProcessor } from './retention.processor';

function build(sessions: Array<{ id: string; audioKey: string }>, failing: string[] = []) {
  const prisma = {
    practiceSession: {
      findMany: jest.fn(async () => sessions),
      update: jest.fn(async () => ({})),
    },
  };
  const storage = {
    remove: jest.fn(async (key: string) => {
      if (failing.includes(key)) throw new Error('storage down');
    }),
  };
  const processor = new RetentionProcessor(prisma as never, storage as never);
  return { processor, prisma, storage };
}

describe('RetentionProcessor practice audio', () => {
  it('takes audio that is 30 days old or due sooner (consent withdrawn, erasure)', async () => {
    const { processor, prisma } = build([]);
    await processor.handle({ name: 'delete-ai-audio', data: {} } as never);

    const where = (
      prisma.practiceSession.findMany.mock.calls[0] as never as [{ where: { OR: unknown[] } }]
    )[0].where;
    expect(where.OR).toEqual([
      { startedAt: { lte: expect.any(Date) } },
      { audioDeleteAfter: { lte: expect.any(Date) } },
    ]);
  });

  it('forgets a key only after its file is removed, so a failed delete is retried', async () => {
    const { processor, prisma } = build(
      [
        { id: 's1', audioKey: 'practice/a/1.webm' },
        { id: 's2', audioKey: 'practice/a/2.webm' },
      ],
      ['practice/a/2.webm'],
    );
    await expect(processor.handle({ name: 'delete-ai-audio', data: {} } as never)).resolves.toEqual(
      {
        deleted: 1,
      },
    );
    expect(prisma.practiceSession.update).toHaveBeenCalledTimes(1);
    expect(prisma.practiceSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });
});
