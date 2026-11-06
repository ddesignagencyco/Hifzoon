import { Prisma } from '@prisma/client';
import { ErrorCode, LOGIN_SECURITY, Role, UserStatus } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { FamiliesService } from './families.service';
import { OWN_LOGIN_MIN_AGE } from './families.constants';

const YEAR = new Date().getUTCFullYear();
const PASSWORD = 'x'.repeat(LOGIN_SECURITY.PASSWORD_MIN_LENGTH);

interface StudentRow {
  id: string;
  familyId: string;
  displayName: string;
  birthYear: number;
  gender: string;
  language: string;
  timeZone: string;
  kidsMode: boolean;
  userId: string | null;
}

interface ExistingUser {
  id: string;
  status: string;
  passwordHash: string | null;
  roles: Array<{ role: string }>;
  _count: { oauthAccounts: number; familyMembers: number; students: number };
}

function build(
  options: {
    student?: Partial<StudentRow> | null;
    existingUser?: ExistingUser | null;
    account?: {
      roles: Array<{ role: string }>;
      _count: { familyMembers: number; students: number };
    } | null;
    guardian?: boolean;
  } = {},
) {
  const student: StudentRow | null =
    options.student === null
      ? null
      : {
          id: 'stu-1',
          familyId: 'fam-1',
          displayName: 'Zara',
          birthYear: YEAR - 14,
          gender: 'FEMALE',
          language: 'ur',
          timeZone: 'Europe/London',
          kidsMode: true,
          userId: null,
          ...options.student,
        };

  const tx = {
    user: {
      create: jest.fn(async () => ({ id: 'user-new' })),
      update: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id })),
    },
    student: {
      updateMany: jest.fn(
        async ({ data }: { where: unknown; data: { userId: string; kidsMode: boolean } }) => {
          if (!student || student.userId) return { count: 0 };
          student.userId = data.userId;
          student.kidsMode = data.kidsMode;
          return { count: 1 };
        },
      ),
    },
  };

  const prisma = {
    student: {
      findFirst: jest.fn(async () => (student ? { ...student } : null)),
      findUnique: jest.fn(async () =>
        student
          ? {
              ...student,
              user: student.userId ? { email: 'zara@example.com' } : null,
            }
          : null,
      ),
      update: jest.fn((args: { data: { userId: string | null } }) => {
        if (student) student.userId = args.data.userId;
        return { op: 'student.update', args };
      }),
    },
    user: {
      findUnique: jest.fn(async (args: { where: { email?: string; id?: string } }) =>
        args.where.email !== undefined
          ? (options.existingUser ?? null)
          : options.account === undefined
            ? { roles: [{ role: Role.STUDENT }], _count: { familyMembers: 0, students: 1 } }
            : options.account,
      ),
      update: jest.fn((args: unknown) => ({ op: 'user.update', args })),
    },
    session: { updateMany: jest.fn((args: unknown) => ({ op: 'session.updateMany', args })) },
    refreshToken: {
      updateMany: jest.fn((args: unknown) => ({ op: 'refreshToken.updateMany', args })),
    },
    passwordResetToken: {
      updateMany: jest.fn((args: unknown) => ({ op: 'passwordResetToken.updateMany', args })),
    },
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === 'function' ? (work as (t: typeof tx) => Promise<unknown>)(tx) : work,
    ),
  };

  const policies = {
    assertGuardianInFamily: jest.fn(async () => {
      if (options.guardian === false) {
        throw new AppError('NOT_RESOURCE_OWNER', 'You do not have access to this record');
      }
    }),
  };
  const crypto = { hashPassword: jest.fn(async (p: string) => `hashed:${p}`) };
  const audit = { record: jest.fn(async () => undefined) };

  const service = new FamiliesService(
    prisma as never,
    policies as never,
    {} as never,
    crypto as never,
    audit as never,
  );
  return { service, prisma, tx, policies, crypto, audit, student: () => student };
}

const CREATE = {
  familyId: 'fam-1',
  studentId: 'stu-1',
  actorUserId: 'guardian-1',
  email: '  Zara@Example.com ',
  password: PASSWORD,
};

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as AppError).code;
  }
  throw new Error('expected the call to throw');
}

