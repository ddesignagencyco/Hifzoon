import { ErrorCode } from '@hifzoon/shared';

import { type AppError } from '../../common/errors/app-error';
import { FamiliesService } from './families.service';
import { kidsPinProblem } from './families.constants';

interface Row {
  id: string;
  displayName: string;
  birthYear: number;
  language: string;
  timeZone: string;
  kidsMode: boolean;
  userId: string | null;
  kidsCredential: { id: string } | null;
  user: { email: string | null; passwordHash: string | null } | null;
}

function build(over: Partial<Row> = {}) {
  const row: Row = {
    id: 'stu-1',
    displayName: 'Amina',
    birthYear: new Date().getUTCFullYear() - 7,
    language: 'en',
    timeZone: 'Europe/London',
    kidsMode: true,
    userId: null,
    kidsCredential: null,
    user: null,
    ...over,
  };
  const tx = {
    user: {
      create: jest.fn(async () => ({ id: 'pin-user' })),
      update: jest.fn(async () => ({})),
    },
    student: {
      updateMany: jest.fn(async ({ data }: { data: { userId: string | null } }) => {
        row.userId = data.userId;
        return { count: 1 };
      }),
    },
    kidsCredential: {
      upsert: jest.fn(async () => {
        row.kidsCredential = { id: 'cred-new' };
        return {};
      }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    session: { updateMany: jest.fn(async () => ({ count: 2 })) },
    refreshToken: { updateMany: jest.fn(async () => ({ count: 2 })) },
  };
  const prisma = {
    student: {
      findFirst: jest.fn(async () => ({ ...row })),
      findUnique: jest.fn(async () => ({
        ...row,
        familyId: 'fam-1',
        gender: 'FEMALE',
        user: row.user,
        kidsCredential: row.kidsCredential ? { lockedUntil: null } : null,
      })),
    },
    kidsCredential: { update: jest.fn((args: unknown) => ({ op: 'kidsCredential.update', args })) },
    session: { updateMany: jest.fn((args: unknown) => ({ op: 'session.updateMany', args })) },
    refreshToken: {
      updateMany: jest.fn((args: unknown) => ({ op: 'refreshToken.updateMany', args })),
    },
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === 'function' ? (work as (t: typeof tx) => Promise<unknown>)(tx) : work,
    ),
  };
  const policies = { assertGuardianInFamily: jest.fn(async () => undefined) };
  const crypto = { hashPassword: jest.fn(async (p: string) => `argon(${p})`) };
  const audit = { record: jest.fn(async () => undefined) };
  const service = new FamiliesService(
    prisma as never,
    policies as never,
    {} as never,
    crypto as never,
    audit as never,
  );
  return { service, prisma, tx, crypto, audit, row };
}

const INPUT = { familyId: 'fam-1', studentId: 'stu-1', actorUserId: 'guardian-1', pin: '4826' };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as AppError).code;
  }
  throw new Error('expected the call to throw');
}

describe('kidsPinProblem', () => {
  it('takes 4 to 6 digits and refuses repeated or counting PINs', () => {
    expect(kidsPinProblem('4826')).toBeNull();
    expect(kidsPinProblem('481930')).toBeNull();
    expect(kidsPinProblem('482')).toMatch(/4 to 6 digits/);
    expect(kidsPinProblem('4826193')).toMatch(/4 to 6 digits/);
    expect(kidsPinProblem('48a6')).toMatch(/4 to 6 digits/);
    for (const weak of ['0000', '1234', '987654', '3456']) {
      expect(kidsPinProblem(weak)).toMatch(/harder to guess/);
    }
  });
});

describe('FamiliesService.setKidsPin', () => {
  it('creates a password-less CHILD_STUDENT account on the first PIN, hashed like a password', async () => {
    const { service, tx, crypto, audit } = build();
    const result = await service.setKidsPin(INPUT);

    expect(crypto.hashPassword).toHaveBeenCalledWith('4826');
    const created = (tx.user.create.mock.calls[0] as unknown as [{ data: any }])[0].data;
    expect(created.email).toBeUndefined();
    expect(created.passwordHash).toBeUndefined();
    expect(created.roles).toEqual({ create: [{ role: 'CHILD_STUDENT' }] });
    expect(tx.student.updateMany).toHaveBeenCalledWith({
      where: { id: 'stu-1', userId: null },
      data: { userId: 'pin-user' },
    });
    expect(tx.kidsCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { studentId: 'stu-1', type: 'PIN', secretHash: 'argon(4826)' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'family.student.kids-pin.set' }),
    );
    // The audit never carries the PIN or its hash.
    expect(JSON.stringify((audit.record.mock.calls[0] as unknown[])[0])).not.toMatch(/4826/);
    expect(result).toMatchObject({ hasKidsPin: true, hasOwnLogin: false, loginEmail: null });
  });

  it('resets an existing PIN, clears the lockout and signs out the old sessions', async () => {
    const { service, prisma, tx, audit } = build({
      userId: 'pin-user',
      kidsCredential: { id: 'cred-1' },
      user: { email: null, passwordHash: null },
    });
    await service.setKidsPin({ ...INPUT, pin: '7391' });

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(prisma.kidsCredential.update).toHaveBeenCalledWith({
      where: { studentId: 'stu-1' },
      data: { type: 'PIN', secretHash: 'argon(7391)', failedAttempts: 0, lockedUntil: null },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'pin-user', revokedAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'family.student.kids-pin.reset' }),
    );
  });

  it('is only for kids mode, and not for a child with their own email login', async () => {
    const off = build({ kidsMode: false });
    expect(await codeOf(off.service.setKidsPin(INPUT))).toBe(ErrorCode.VALIDATION_FAILED);
    expect(off.crypto.hashPassword).not.toHaveBeenCalled();

    const own = build({ userId: 'own-user', user: { email: 'z@x.com', passwordHash: 'h' } });
    expect(await codeOf(own.service.setKidsPin(INPUT))).toBe(ErrorCode.CONFLICT);
  });

  it('refuses a weak PIN', async () => {
    const { service, crypto } = build();
    expect(await codeOf(service.setKidsPin({ ...INPUT, pin: '1111' }))).toBe(
      ErrorCode.VALIDATION_FAILED,
    );
    expect(crypto.hashPassword).not.toHaveBeenCalled();
  });
});

describe('FamiliesService.removeKidsPin', () => {
  it('switches the PIN account off, unlinks it and ends its sessions', async () => {
    const { service, tx, audit } = build({
      userId: 'pin-user',
      kidsCredential: { id: 'cred-1' },
      user: { email: null, passwordHash: null },
    });
    await service.removeKidsPin(INPUT);

    expect(tx.kidsCredential.deleteMany).toHaveBeenCalledWith({ where: { studentId: 'stu-1' } });
    expect(tx.student.updateMany).toHaveBeenCalledWith({
      where: { id: 'stu-1', userId: 'pin-user' },
      data: { userId: null },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'pin-user' },
      data: { status: 'DISABLED' },
    });
    expect(tx.session.updateMany).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'family.student.kids-pin.remove' }),
    );
  });

  it('refuses when there is no PIN', async () => {
    const { service } = build();
    expect(await codeOf(service.removeKidsPin(INPUT))).toBe(ErrorCode.VALIDATION_FAILED);
  });
});
