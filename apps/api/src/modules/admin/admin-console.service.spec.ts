import { AdminConsoleService } from './admin-console.service';

describe('AdminConsoleService.provisionTeacher — email case (backlog 11)', () => {
  it('stores the account and application email lowercased so login can find it', async () => {
    const userCreate = jest.fn(async (_a: { data: { email: string } }) => ({ id: 'u1' }));
    const appCreate = jest.fn(async (_a: { data: { email: string } }) => ({ id: 'app1' }));
    const userFindUnique = jest.fn(async () => null);
    const tx = {
      user: { create: userCreate },
      teacherProfile: { create: jest.fn(async () => ({ id: 'tp1' })) },
      teacherApplication: { create: appCreate },
      hiringStep: { createMany: jest.fn() },
    };
    const prisma = {
      user: { findUnique: userFindUnique },
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AdminConsoleService(
      prisma as never,
      { record: jest.fn() } as never,
      { hashPassword: jest.fn(async () => 'hash') } as never,
    );

    await service.provisionTeacher({
      email: '  Ustadh.Ali@Example.COM ',
      name: 'Ali',
      password: 'x',
      languages: [],
      subjects: [],
      ageGroups: [],
      actorId: 'admin',
    });

    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ustadh.ali@example.com' } }),
    );
    expect(userCreate.mock.calls[0]?.[0].data.email).toBe('ustadh.ali@example.com');
    expect(appCreate.mock.calls[0]?.[0].data.email).toBe('ustadh.ali@example.com');
  });
});

describe('AdminConsoleService — super admin safety (medium)', () => {
  function build(opts: { targetIsSuper: boolean; otherSupers: number; status?: string }) {
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'target',
          status: opts.status ?? 'ACTIVE',
          email: 'x@y.z',
          name: 'T',
        })),
        count: jest.fn(async () => opts.otherSupers),
        update: jest.fn(),
      },
      userRole: {
        findFirst: jest.fn(async () => (opts.targetIsSuper ? { userId: 'target' } : null)),
        findMany: jest.fn(async () => []),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      session: { deleteMany: jest.fn() },
      $transaction: jest.fn(async () => []),
    };
    const service = new AdminConsoleService(
      prisma as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    return { service, prisma };
  }

  it('refuses to lock your own account', async () => {
    const { service } = build({ targetIsSuper: false, otherSupers: 3 });
    await expect(service.setUserStatus('me', 'LOCKED', 'me')).rejects.toThrow(/your own/);
  });

  it('refuses to lock the last active super admin', async () => {
    const { service } = build({ targetIsSuper: true, otherSupers: 0 });
    await expect(service.setUserStatus('target', 'DISABLED', 'admin')).rejects.toThrow(
      /last active super admin/,
    );
  });

  it('allows locking a super admin when another remains', async () => {
    const { service } = build({ targetIsSuper: true, otherSupers: 1 });
    await expect(service.setUserStatus('target', 'LOCKED', 'admin')).resolves.toBeDefined();
  });

  it('refuses to change your own roles', async () => {
    const { service, prisma } = build({ targetIsSuper: true, otherSupers: 2 });
    await expect(service.setRoles('me', ['ADMIN'], 'me')).rejects.toThrow(/your own roles/);
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to strip the role from the last super admin', async () => {
    const { service } = build({ targetIsSuper: true, otherSupers: 0 });
    await expect(service.setRoles('target', ['ADMIN'], 'other')).rejects.toThrow(
      /last active super admin/,
    );
  });
});

describe('AdminConsoleService.listExaminers', () => {
  function build() {
    const findMany = jest.fn(async () => [{ id: 'x1', name: 'Qari Ibrahim', email: 'q@x.com' }]);
    const service = new AdminConsoleService(
      { user: { findMany } } as never,
      { record: jest.fn() } as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('lists only active, non-deleted users holding the EXAMINER role, by name', async () => {
    const { service, findMany } = build();
    const rows = await service.listExaminers();
    expect(rows).toEqual([{ id: 'x1', name: 'Qari Ibrahim', email: 'q@x.com' }]);
    const args = (findMany.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(args.where).toMatchObject({
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: 'EXAMINER' } },
    });
    expect(args.select).toEqual({ id: true, name: true, email: true });
  });

  it('searches name or email when asked', async () => {
    const { service, findMany } = build();
    await service.listExaminers({ q: ' qari ' });
    const where = (findMany.mock.calls[0] as unknown as [{ where: object }])[0].where;
    expect(JSON.stringify(where)).toContain('qari');
  });
});
