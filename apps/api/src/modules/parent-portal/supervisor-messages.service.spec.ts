import { SupervisorMessagesService } from './supervisor-messages.service';

const supervisor = { userId: 'sup', roles: ['SUPERVISOR'] };
const superAdmin = { userId: 'boss', roles: ['SUPER_ADMIN'] };

function build(thread: Record<string, unknown> | null = null) {
  const prisma: Record<string, any> = {
    supervisorAssignment: { findMany: jest.fn(async () => [{ teacherId: 't1' }]) },
    messageThread: {
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
      findUnique: jest.fn(async () => thread),
    },
    message: {
      findMany: jest.fn(async () => [
        {
          id: 'm2',
          body: 'Second',
          createdAt: new Date('2026-11-02'),
          senderId: 'tu',
          sender: { name: 'Ali' },
        },
        {
          id: 'm1',
          body: 'First',
          createdAt: new Date('2026-11-01'),
          senderId: 'pu',
          sender: { name: 'Aisha' },
        },
      ]),
      updateMany: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
  const audit = { record: jest.fn() };
  return { svc: new SupervisorMessagesService(prisma as never, audit as never), prisma, audit };
}

const thread = {
  id: 'th',
  familyId: 'f',
  teacherId: 't1',
  studentId: 's',
  family: { id: 'f', name: 'Khan' },
  teacher: { id: 't1', userId: 'tu', user: { name: 'Ali' } },
};

describe('SupervisorMessagesService', () => {
  it('lists only the supervisor’s teachers and never the message text', async () => {
    const { svc, prisma } = build();
    await svc.listThreads(supervisor);
    expect(prisma.messageThread.findMany.mock.calls[0][0].where.teacherId).toEqual({ in: ['t1'] });
    expect(JSON.stringify(prisma.messageThread.findMany.mock.calls[0][0].include)).not.toContain(
      '"body"',
    );
  });

  it('refuses a teacher filter outside the caseload', async () => {
    await expect(build().svc.listThreads(supervisor, { teacherId: 'other' })).rejects.toThrow(
      /caseload/,
    );
  });

  it('opening a thread reads oldest-first, labels who wrote what, and is audited', async () => {
    const { svc, audit } = build(thread);
    const r = await svc.getThread(supervisor, 'th');
    expect(r.readOnly).toBe(true);
    expect(r.messages.map((m) => [m.body, m.from])).toEqual([
      ['First', 'GUARDIAN'],
      ['Second', 'TEACHER'],
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'par.messages.supervisorView',
        targetId: 'th',
        actorId: 'sup',
      }),
    );
    // The log names the thread; it does not copy what was said.
    expect(JSON.stringify(audit.record.mock.calls[0])).not.toContain('First');
  });

  it('never marks messages read', async () => {
    const { svc, prisma } = build(thread);
    await svc.getThread(supervisor, 'th');
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('a thread of an unassigned teacher reads as not found and is not audited', async () => {
    const { svc, audit } = build({ ...thread, teacherId: 'other' });
    await expect(svc.getThread(supervisor, 'th')).rejects.toThrow(/Thread/);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('a super admin is unscoped', async () => {
    const { svc, prisma } = build({ ...thread, teacherId: 'other' });
    await svc.getThread(superAdmin, 'th');
    expect(prisma.supervisorAssignment.findMany).not.toHaveBeenCalled();
  });
});
