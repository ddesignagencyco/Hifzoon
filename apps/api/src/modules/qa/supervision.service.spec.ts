import { SupervisionService } from './supervision.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

function build(
  opts: {
    isSupervisor?: boolean;
    teacher?: Record<string, unknown> | null;
    existing?: boolean;
  } = {},
) {
  const prisma = {
    userRole: { count: jest.fn(async () => (opts.isSupervisor === false ? 0 : 1)) },
    teacherProfile: {
      findUnique: jest.fn(async () =>
        opts.teacher === undefined ? { id: 'tp-1', userId: 'user-t' } : opts.teacher,
      ),
    },
    supervisorAssignment: {
      findUnique: jest.fn(async () => (opts.existing ? { id: 'a' } : null)),
      create: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new SupervisionService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
}

describe('SupervisionService', () => {
  it('assigns a teacher to a supervisor and audits it', async () => {
    const { service, prisma, audit } = build();
    await service.assign('sup-1', 'tp-1', 'admin-1');
    expect(prisma.supervisorAssignment.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supervision.assign' }),
    );
  });

  it('is idempotent for an existing pair', async () => {
    const { service, prisma, audit } = build({ existing: true });
    await service.assign('sup-1', 'tp-1', 'admin-1');
    expect(prisma.supervisorAssignment.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses a user who is not a supervisor', async () => {
    const { service } = build({ isSupervisor: false });
    await expect(service.assign('u', 'tp-1', 'admin-1')).rejects.toThrow(/not a supervisor/);
  });

  it('refuses an unknown teacher and self-supervision', async () => {
    await expect(build({ teacher: null }).service.assign('sup-1', 'x', 'a')).rejects.toThrow(
      /not found/i,
    );
    await expect(build().service.assign('user-t', 'tp-1', 'a')).rejects.toThrow(/themselves/);
  });

  it('unassigns and audits only when something was removed', async () => {
    const { service, audit } = build();
    await service.unassign('sup-1', 'tp-1', 'admin-1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'supervision.unassign' }),
    );
  });
});
