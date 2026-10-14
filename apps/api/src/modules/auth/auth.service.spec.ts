import { ErrorCode, LOGIN_SECURITY, SESSION, Role } from '@hifzoon/shared';

import {
  ENUM_DRIFT_GUARD,
  toSharedRole,
  fromSharedRole,
  toSharedRoles,
} from '../../common/prisma-enum-bridge';

import { AuthService } from './auth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QueueService } from '../../queue/queue.service';
import type { TwoFactorService } from './two-factor.service';
import type { CryptoService } from '../../common/services/crypto.service';

/**
 * Auth rules with legal and security weight. Every test name carries the requirement
 * ID so the traceability report (REL-FS-01) can be generated mechanically.
 *
 * Prisma is mocked at the query level rather than at the client level so the tests
 * assert the *queries the service makes* — a lockout that stops incrementing
 * `failedLoginCount` should fail here, not in production.
 */
function buildHarness(
  overrides: {
    user?: Record<string, unknown> | null;
    loginFailsAt?: number;
  } = {},
) {
  const state = {
    user: overrides.user ?? null,
    failedAttempts: 0,
    lockUntil: null as Date | null,
    sessions: [] as Array<Record<string, unknown>>,
    refreshTokens: [] as Array<Record<string, unknown>>,
    resetTokens: [] as Array<Record<string, unknown>>,
    queued: [] as Array<{ queue: string; name: string; data: unknown }>,
    passwordHash: 'hash-for-correct-password',
  };

  let passwordCheck = 0;

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) {
          return state.user && state.user.email === where.email ? state.user : null;
        }
        return state.user;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'user-1',
        email: data.email,
        name: data.name,
        language: data.language,
        timeZone: data.timeZone,
        status: 'ACTIVE',
        twoFactorEnabled: false,
        lastActiveAt: null,
        roles: [{ role: 'GUARDIAN' }],
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.failedLoginCount === 'object' && data.failedLoginCount) {
          state.failedAttempts += 1;
        }
        if (data.failedLoginCount === 0) state.failedAttempts = 0;
        if (data.lockedUntil !== undefined) state.lockUntil = data.lockedUntil as Date;
        // The service reads `failedLoginCount` off the returned row to decide whether
        // to lock, so the mock has to report it honestly.
        return {
          ...state.user,
          failedLoginCount: state.failedAttempts,
          lockedUntil: state.lockUntil,
        };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    session: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.sessions.push(data);
        return data;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    refreshToken: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.refreshTokens.push(data);
        return data;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    passwordResetToken: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.resetTokens.push(data);
        return data;
      }),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    $transaction: jest.fn(async (operations: unknown) =>
      Array.isArray(operations) ? Promise.all(operations) : operations,
    ),
  } as unknown as PrismaService;

  const crypto = {
    hashPassword: jest.fn(async (plain: string) => `hashed:${plain}`),
    verifyPassword: jest.fn(async (hash: string, plain: string) => {
      passwordCheck += 1;
      return hash === state.passwordHash && plain === 'correct-password';
    }),
    dummyVerify: jest.fn(async () => undefined),
    hashToken: jest.fn((token: string) => `hash:${token}`),
    issueOpaqueToken: jest.fn(() => `token-${Math.random().toString(36).slice(2)}`),
    safeEqual: jest.fn((a: string, b: string) => a === b),
  } as unknown as CryptoService;

  const queues = {
    add: jest.fn(async (queue: string, name: string, data: unknown) => {
      state.queued.push({ queue, name, data });
      return { id: 'job-1' };
    }),
  } as unknown as QueueService;

  const twoFactor = {
    verify: jest.fn(async () => true),
  } as unknown as TwoFactorService;

  const jwt = {
    signAsync: jest.fn(
      async (payload: Record<string, unknown>) => `signed.${JSON.stringify(payload)}`,
    ),
  } as never;

  const service = new AuthService(prisma, crypto, jwt, queues, twoFactor);

  return { service, state, prisma, crypto, queues, twoFactor, passwordChecks: () => passwordCheck };
}

function guardianUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-guardian',
    email: 'parent@example.com',
    name: 'Ayesha Khan',
    passwordHash: 'hash-for-correct-password',
    language: 'en',
    timeZone: 'Europe/London',
    status: 'ACTIVE',
    twoFactorEnabled: false,
    lastActiveAt: null,
    lockedUntil: null,
    roles: [{ role: 'GUARDIAN' }],
    ...overrides,
  };
}

const ctx = { ip: '203.0.113.10', userAgent: 'jest' };

