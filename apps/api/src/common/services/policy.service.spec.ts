import { isScopedSupervisor, PolicyService } from './policy.service';
import type { PrismaService } from '../../prisma/prisma.service';

function build(
  opts: {
    assigned?: string[];
    enrolment?: number;
    classStudent?: number;
    classCount?: number;
  } = {},
) {
  const prisma = {
    supervisorAssignment: {
      findMany: jest.fn(async () => (opts.assigned ?? []).map((teacherId) => ({ teacherId }))),
      count: jest.fn(async () => 0),
    },
    enrolment: { count: jest.fn(async () => opts.enrolment ?? 0) },
    classStudent: { count: jest.fn(async () => opts.classStudent ?? 0) },
    classSession: { count: jest.fn(async () => opts.classCount ?? 0) },
    student: { count: jest.fn(async () => 0) },
    classParticipant: { count: jest.fn(async () => 0) },
  };
  return { policy: new PolicyService(prisma as unknown as PrismaService), prisma };
}

const supervisor = { userId: 'sup-1', roles: ['SUPERVISOR'] };

describe('isScopedSupervisor', () => {
  it('is true only for a supervisor with no wider staff role', () => {
    expect(isScopedSupervisor(supervisor)).toBe(true);
    expect(isScopedSupervisor({ userId: 'x', roles: ['SUPERVISOR', 'ADMIN'] })).toBe(false);
    expect(isScopedSupervisor({ userId: 'x', roles: ['SUPERVISOR', 'SUPER_ADMIN'] })).toBe(false);
    expect(isScopedSupervisor({ userId: 'x', roles: ['ADMIN'] })).toBe(false);
  });
});

describe('PolicyService supervisor scoping', () => {
  it('lets a supervisor reach a student of an assigned teacher', async () => {
    const { policy } = build({ assigned: ['tp-1'], enrolment: 1 });
    await expect(policy.canAccessStudent(supervisor, 'student-1')).resolves.toBe(true);
  });

  it('refuses a supervisor a student nobody they oversee teaches', async () => {
    const { policy } = build({ assigned: ['tp-1'] });
    await expect(policy.canAccessStudent(supervisor, 'student-1')).resolves.toBe(false);
    await expect(policy.assertStudentAccess(supervisor, 'student-1')).rejects.toThrow(/access/);
  });

  it('refuses a supervisor with an empty caseload without querying students', async () => {
    const { policy, prisma } = build({ assigned: [] });
    await expect(policy.canAccessStudent(supervisor, 'student-1')).resolves.toBe(false);
    expect(prisma.enrolment.count).not.toHaveBeenCalled();
  });

  it('gives admins and super admins unscoped access', async () => {
    const { policy, prisma } = build();
    await expect(policy.canAccessStudent({ userId: 'a', roles: ['ADMIN'] }, 's')).resolves.toBe(
      true,
    );
    await expect(
      policy.assertClassRead({ userId: 'a', roles: ['SUPER_ADMIN'] }, 'c'),
    ).resolves.toBeUndefined();
    expect(prisma.supervisorAssignment.findMany).not.toHaveBeenCalled();
  });

  it('limits a supervisor to classes of assigned teachers', async () => {
    const allowed = build({ classCount: 1 });
    await expect(allowed.policy.assertClassRead(supervisor, 'class-1')).resolves.toBeUndefined();
    await expect(allowed.policy.assertClassControl(supervisor, 'class-1')).resolves.toBeUndefined();

    const denied = build({ classCount: 0 });
    await expect(denied.policy.assertClassRead(supervisor, 'class-1')).rejects.toThrow(/access/);
    await expect(denied.policy.assertClassControl(supervisor, 'class-1')).rejects.toThrow(/access/);
  });
});
