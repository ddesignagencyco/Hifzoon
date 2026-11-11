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
