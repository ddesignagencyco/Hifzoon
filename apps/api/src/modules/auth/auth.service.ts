import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuthTokensResponse,
  ErrorCode,
  LOGIN_SECURITY,
  PERSONAL_ROLES,
  Role,
  SESSION,
  STAFF_ROLES,
} from '@hifzoon/shared';
import { UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error';
import { toSharedRoles, write } from '../../common/prisma-enum-bridge';
import { CryptoService } from '../../common/services/crypto.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { TwoFactorService } from './two-factor.service';
import { JwtPayload } from './token.service';

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface AuthUserRecord {
  id: string;
  email: string | null;
  name: string;
  language: string;
  timeZone: string;
  status: UserStatus;
  twoFactorEnabled: boolean;
  lastActiveAt: Date | null;
  roles: Role[];
}

/**
 * Accounts, sessions and token lifecycle (AUTH-BE-01, AUTH-BE-03, AUTH-BE-09,
 * AUTH-BE-10).
 *
 * Rules enforced here rather than in controllers:
 *   - Argon2id hashing (NFR-SEC-01)
 *   - access 15 min, refresh 30 d personal / 12 h staff (FR-AUTH-07)
 *   - rotating refresh tokens with reuse detection: presenting a revoked token
 *     kills the whole session, because it means the token leaked
 *   - lockout after 10 failures with an email recovery path (NFR-SEC-04)
 *   - staff cannot complete login without a valid TOTP (FR-AUTH-01)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly queues: QueueService,
    private readonly twoFactor: TwoFactorService,
    private readonly config: AppConfigService,
  ) {}

  // ── Registration (FR-AUTH-01) ─────────────────────────────────────────────

  async register(input: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    timeZone?: string;
    language?: string;
    role?: Role;
  }): Promise<AuthUserRecord> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing)
      throw new AppError(ErrorCode.EMAIL_TAKEN, 'That email address is already registered');

    // Guardians and students sign up freely; every other role is granted by staff
    // (a teacher cannot self-register into the pipeline, FR-TCH-01).
    const requested = input.role ?? Role.GUARDIAN;
    if (!PERSONAL_ROLES.includes(requested)) {
      throw AppError.forbidden(`Self-registration with role ${requested} is not allowed`);
    }

    const passwordHash = await this.crypto.hashPassword(input.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: input.name,
        phone: input.phone ?? null,
        timeZone: input.timeZone ?? 'UTC',
        language: input.language ?? 'en',
        status: UserStatus.ACTIVE,
        roles: { create: [{ role: write.role(requested) }] },
        notificationPreferences: { create: { language: input.language ?? 'en' } },
      },
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        timeZone: true,
        status: true,
        twoFactorEnabled: true,
        lastActiveAt: true,
        roles: { select: { role: true } },
      },
    });

    return { ...user, roles: toSharedRoles(user.roles.map((r) => r.role)) };
  }

  // ── Login (FR-AUTH-01, NFR-SEC-04) ────────────────────────────────────────

  async login(
    input: { email: string; password: string; twoFactorCode?: string; deviceId?: string },
    ctx: RequestContext,
  ): Promise<{
    tokens: AuthTokensResponse | null;
    user: AuthUserRecord;
    twoFactorRequired: boolean;
  }> {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        language: true,
        timeZone: true,
        status: true,
        twoFactorEnabled: true,
        lastActiveAt: true,
        lockedUntil: true,
        roles: { select: { role: true } },
      },
    });

    // Constant-ish work whether or not the account exists, so response time does not
    // reveal which emails are registered.
    if (!user?.passwordHash) {
      await this.crypto.dummyVerify();
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
    }

    if (user.status === UserStatus.DISABLED) {
      throw AppError.forbidden('This account has been disabled. Contact support.');
    }

    if (user.status === UserStatus.LOCKED && user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        ErrorCode.ACCOUNT_LOCKED,
        'Account is temporarily locked after too many failed attempts',
        { lockedUntil: user.lockedUntil.toISOString() },
      );
    }

    const valid = await this.crypto.verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.email);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Email or password is incorrect');
    }

    const roles = toSharedRoles(user.roles.map((r) => r.role));
    const staff = roles.some((role) => STAFF_ROLES.includes(role));

    if (user.twoFactorEnabled) {
      // No code at all is a *challenge*, not a wrong answer: the client has to be able
      // to tell "ask me for a code" from "that code was wrong" (FR-AUTH-01).
      if (!input.twoFactorCode?.trim()) {
        throw new AppError(
          ErrorCode.TWO_FACTOR_REQUIRED,
          'This account requires a two-factor code',
        );
      }
      const verified = await this.twoFactor.verify(user.id, input.twoFactorCode);
      if (!verified) {
        throw new AppError(ErrorCode.INVALID_TWO_FACTOR_CODE, 'Two-factor code is incorrect');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastActiveAt: new Date() },
    });

    const publicUser: AuthUserRecord = {
      id: user.id,
      email: user.email,
      name: user.name,
      language: user.language,
      timeZone: user.timeZone,
      status: UserStatus.ACTIVE,
      twoFactorEnabled: user.twoFactorEnabled,
      lastActiveAt: new Date(),
      roles,
    };

    const tokens = await this.issueSession(publicUser, staff, input.deviceId, ctx);
    return { tokens, user: publicUser, twoFactorRequired: false };
  }

  // ── Sessions (FR-AUTH-07) ─────────────────────────────────────────────────

  async issueSession(
    user: AuthUserRecord,
    staff: boolean,
    deviceId: string | undefined,
    _ctx: RequestContext,
  ): Promise<AuthTokensResponse> {
    const ttlMs = staff
      ? SESSION.STAFF_REFRESH_TTL_HOURS * 3_600_000
      : SESSION.PERSONAL_REFRESH_TTL_DAYS * 86_400_000;
    const sessionId = randomUUID();
    const refreshToken = this.crypto.issueOpaqueToken(48);
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        staff,
        ip: _ctx.ip ?? null,
        userAgent: _ctx.userAgent ?? null,
        expiresAt,
        refreshTokens: {
          create: {
            userId: user.id,
            tokenHash: this.crypto.hashToken(refreshToken),
            expiresAt,
            deviceInfo: { deviceId: deviceId ?? null },
          },
        },
      },
    });

    const accessToken = await this.signAccessToken(user, sessionId, staff);
    return {
      accessToken,
      expiresIn: SESSION.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
      },
    };
  }

  private async signAccessToken(
    user: AuthUserRecord,
    sessionId: string,
    staff: boolean,
  ): Promise<string> {
    const payload: JwtPayload = { sub: user.id, roles: user.roles, staff, sid: sessionId };
    return this.jwt.signAsync(payload, { expiresIn: SESSION.ACCESS_TOKEN_TTL_SECONDS });
  }

  /**
   * Rotating refresh (FR-AUTH-01). A token that has already been rotated is treated
   * as stolen: the entire session is revoked rather than merely refused.
   */
  async refresh(
    refreshToken: string | undefined,
    _ctx: RequestContext,
  ): Promise<AuthTokensResponse> {
    if (!refreshToken) throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN, 'Refresh token missing');

    const tokenHash = this.crypto.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            language: true,
            timeZone: true,
            status: true,
            twoFactorEnabled: true,
            lastActiveAt: true,
            roles: { select: { role: true } },
          },
        },
      },
    });

    if (!stored) throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN, 'Refresh token is not valid');

    if (stored.revokedAt) {
      this.logger.warn(
        `Refresh token reuse detected for session ${stored.sessionId}; revoking session`,
      );
      await this.prisma.session.update({
        where: { id: stored.sessionId },
        data: { revokedAt: new Date() },
      });
      throw new AppError(ErrorCode.INVALID_REFRESH_TOKEN, 'Session revoked for security reasons');
    }

    if (
      stored.expiresAt <= new Date() ||
      stored.session.revokedAt ||
      stored.session.expiresAt <= new Date()
    ) {
      throw new AppError(ErrorCode.SESSION_EXPIRED, 'Session has expired, please sign in again');
    }

    if (stored.user.status !== UserStatus.ACTIVE) {
      throw AppError.forbidden('This account is not active');
    }

    const rotated = this.crypto.issueOpaqueToken(48);
    const rotatedExpires = new Date(
      Math.min(
        stored.expiresAt.getTime(),
        Date.now() +
          (stored.session.staff
            ? SESSION.STAFF_REFRESH_TTL_HOURS
            : SESSION.PERSONAL_REFRESH_TTL_DAYS) *
            3_600_000,
      ),
    );

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          sessionId: stored.sessionId,
          tokenHash: this.crypto.hashToken(rotated),
          expiresAt: rotatedExpires,
          deviceInfo: stored.deviceInfo ?? undefined,
        },
      }),
      this.prisma.session.update({
        where: { id: stored.sessionId },
        data: { lastActiveAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { lastActiveAt: new Date() },
      }),
    ]);

    const user: AuthUserRecord = {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      language: stored.user.language,
      timeZone: stored.user.timeZone,
      status: stored.user.status,
      twoFactorEnabled: stored.user.twoFactorEnabled,
      lastActiveAt: new Date(),
      roles: toSharedRoles(stored.user.roles.map((r) => r.role)),
    };

    const accessToken = await this.signAccessToken(user, stored.sessionId, stored.session.staff);
    return {
      accessToken,
      expiresIn: SESSION.ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rotated,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        lastActiveAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Ends a session.
   *
   * M5 — all four arguments are optional. The refresh cookie identifies the session when
   * the access token has already expired, which is exactly the case where a user needs to
   * sign out: refusing then leaves the cookie in place and the next page load signs them
   * straight back in. A signed-out browser keeps nothing.
   */
  async logout(
    userId?: string,
    sessionId?: string,
    allSessions = false,
    refreshToken?: string,
  ): Promise<void> {
    // Prefer the caller's own session; fall back to whichever session the cookie belongs
    // to. The token itself is never trusted beyond that lookup.
    let targetSessionId = sessionId;
    if (!targetSessionId && refreshToken) {
      const session = await this.prisma.session.findFirst({
        where: { refreshTokens: { some: { tokenHash: this.crypto.hashToken(refreshToken) } } },
        select: { id: true, userId: true },
      });
      if (session) {
        targetSessionId = session.id;
        userId = userId ?? session.userId;
      }
    }

    if (allSessions && userId) {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return;
    }

    if (targetSessionId) {
      await this.prisma.session.updateMany({
        where: { id: targetSessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        lastActiveAt: true,
        expiresAt: true,
        createdAt: true,
        staff: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  // ── Password reset (NFR-SEC-04) ───────────────────────────────────────────

  /**
   * Always reports success, whether or not the address exists, so the endpoint
   * cannot be used to enumerate registered emails.
   */
  async requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalised },
      select: { id: true, email: true, name: true },
    });
    if (!user?.email) return;

    const token = this.crypto.issueOpaqueToken(32);
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hashToken(token),
        expiresAt: new Date(Date.now() + LOGIN_SECURITY.PASSWORD_RESET_TTL_MINUTES * 60_000),
      },
    });

    // The recipient cannot act on the token without the web route, so the email carries a
    // link, not a bare token (B20). Only the token hash is stored; this plaintext exists
    // in the message body and nowhere else.
    const resetUrl = `${this.config.value.APP_WEB_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await this.queues.add(QUEUE.NOTIFICATION, 'password-reset', {
      notificationId: '',
      userId: user.id,
      template: 'auth.password-reset',
      locale: 'en',
      channel: 'EMAIL',
      data: {
        name: user.name,
        token,
        resetUrl,
        ttlMinutes: LOGIN_SECURITY.PASSWORD_RESET_TTL_MINUTES,
      },
    });

    this.logger.log(`Password reset requested for ${user.id} from ${ctx.ip ?? 'unknown'}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.crypto.hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw AppError.badRequest('This reset link is invalid or has expired');
    }

    const passwordHash = await this.crypto.hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      // A password change ends every existing session.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /**
   * Changes the password of a signed-in user (M69, NFR-SEC-01).
   *
   * The caller must re-prove the current password: a stolen session cookie alone must not
   * be enough to take over the account. A wrong password counts toward the lockout like a
   * failed sign-in, because this endpoint is otherwise a password oracle for anyone holding
   * a session. On success every *other* session is revoked, so whoever else was signed in
   * is signed out, while the device the change was made on stays signed in. The owner is
   * emailed, so a change they did not make does not go unnoticed.
   */
  async changePassword(
    user: { id: string; sessionId: string },
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ otherSessionsRevoked: number }> {
    const record = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!record) throw AppError.notFound('User');
    if (!record.passwordHash) {
      throw AppError.badRequest(
        'This account signs in with a provider and has no password; use the reset link to set one',
      );
    }

    if (!(await this.crypto.verifyPassword(record.passwordHash, input.currentPassword))) {
      await this.registerFailedAttempt(record.id, record.email);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Current password is incorrect');
    }

    if (input.newPassword === input.currentPassword) {
      throw AppError.badRequest('The new password must be different from the current one');
    }

    const passwordHash = await this.crypto.hashPassword(input.newPassword);
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.id },
        data: { passwordHash, failedLoginCount: 0 },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);

    // A failed notice must not undo a password change that has already succeeded.
    try {
      await this.queues.add(QUEUE.NOTIFICATION, 'password-changed', {
        notificationId: '',
        userId: record.id,
        template: 'auth.password-changed',
        locale: 'en',
        channel: 'EMAIL',
        data: { changedAt: new Date().toISOString() },
      });
    } catch (error) {
      this.logger.warn(`Could not queue the password-changed notice: ${(error as Error).message}`);
    }

    this.logger.log(`Password changed for ${record.id}; revoked ${revoked.count} other session(s)`);
    return { otherSessionsRevoked: revoked.count };
  }

  // ── Lockout (NFR-SEC-04) ──────────────────────────────────────────────────

  private async registerFailedAttempt(userId: string, email: string | null): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (user.failedLoginCount >= LOGIN_SECURITY.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOGIN_SECURITY.LOCKOUT_MINUTES * 60_000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.LOCKED, lockedUntil },
      });
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      this.logger.warn(`NFR-SEC-04: account ${userId} locked until ${lockedUntil.toISOString()}`);

      if (email) {
        await this.queues.add(QUEUE.NOTIFICATION, 'account-locked', {
          notificationId: '',
          userId,
          template: 'auth.account-locked',
          locale: 'en',
          channel: 'EMAIL',
          data: { lockedUntil: lockedUntil.toISOString() },
        });
      }
    }
  }

  // ── 2FA (FR-AUTH-01) ──────────────────────────────────────────────────────

  /**
   * Re-authentication for sensitive account changes (NFR-SEC-01).
   *
   * Turning 2FA on or off must not be possible with a merely *stolen session cookie*:
   * the caller has to re-prove who they are with the account password or a live
   * TOTP/recovery code.
   */
  async requireReauth(userId: string, input: { password?: string; code?: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, twoFactorEnabled: true },
    });

    if (input.password) {
      if (
        user?.passwordHash &&
        (await this.crypto.verifyPassword(user.passwordHash, input.password))
      ) {
        return;
      }
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Password is incorrect');
    }

    if (input.code && user?.twoFactorEnabled) {
      if (await this.twoFactor.verify(userId, input.code)) return;
      throw new AppError(ErrorCode.INVALID_TWO_FACTOR_CODE, 'Two-factor code is incorrect');
    }

    if (input.password !== undefined || input.code !== undefined) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Password is incorrect');
    }

    throw new AppError(
      // Q16 — this shared UNAUTHENTICATED with an expired access token, so a client
      // could not tell "you have not proved who you are" from "your session is over" and
      // answered by refreshing and retrying. The two need different handling.
      ErrorCode.REAUTH_REQUIRED,
      'Enter your password or a two-factor code to continue',
    );
  }

  async currentUser(userId: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        timeZone: true,
        status: true,
        twoFactorEnabled: true,
        lastActiveAt: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) throw AppError.notFound('User');
    return { ...user, roles: toSharedRoles(user.roles.map((r) => r.role)) };
  }
}
