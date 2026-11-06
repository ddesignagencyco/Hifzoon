import { ErrorCode } from '@hifzoon/shared';

import { type AppError } from '../../common/errors/app-error';
import { AuthService } from './auth.service';

/**
 * Kids PIN sign-in (FR-AUTH-03): family code (guardian email) + child's name + PIN, capped
 * at five wrong PINs per child before a fifteen-minute lock.
 */
function build(candidate: Record<string, unknown> | null = {}) {
  const credential = {
    id: 'cred-1',
    secretHash: 'argon(4826)',
    failedAttempts: 0,
    lockedUntil: null as Date | null,
  };
  const rows =
    candidate === null
      ? []
      : [
          {
            id: 'stu-1',
            kidsCredential: credential,
            user: {
              id: 'pin-user',
              email: null,
              name: 'Amina',
              language: 'en',
              timeZone: 'Europe/London',
              status: 'ACTIVE',
              twoFactorEnabled: false,
              roles: [{ role: 'CHILD_STUDENT' }],
            },
            ...candidate,
          },
        ];
  const prisma = {
    student: { findMany: jest.fn(async () => rows) },
    kidsCredential: {
      update: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        if (data.failedAttempts?.increment) credential.failedAttempts += 1;
        else if (data.failedAttempts === 0) credential.failedAttempts = 0;
        if (data.lockedUntil !== undefined) credential.lockedUntil = data.lockedUntil;
        return { failedAttempts: credential.failedAttempts, studentId: 'stu-1' };
      }),
    },
    user: { update: jest.fn(async () => ({})) },
    session: { create: jest.fn(async ({ data }: { data: unknown }) => data) },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops)),
  };
  const crypto = {
    verifyPassword: jest.fn(async (hash: string, plain: string) => hash === `argon(${plain})`),
    dummyVerify: jest.fn(async () => undefined),
    hashToken: jest.fn((t: string) => `hash:${t}`),
    issueOpaqueToken: jest.fn(() => 'refresh-token'),
  };
  const jwt = { signAsync: jest.fn(async (p: unknown) => `signed.${JSON.stringify(p)}`) };
  const service = new AuthService(
    prisma as never,
    crypto as never,
    jwt as never,
    {} as never,
    {} as never,
    { value: {} } as never,
  );
  return { service, prisma, crypto, jwt, credential };
}

const INPUT = { familyCode: ' Parent@Example.com ', childName: ' amina ', pin: '4826' };
const ctx = { ip: '203.0.113.10' };

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as AppError).code;
  }
  throw new Error('expected the call to throw');
}

describe('AuthService.kidsPinLogin', () => {
  it('signs the child in as their own CHILD_STUDENT account, never staff', async () => {
    const { service, prisma, jwt } = build();
    const { tokens, user } = await service.kidsPinLogin(INPUT, ctx);

    expect(user).toMatchObject({ id: 'pin-user', roles: ['CHILD_STUDENT'] });
    expect(tokens.accessToken).toContain('"staff":false');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'pin-user', roles: ['CHILD_STUDENT'] }),
      expect.anything(),
    );
    // Looked up by the normalised family email and the name, case-insensitively, kids mode only.
    const where = (prisma.student.findMany.mock.calls[0] as unknown as [{ where: any }])[0].where;
    expect(where.family.members).toEqual({ some: { user: { email: 'parent@example.com' } } });
    expect(where.displayName).toEqual({ equals: 'amina', mode: 'insensitive' });
    expect(where.kidsMode).toBe(true);
  });

  it('answers the same for an unknown family or child, after equal work', async () => {
    const { service, crypto } = build(null);
    expect(await codeOf(service.kidsPinLogin(INPUT, ctx))).toBe(ErrorCode.INVALID_CREDENTIALS);
    expect(crypto.dummyVerify).toHaveBeenCalled();
  });

  it('locks the PIN for 15 minutes after the fifth wrong attempt', async () => {
    const { service, credential } = build();
    for (let i = 0; i < 5; i += 1) {
      expect(await codeOf(service.kidsPinLogin({ ...INPUT, pin: '9999' }, ctx))).toBe(
        ErrorCode.INVALID_CREDENTIALS,
      );
    }
    expect(credential.lockedUntil).not.toBeNull();
    const minutes = (credential.lockedUntil!.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);

    // Even the right PIN is refused while locked.
    expect(await codeOf(service.kidsPinLogin(INPUT, ctx))).toBe(ErrorCode.ACCOUNT_LOCKED);
  });

  it('resets the failure count on success', async () => {
    const { service, credential } = build();
    await codeOf(service.kidsPinLogin({ ...INPUT, pin: '9999' }, ctx));
    expect(credential.failedAttempts).toBe(1);
    await service.kidsPinLogin(INPUT, ctx);
    expect(credential.failedAttempts).toBe(0);
  });

  it('refuses a disabled account or one that is not a child account, even with the right PIN', async () => {
    const disabled = build({
      user: { id: 'pin-user', status: 'DISABLED', roles: [{ role: 'CHILD_STUDENT' }] },
    });
    expect(await codeOf(disabled.service.kidsPinLogin(INPUT, ctx))).toBe(
      ErrorCode.INVALID_CREDENTIALS,
    );

    const guardian = build({
      user: { id: 'g', status: 'ACTIVE', roles: [{ role: 'GUARDIAN' }] },
    });
    expect(await codeOf(guardian.service.kidsPinLogin(INPUT, ctx))).toBe(
      ErrorCode.INVALID_CREDENTIALS,
    );
  });
});
