import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';

function service(overrides: Array<{ role: string; permission: string; granted: boolean }> = []) {
  const prisma = {
    permissionOverride: {
      findMany: jest.fn(async () => overrides),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async () => ({})),
    },
  };
  return {
    svc: new PermissionsService(prisma as never, { record: jest.fn() } as never),
    prisma,
  };
}

describe('PermissionsService', () => {
  it('uses the catalogue defaults when nothing is overridden', async () => {
    const { svc } = service();
    expect(await svc.can(['ADMIN'], 'billing.classCredit.issue')).toBe(true);
    expect(await svc.can(['SUPERVISOR'], 'billing.classCredit.issue')).toBe(false);
    expect(await svc.can(['ADMIN'], 'payroll.adjust')).toBe(false);
  });

  it('super admin always passes, even for an unknown key', async () => {
    const { svc } = service();
    expect(await svc.can(['SUPER_ADMIN'], 'payroll.adjust')).toBe(true);
    expect(await svc.can(['SUPER_ADMIN'], 'nope')).toBe(true);
    expect(await svc.can(['ADMIN'], 'nope')).toBe(false);
  });

  it('an override can grant or withdraw against the default', async () => {
    const { svc } = service([
      { role: 'SUPERVISOR', permission: 'analytics.view', granted: true },
      { role: 'ADMIN', permission: 'families.edit', granted: false },
    ]);
    expect(await svc.can(['SUPERVISOR'], 'analytics.view')).toBe(true);
    expect(await svc.can(['ADMIN'], 'families.edit')).toBe(false);
  });

  it('holding several roles, any one granting is enough', async () => {
    const { svc } = service();
    expect(await svc.can(['SUPERVISOR', 'ADMIN'], 'families.view')).toBe(true);
  });

  it('refuses to configure super admin, unknown permissions or non-staff roles', async () => {
    const { svc } = service();
    await expect(
      svc.set({ role: 'SUPER_ADMIN', permission: 'payroll.adjust', granted: false }, 'a'),
    ).rejects.toThrow(/Only/);
    await expect(
      svc.set({ role: 'ADMIN', permission: 'made.up', granted: true }, 'a'),
    ).rejects.toThrow(/Unknown/);
    await expect(
      svc.set({ role: 'TEACHER', permission: 'payroll.adjust', granted: true }, 'a'),
    ).rejects.toThrow(/Only/);
  });

  it('setting a value back to its default removes the override row', async () => {
    const { svc, prisma } = service();
    await svc.set({ role: 'ADMIN', permission: 'families.edit', granted: true }, 'a');
    expect(prisma.permissionOverride.deleteMany).toHaveBeenCalled();
    expect(prisma.permissionOverride.upsert).not.toHaveBeenCalled();
    await svc.set({ role: 'SUPERVISOR', permission: 'families.edit', granted: true }, 'a');
    expect(prisma.permissionOverride.upsert).toHaveBeenCalled();
  });

  it('the matrix marks super admin locked and shows defaults vs overrides', async () => {
    const { svc } = service([{ role: 'SUPERVISOR', permission: 'analytics.view', granted: true }]);
    const m = await svc.matrix();
    const row = m.permissions.find((p) => p.key === 'analytics.view')!;
    expect(row.grants.SUPERVISOR).toMatchObject({
      granted: true,
      isDefault: false,
      default: false,
    });
    expect(row.grants.SUPER_ADMIN).toMatchObject({ granted: true, locked: true });
  });
});

describe('PermissionGuard', () => {
  const ctx = (roles: string[]) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  it('lets a route without the decorator through', async () => {
    const guard = new PermissionGuard({ getAllAndOverride: () => undefined } as never, {} as never);
    expect(await guard.canActivate(ctx([]))).toBe(true);
  });

  it('blocks a role without the permission', async () => {
    const { svc } = service();
    const guard = new PermissionGuard({ getAllAndOverride: () => 'payroll.adjust' } as never, svc);
    await expect(guard.canActivate(ctx(['ADMIN']))).rejects.toThrow(/permission/);
    expect(await guard.canActivate(ctx(['SUPER_ADMIN']))).toBe(true);
  });
});
