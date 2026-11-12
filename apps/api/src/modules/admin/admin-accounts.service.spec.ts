import { AdminAccountsService } from './admin-accounts.service';

function build(user: Record<string, unknown> | null = {}) {
  const row = user && {
    id: 'u1',
    email: 'x@y.z',
    name: 'X',
    passwordHash: null,
    twoFactorEnabled: true,
    twoFactorSecret: 's',
    deletedAt: null,
    ...user,
  };
  const prisma: Record<string, any> = {
    user: {
      findUnique: jest.fn(async () => row),
      create: jest.fn(async ({ data }: any) => ({ id: 'new', email: data.email, name: data.name })),
      update: jest.fn(),
    },
    passwordResetToken: { updateMany: jest.fn(), create: jest.fn() },
    session: { updateMany: jest.fn(async () => ({ count: 2 })) },
    refreshToken: { updateMany: jest.fn(async () => ({ count: 2 })) },
    recoveryCode: { deleteMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  const notifications = { emailAddress: jest.fn(async (_a: any) => true) };
  const audit = { record: jest.fn() };
  const svc = new AdminAccountsService(
    prisma as never,
    audit as never,
    { issueOpaqueToken: () => 'tok', hashToken: (t: string) => `h-${t}` } as never,
    { value: { APP_WEB_URL: 'https://web.test/' } } as never,
    notifications as never,
  );
  return { svc, prisma, notifications, audit };
}

describe('AdminAccountsService', () => {
  it('creates a staff account without a password and emails an invite link', async () => {
    const { svc, prisma, notifications } = build(null);
    const result = await svc.createStaff(
      { email: ' New@Example.COM ', name: 'New Admin', roles: ['ADMIN'] },
      'boss',
    );
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.email).toBe('new@example.com');
    expect(data.passwordHash).toBeUndefined();
    expect(result.inviteEmailed).toBe(true);
    expect(notifications.emailAddress.mock.calls[0]?.[0].data.setPasswordUrl).toBe(
      'https://web.test/reset-password?token=tok',
    );
  });

  it('will not create super admins or duplicate accounts', async () => {
    await expect(
      build(null).svc.createStaff({ email: 'a@b.c', name: 'A B', roles: ['SUPER_ADMIN'] }, 'x'),
    ).rejects.toThrow(/Staff roles/);
    await expect(
      build({}).svc.createStaff({ email: 'a@b.c', name: 'A B', roles: ['ADMIN'] }, 'x'),
    ).rejects.toThrow(/already exists/);
  });

  it('only re-invites someone who has not set a password', async () => {
    await expect(build({ passwordHash: 'h' }).svc.resendInvite('u1', 'a')).rejects.toThrow(
      /already set a password/,
    );
    const ok = await build({ passwordHash: null }).svc.resendInvite('u1', 'a');
    expect(ok.inviteEmailed).toBe(true);
  });

  it('a password reset emails a link and signs the person out', async () => {
    const { svc, prisma, notifications } = build({ passwordHash: 'h' });
    const r = await svc.sendPasswordReset('u1', 'a');
    expect(r.sessionsRevoked).toBe(2);
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalled(); // earlier links die
    expect(notifications.emailAddress).toHaveBeenCalled();
  });

  it('resets two-factor, deletes recovery codes, and refuses to do it to yourself', async () => {
    const { svc, prisma } = build({});
    await svc.resetTwoFactor('u1', 'boss');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { twoFactorEnabled: false, twoFactorSecret: null },
    });
    expect(prisma.recoveryCode.deleteMany).toHaveBeenCalled();
    await expect(svc.resetTwoFactor('u1', 'u1')).rejects.toThrow(/your own/);
    await expect(
      build({ twoFactorEnabled: false, twoFactorSecret: null }).svc.resetTwoFactor('u1', 'boss'),
    ).rejects.toThrow(/not set up/);
  });

  it('revoking sessions marks sessions and refresh tokens revoked', async () => {
    const { svc, prisma } = build({});
    const r = await svc.revokeSessions('u1', 'a');
    expect(r.sessionsRevoked).toBe(2);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });
});
