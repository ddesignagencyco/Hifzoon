import { DataRequestsAdminService } from './data-requests-admin.service';

function build(
  request: Record<string, unknown> | null = { status: 'REQUESTED' },
  updatedCount = 1,
) {
  const prisma = {
    dataRequest: {
      findMany: jest.fn(async () => [
        {
          id: '0190aaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          type: 'DELETE',
          status: 'REQUESTED',
          requestedAt: new Date('2026-10-01T00:00:00Z'),
          dueAt: new Date('2026-10-31T00:00:00Z'),
          completedAt: null,
          rejectionReason: null,
          family: { id: 'f1', name: 'Khan family' },
          student: null,
        },
        {
          id: '0190ffff-bbbb-cccc-dddd-eeeeeeeeeeee',
          type: 'EXPORT',
          status: 'COMPLETED',
          requestedAt: new Date('2026-09-01T00:00:00Z'),
          dueAt: new Date('2026-10-01T00:00:00Z'),
          completedAt: new Date('2026-09-02T00:00:00Z'),
          rejectionReason: null,
          family: { id: 'f2', name: 'Ali family' },
          student: null,
        },
      ]),
      findUnique: jest.fn(async () =>
        request ? { id: 'dr-1', type: 'DELETE', familyId: 'f1', ...request } : null,
      ),
      updateMany: jest.fn(async () => ({ count: updatedCount })),
    },
    familyMember: { findMany: jest.fn(async () => [{ userId: 'g1' }, { userId: 'g2' }]) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const notifications = { enqueue: jest.fn(async () => ({ queued: 2 })) };
  const service = new DataRequestsAdminService(
    prisma as never,
    audit as never,
    notifications as never,
  );
  return { service, prisma, audit, notifications };
}

describe('DataRequestsAdminService.list', () => {
  it('flags open requests past their deadline as overdue, never finished ones', async () => {
    const { service } = build();
    const rows = await service.list({}, new Date('2026-11-06T00:00:00Z'));
    expect(rows.map((r) => [r.reference, r.overdue])).toEqual([
      ['0190AAAA', true],
      ['0190FFFF', false],
    ]);
  });

  it('narrows to requested / in-progress with openOnly', async () => {
    const { service, prisma } = build();
    await service.list({ openOnly: true });
    const where = (prisma.dataRequest.findMany.mock.calls[0] as unknown as [{ where: any }])[0]
      .where;
    expect(where.status).toEqual({ in: ['REQUESTED', 'IN_PROGRESS'] });
  });
});

describe('DataRequestsAdminService.reject', () => {
  it('refuses an open request with a reason, audits it and tells the guardians', async () => {
    const { service, prisma, audit, notifications } = build();
    const result = await service.reject({
      dataRequestId: 'dr-1',
      reason: '  Open safeguarding case  ',
      actorUserId: 'admin-1',
    });

    expect(result).toEqual({
      id: 'dr-1',
      status: 'REJECTED',
      rejectionReason: 'Open safeguarding case',
    });
    // Conditional on still being open, so it cannot overwrite a finished request.
    expect(prisma.dataRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'dr-1', status: { in: ['REQUESTED', 'IN_PROGRESS'] } },
      data: { status: 'REJECTED', rejectionReason: 'Open safeguarding case' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'data-request.reject', actorId: 'admin-1' }),
    );
    expect(notifications.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['g1', 'g2'],
        template: 'consent.data-request-rejected',
        data: expect.objectContaining({ type: 'deletion', reason: 'Open safeguarding case' }),
      }),
    );
  });

  it('will not refuse a request that is already finished', async () => {
    const { service, audit } = build({ status: 'COMPLETED' }, 0);
    await expect(
      service.reject({ dataRequestId: 'dr-1', reason: 'Too late', actorUserId: 'admin-1' }),
    ).rejects.toThrow(/already completed/);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('needs a reason and an existing request', async () => {
    await expect(
      build().service.reject({ dataRequestId: 'dr-1', reason: '   ', actorUserId: 'a' }),
    ).rejects.toThrow(/reason/);
    await expect(
      build(null).service.reject({ dataRequestId: 'nope', reason: 'Duplicate', actorUserId: 'a' }),
    ).rejects.toThrow(/not found/i);
  });
});