describe('AuthService', () => {
  describe('FR-AUTH-01 — registration', () => {
    it('FR-AUTH-01 registers a guardian with a hashed password and the GUARDIAN role', async () => {
      const { service, prisma } = buildHarness();
      await service.register({
        email: 'Parent@Example.com',
        password: 'Hifzoon!Dev2026',
        name: 'Ayesha Khan',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            // Emails are normalised so the unique index is case-insensitive in practice.
            email: 'parent@example.com',
            passwordHash: expect.stringContaining('hashed:'),
          }),
        }),
      );
    });

    it('FR-AUTH-01 rejects a duplicate email with EMAIL_TAKEN', async () => {
      const { service } = buildHarness({ user: guardianUser() });
      await expect(
        service.register({ email: 'parent@example.com', password: 'x'.repeat(12), name: 'A' }),
      ).rejects.toMatchObject({ code: ErrorCode.EMAIL_TAKEN });
    });

    it('FR-TCH-01 blocks self-registration into a staff role', async () => {
      const { service } = buildHarness();
      await expect(
        service.register({
          email: 'sneaky@example.com',
          password: 'x'.repeat(12),
          name: 'A',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(/Self-registration with role ADMIN is not allowed/);
    });
  });

  describe('FR-AUTH-01, NFR-SEC-04 — login', () => {
    it('FR-AUTH-01 issues an access token and a refresh token on success', async () => {
      const { service, state } = buildHarness({ user: guardianUser() });
      const result = await service.login(
        { email: 'parent@example.com', password: 'correct-password' },
        ctx,
      );

      expect(result.tokens?.accessToken).toMatch(/^signed\./);
      expect(result.tokens?.refreshToken).toBeTruthy();
      expect(result.tokens?.user.roles).toEqual(['GUARDIAN']);
      expect(state.sessions).toHaveLength(1);
    });

    it('FR-AUTH-01 issues a 15 minute access token', async () => {
      const { service } = buildHarness({ user: guardianUser() });
      const result = await service.login(
        { email: 'parent@example.com', password: 'correct-password' },
        ctx,
      );
      expect(result.tokens?.expiresIn).toBe(SESSION.ACCESS_TOKEN_TTL_SECONDS);
    });

    it('NFR-SEC-04 does not reveal whether an email is registered', async () => {
      const { service, crypto } = buildHarness({ user: null });
      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }, ctx),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });

      // A dummy hash is verified anyway, so the response time matches a real account.
      expect(crypto.dummyVerify).toHaveBeenCalledTimes(1);
    });

    it('NFR-SEC-04 returns the same error for a wrong password as for an unknown email', async () => {
      const { service } = buildHarness({ user: guardianUser() });
      await expect(
        service.login({ email: 'parent@example.com', password: 'wrong-password' }, ctx),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    });

    it('NFR-SEC-04 counts a failed attempt', async () => {
      const { service, state } = buildHarness({ user: guardianUser() });
      await expect(
        service.login({ email: 'parent@example.com', password: 'wrong-password' }, ctx),
      ).rejects.toThrow();
      expect(state.failedAttempts).toBe(1);
    });

    it('NFR-SEC-04 locks the account after 10 failed attempts and emails the owner', async () => {
      const { service, state, queues } = buildHarness({ user: guardianUser() });

      for (let attempt = 1; attempt < LOGIN_SECURITY.MAX_FAILED_ATTEMPTS; attempt += 1) {
        await expect(
          service.login({ email: 'parent@example.com', password: 'wrong-password' }, ctx),
        ).rejects.toThrow();
      }
      expect(state.lockUntil).toBeNull();

      await expect(
        service.login({ email: 'parent@example.com', password: 'wrong-password' }, ctx),
      ).rejects.toThrow();

      expect(state.failedAttempts).toBe(LOGIN_SECURITY.MAX_FAILED_ATTEMPTS);
      expect(state.lockUntil).toBeInstanceOf(Date);
      expect(queues.add).toHaveBeenCalledWith(
        'notification',
        'account-locked',
        expect.objectContaining({ template: 'auth.account-locked' }),
      );
    });

    it('NFR-SEC-04 returns ACCOUNT_LOCKED (423) while the lock is active', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60_000);
      const { service } = buildHarness({
        user: guardianUser({ status: 'LOCKED', lockedUntil }),
      });

      await expect(
        service.login({ email: 'parent@example.com', password: 'correct-password' }, ctx),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });
    });

    it('FR-AUTH-01 requires a valid 2FA code once two-factor is enabled', async () => {
      const { service, twoFactor } = buildHarness({
        user: guardianUser({ twoFactorEnabled: true }),
      });
      (twoFactor.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'parent@example.com', password: 'correct-password' }, ctx),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_TWO_FACTOR_CODE });
    });

    it('FR-AUTH-01 completes login when the 2FA code is correct', async () => {
      const { service, twoFactor } = buildHarness({
        user: guardianUser({ twoFactorEnabled: true }),
      });
      (twoFactor.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login(
        { email: 'parent@example.com', password: 'correct-password', twoFactorCode: '123456' },
        ctx,
      );
      expect(result.tokens?.accessToken).toBeTruthy();
      expect(twoFactor.verify).toHaveBeenCalledWith('user-guardian', '123456');
    });

    it('FR-AUTH-01 refuses a disabled account even with the right password', async () => {
      const { service } = buildHarness({ user: guardianUser({ status: 'DISABLED' }) });
      await expect(
        service.login({ email: 'parent@example.com', password: 'correct-password' }, ctx),
      ).rejects.toThrow(/disabled/i);
    });
  });

  describe('FR-AUTH-07 — session lifetimes', () => {
    it('FR-AUTH-07 gives a personal account a 30 day session', async () => {
      const { service, state } = buildHarness({ user: guardianUser() });
      const before = Date.now();
      await service.login({ email: 'parent@example.com', password: 'correct-password' }, ctx);

      const expiresAt = new Date(state.sessions[0].expiresAt as Date);
      const days = (expiresAt.getTime() - before) / 86_400_000;
      expect(days).toBeGreaterThan(SESSION.PERSONAL_REFRESH_TTL_DAYS - 0.01);
      expect(days).toBeLessThanOrEqual(SESSION.PERSONAL_REFRESH_TTL_DAYS + 0.01);
      expect(state.sessions[0].staff).toBe(false);
    });

    it('FR-AUTH-07 gives a staff account a 12 hour session', async () => {
      const { service, state } = buildHarness({
        user: guardianUser({ roles: [{ role: 'TEACHER' }] }),
      });
      const before = Date.now();
      await service.login({ email: 'parent@example.com', password: 'correct-password' }, ctx);

      const expiresAt = new Date(state.sessions[0].expiresAt as Date);
      const hours = (expiresAt.getTime() - before) / 3_600_000;
      expect(hours).toBeGreaterThan(SESSION.STAFF_REFRESH_TTL_HOURS - 0.01);
      expect(hours).toBeLessThanOrEqual(SESSION.STAFF_REFRESH_TTL_HOURS + 0.01);
      expect(state.sessions[0].staff).toBe(true);
    });
  });

  describe('NFR-SEC-04 — password reset', () => {
    it('NFR-SEC-04 always reports success so the endpoint cannot enumerate accounts', async () => {
      const { service, state } = buildHarness({ user: null });
      await expect(
        service.requestPasswordReset('nobody@example.com', ctx),
      ).resolves.toBeUndefined();
      expect(state.resetTokens).toHaveLength(0);
      expect(state.queued).toHaveLength(0);
    });

    it('NFR-SEC-04 queues a reset email for a known address', async () => {
      const { service, state } = buildHarness({ user: guardianUser() });
      await service.requestPasswordReset('parent@example.com', ctx);

      expect(state.resetTokens).toHaveLength(1);
      expect(state.queued[0]).toMatchObject({ queue: 'notification', name: 'password-reset' });
    });

    it('NFR-SEC-04 rejects a reset token that has already been used', async () => {
      const { service, prisma } = buildHarness({ user: guardianUser() });
      const mocked = prisma as unknown as { passwordResetToken: { findUnique: jest.Mock } };
      mocked.passwordResetToken.findUnique = jest.fn(async () => ({
        id: 't1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000),
      }));

      await expect(service.resetPassword('whatever', 'new-password-here')).rejects.toThrow(
        /invalid or has expired/,
      );
    });

    it('NFR-SEC-04 rejects an expired reset token', async () => {
      const { service, prisma } = buildHarness({ user: guardianUser() });
      const mocked = prisma as unknown as { passwordResetToken: { findUnique: jest.Mock } };
      mocked.passwordResetToken.findUnique = jest.fn(async () => ({
        id: 't1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1_000),
      }));

      await expect(service.resetPassword('whatever', 'new-password-here')).rejects.toThrow(
        /invalid or has expired/,
      );
    });
  });

  describe('logout', () => {
    it('FR-AUTH-07 revokes only the current session by default', async () => {
      const { service, prisma } = buildHarness({ user: guardianUser() });
      await service.logout('user-guardian', 'session-1');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.session.updateMany).not.toHaveBeenCalled();
    });

    it('FR-AUTH-07 revokes every session when asked', async () => {
      const { service, prisma } = buildHarness({ user: guardianUser() });
      await service.logout('user-guardian', 'session-1', true);

      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-guardian', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});

describe('Prisma/shared enum bridge (TRD section 3)', () => {
  it('the Prisma Role enum and packages/shared Role are exactly the same set', () => {
    expect(ENUM_DRIFT_GUARD.role).toEqual(ENUM_DRIFT_GUARD.prismaRole);
  });

  it('maps a Prisma role to the shared role and back', () => {
    const shared = toSharedRole('GUARDIAN');
    expect(shared).toBe(Role.GUARDIAN);
    expect(fromSharedRole(Role.GUARDIAN)).toBe('GUARDIAN' as never);
  });

  it('maps a list of roles', () => {
    expect(toSharedRoles(['TEACHER', 'ADMIN'])).toEqual([Role.TEACHER, Role.ADMIN]);
  });

  it('throws on a value the shared enum does not know', () => {
    expect(() => toSharedRole('NOT_A_ROLE')).toThrow(/Unknown role/);
  });
});