describe('FamiliesService.createStudentLogin (FR-AUTH-03)', () => {
  it('uses 13 as the minimum age for a login of their own', () => {
    expect(OWN_LOGIN_MIN_AGE).toBe(13);
  });

  it('refuses a caller who is not a guardian of the family', async () => {
    const { service, tx } = build({ guardian: false });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe('NOT_RESOURCE_OWNER');
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('refuses a child under 13 and creates nothing', async () => {
    const { service, tx, crypto } = build({ student: { birthYear: YEAR - 12 } });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.VALIDATION_FAILED);
    expect(crypto.hashPassword).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('accepts a child who turns 13 this year', async () => {
    const { service, tx } = build({ student: { birthYear: YEAR - 13 } });

    await service.createStudentLogin(CREATE);
    expect(tx.user.create).toHaveBeenCalled();
  });

  it('refuses a child who already has a login', async () => {
    const { service, tx } = build({ student: { userId: 'user-old' } });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.CONFLICT);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('refuses a student from another family', async () => {
    const { service } = build({ student: null });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.NOT_FOUND);
  });

  it('refuses an email another user already has', async () => {
    const { service, tx } = build({
      existingUser: {
        id: 'someone',
        status: UserStatus.ACTIVE,
        passwordHash: 'hash',
        roles: [{ role: Role.GUARDIAN }],
        _count: { oauthAccounts: 0, familyMembers: 1, students: 0 },
      },
    });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.EMAIL_TAKEN);
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('does not take over an account an admin disabled, which still has a password', async () => {
    const { service, tx } = build({
      existingUser: {
        id: 'disabled-student',
        status: UserStatus.DISABLED,
        passwordHash: 'hash',
        roles: [{ role: Role.STUDENT }],
        _count: { oauthAccounts: 0, familyMembers: 0, students: 0 },
      },
    });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.EMAIL_TAKEN);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('maps a unique-email race at insert time to EMAIL_TAKEN', async () => {
    const { service, tx } = build();
    tx.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.EMAIL_TAKEN);
  });

  it('applies the auth password policy', async () => {
    const { service, crypto } = build();

    const short = { ...CREATE, password: 'x'.repeat(LOGIN_SECURITY.PASSWORD_MIN_LENGTH - 1) };
    expect(await codeOf(service.createStudentLogin(short))).toBe(ErrorCode.VALIDATION_FAILED);
    expect(crypto.hashPassword).not.toHaveBeenCalled();
  });

  it('creates an active STUDENT user, links it, turns kids mode off and audits it', async () => {
    const { service, tx, crypto, audit, student } = build();

    const result = await service.createStudentLogin(CREATE);

    expect(crypto.hashPassword).toHaveBeenCalledWith(PASSWORD);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'zara@example.com',
        passwordHash: `hashed:${PASSWORD}`,
        name: 'Zara',
        language: 'ur',
        timeZone: 'Europe/London',
        status: UserStatus.ACTIVE,
        roles: { create: [{ role: Role.STUDENT }] },
        notificationPreferences: { create: { language: 'ur' } },
      },
      select: { id: true },
    });
    expect(tx.student.updateMany).toHaveBeenCalledWith({
      where: { id: 'stu-1', userId: null },
      data: { userId: 'user-new', kidsMode: false },
    });
    expect(student()?.userId).toBe('user-new');
    expect(student()?.kidsMode).toBe(false);

    expect(result).toMatchObject({
      id: 'stu-1',
      userId: 'user-new',
      kidsMode: false,
      hasOwnLogin: true,
      loginEmail: 'zara@example.com',
    });
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    expect(JSON.stringify(result)).not.toContain('hashed:');

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'guardian-1',
        action: 'family.student.login.create',
        targetType: 'student',
        targetId: 'stu-1',
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(PASSWORD);
  });

  it('refuses when another guardian linked the child in the meantime', async () => {
    const { service, tx } = build();
    tx.student.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await codeOf(service.createStudentLogin(CREATE))).toBe(ErrorCode.CONFLICT);
  });

  it('reactivates a login this flow removed earlier instead of refusing its email', async () => {
    const { service, tx } = build({
      existingUser: {
        id: 'user-old',
        status: UserStatus.DISABLED,
        passwordHash: null,
        roles: [{ role: Role.STUDENT }],
        _count: { oauthAccounts: 0, familyMembers: 0, students: 0 },
      },
    });

    const result = await service.createStudentLogin(CREATE);

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-old' },
        data: expect.objectContaining({
          passwordHash: `hashed:${PASSWORD}`,
          status: UserStatus.ACTIVE,
        }),
      }),
    );
    expect(result).toMatchObject({ userId: 'user-old', hasOwnLogin: true });
  });
});

describe('FamiliesService.removeStudentLogin (FR-AUTH-03)', () => {
  const REMOVE = { familyId: 'fam-1', studentId: 'stu-1', actorUserId: 'guardian-1' };

  it('unlinks the child, disables the account and revokes every session and token', async () => {
    const { service, prisma, audit, student } = build({
      student: { userId: 'user-child', kidsMode: false },
    });

    const result = await service.removeStudentLogin(REMOVE);

    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 'stu-1' },
      data: { userId: null },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-child' },
      data: {
        status: UserStatus.DISABLED,
        passwordHash: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-child', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-child', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalled();
    // The account row is kept: other records may point at it.
    expect((prisma.user as Record<string, unknown>).delete).toBeUndefined();

    expect(student()?.userId).toBeNull();
    expect(result).toMatchObject({ hasOwnLogin: false, loginEmail: null, userId: null });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'family.student.login.remove',
        targetId: 'stu-1',
        before: { userId: 'user-child' },
      }),
    );
  });

  it('only unlinks, without disabling, when the account is not the child’s alone', async () => {
    const { service, prisma } = build({
      student: { userId: 'user-shared' },
      account: { roles: [{ role: Role.GUARDIAN }], _count: { familyMembers: 1, students: 1 } },
    });

    await service.removeStudentLogin(REMOVE);

    expect(prisma.student.update).toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the child has no login', async () => {
    const { service, prisma } = build();

    expect(await codeOf(service.removeStudentLogin(REMOVE))).toBe(ErrorCode.VALIDATION_FAILED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not a guardian of the family', async () => {
    const { service, prisma } = build({ guardian: false, student: { userId: 'user-child' } });

    expect(await codeOf(service.removeStudentLogin(REMOVE))).toBe('NOT_RESOURCE_OWNER');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
