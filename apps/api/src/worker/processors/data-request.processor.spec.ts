import { DataRequestProcessor } from './data-request.processor';

const DAY = 86_400_000;

function build(rows: Array<Record<string, unknown>>, claimCount = 1) {
  const prisma = {
    dataRequest: {
      findMany: jest.fn(async () => rows),
      findUnique: jest.fn(async () => rows[0] ?? null),
      updateMany: jest.fn(async () => ({ count: claimCount })),
    },
    user: { findMany: jest.fn(async () => [{ id: 'admin-1' }, { id: 'admin-2' }]) },
    $transaction: jest.fn(async () => []),
  };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 2 })) };
  const processor = new DataRequestProcessor(prisma as never, {} as never, notifications as never);
  return { processor, prisma, notifications };
}

const now = new Date('2026-11-06T09:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  id: '0190abcd-0000-0000-0000-000000000000',
  type: 'EXPORT',
  status: 'REQUESTED',
  dueAt: new Date(now.getTime() + 3 * DAY),
  slaNotifiedAt: null,
  family: { name: 'Khan family' },
  ...over,
});

describe('DataRequestProcessor.checkSla (CR-05)', () => {
  it('warns every admin about an open request within 7 days of its deadline', async () => {
    const { processor, prisma, notifications } = build([row()]);
    const result = await processor.checkSla(now);

    expect(result).toEqual({ approaching: 1, notified: 1 });
    const where = (prisma.dataRequest.findMany.mock.calls[0] as unknown as [{ where: any }])[0]
      .where;
    expect(where.dueAt.lt).toEqual(new Date(now.getTime() + 7 * DAY));
    expect(where.status).toEqual({ notIn: ['COMPLETED', 'REJECTED'] });
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['admin-1', 'admin-2'],
        template: 'consent.data-request-deadline',
        data: expect.objectContaining({
          reference: '0190ABCD',
          familyName: 'Khan family',
          dueDate: '2026-11-09',
          status: 'requested',
        }),
      }),
    );
  });

  it('warns at most once per request per day', async () => {
    const earlierToday = new Date('2026-11-06T01:00:00Z');
    const { processor, notifications } = build([row({ slaNotifiedAt: earlierToday })]);
    expect(await processor.checkSla(now)).toEqual({ approaching: 1, notified: 0 });
    expect(notifications.enqueue).not.toHaveBeenCalled();

    const yesterday = new Date('2026-11-05T23:00:00Z');
    const again = build([row({ slaNotifiedAt: yesterday })]);
    expect(await again.processor.checkSla(now)).toEqual({ approaching: 1, notified: 1 });
  });

  it('does not warn twice when another run claimed the request first', async () => {
    const { processor, notifications } = build([row()], 0);
    expect(await processor.checkSla(now)).toEqual({ approaching: 1, notified: 0 });
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });

  it('calls a request past its deadline overdue', async () => {
    const { processor, notifications } = build([row({ dueAt: new Date(now.getTime() - DAY) })]);
    await processor.checkSla(now);
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'overdue' }) }),
    );
  });
});

describe('DataRequestProcessor deletion', () => {
  it('erases nothing for a request an admin rejected', async () => {
    const { processor, prisma } = build([
      { id: 'dr-1', type: 'DELETE', status: 'REJECTED', familyId: 'f1' },
    ]);
    const result = await processor.handle({
      name: 'process-deletion',
      data: { dataRequestId: 'dr-1' },
    } as never);
    expect(result).toEqual({ skipped: 'request was rejected' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
