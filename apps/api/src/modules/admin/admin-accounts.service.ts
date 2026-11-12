import { Injectable, Logger } from '@nestjs/common';
import { Role } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

/** Roles that can be handed out by creating a staff account. SUPER_ADMIN is deliberately not one. */
export const INVITABLE_STAFF_ROLES = [
  Role.ADMIN,
  Role.SUPERVISOR,
  Role.SAFEGUARDING_LEAD,
  Role.EXAMINER,
] as const;

const INVITE_TTL_HOURS = 7 * 24;
const RESET_TTL_MINUTES = 60;

/**
 * Staff accounts and account recovery by an administrator (FR-OPS-04).
 *
 * Nothing here ever sets or reveals a password. An invite or reset emails a one-time link
 * the person uses to choose their own; only the token's hash is stored. Every action is
 * audited, and 2FA resets and session revocation also end the person's live sessions.
 */
@Injectable()
export class AdminAccountsService {
  private readonly logger = new Logger(AdminAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Creates a staff account with no password and emails the invite (FR-OPS-04). */
  async createStaff(
    input: { email: string; name: string; phone?: string; roles: string[] },
    actorId: string,
  ) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) throw AppError.badRequest('A staff member needs a name');

    const roles = [...new Set(input.roles)];
    const invalid = roles.filter((r) => !(INVITABLE_STAFF_ROLES as readonly string[]).includes(r));
    if (roles.length === 0 || invalid.length > 0) {
      throw AppError.badRequest(
        `Staff roles are ${INVITABLE_STAFF_ROLES.join(', ')}. Super admin is granted from the role editor.`,
        { invalid },
      );
    }

    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw AppError.conflict(
        'CONFLICT',
        'An account with that email already exists; add the role from the Users screen instead',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        phone: input.phone ?? null,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        notificationPreferences: { create: {} },
        roles: { create: roles.map((role) => ({ role: role as never })) },
      },
      select: { id: true, email: true, name: true },
    });

    const invited = await this.sendInvite(user.id, user.name, email);
    await this.audit.record({
      actorId,
      action: 'ops.staff.create',
      targetType: 'user',
      targetId: user.id,
      after: { email, roles, inviteEmailed: invited },
    });
    return { ...user, roles, inviteEmailed: invited };
  }

  /** Sends a fresh invite to someone who has not set a password yet. */
  async resendInvite(userId: string, actorId: string) {
    const user = await this.loadUser(userId);
    if (user.passwordHash) {
      throw AppError.conflict(
        'CONFLICT',
        'This person has already set a password; send a password reset instead',
      );
    }
    if (!user.email) throw AppError.badRequest('This account has no email address');
    const invited = await this.sendInvite(user.id, user.name, user.email);
    await this.audit.record({
      actorId,
      action: 'ops.staff.resendInvite',
      targetType: 'user',
      targetId: userId,
      after: { inviteEmailed: invited },
    });
    return { userId, inviteEmailed: invited };
  }

  /**
   * Emails a password-reset link (the admin never sees or sets the password). Live sessions
   * are ended too: someone asking for a reset may no longer control the account.
   */
  async sendPasswordReset(userId: string, actorId: string) {
    const user = await this.loadUser(userId);
    if (!user.email) throw AppError.badRequest('This account has no email address');
    const token = await this.issueToken(user.id, RESET_TTL_MINUTES);
    const sent = await this.notifications.emailAddress({
      to: user.email,
      template: TEMPLATE.PASSWORD_RESET,
      data: {
        name: user.name,
        resetUrl: this.resetUrl(token),
        ttlMinutes: RESET_TTL_MINUTES,
      },
    });
    const revoked = await this.endSessions(user.id);
    await this.audit.record({
      actorId,
      action: 'ops.user.passwordReset',
      targetType: 'user',
      targetId: userId,
      after: { emailed: sent, sessionsRevoked: revoked },
    });
    return { userId, emailed: sent, sessionsRevoked: revoked };
  }

  /** Clears two-factor so the person can sign in and enrol again (lost device). */
  async resetTwoFactor(userId: string, actorId: string) {
    if (userId === actorId) {
      throw AppError.badRequest('You cannot reset your own two-factor; ask another super admin');
    }
    const user = await this.loadUser(userId);
    if (!user.twoFactorEnabled && !user.twoFactorSecret) {
      throw AppError.conflict('CONFLICT', 'Two-factor is not set up for this account');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    const revoked = await this.endSessions(userId);
    if (user.email) {
      await this.notifications
        .emailAddress({
          to: user.email,
          template: TEMPLATE.TWO_FACTOR_RESET,
          data: { name: user.name },
        })
        .catch((e: Error) => this.logger.warn(`2FA-reset notice not sent: ${e.message}`));
    }
    await this.audit.record({
      actorId,
      action: 'ops.user.twoFactorReset',
      targetType: 'user',
      targetId: userId,
      after: { sessionsRevoked: revoked },
    });
    return { userId, twoFactorEnabled: false, sessionsRevoked: revoked };
  }

  /** Signs the person out everywhere. */
  async revokeSessions(userId: string, actorId: string) {
    await this.loadUser(userId);
    const revoked = await this.endSessions(userId);
    await this.audit.record({
      actorId,
      action: 'ops.user.revokeSessions',
      targetType: 'user',
      targetId: userId,
      after: { sessionsRevoked: revoked },
    });
    return { userId, sessionsRevoked: revoked };
  }

  /** An account's active sessions, so the admin can see what a revoke would end. */
  async listSessions(userId: string) {
    await this.loadUser(userId);
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
      take: 50,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        lastActiveAt: true,
        createdAt: true,
        staff: true,
      },
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async sendInvite(userId: string, name: string, email: string): Promise<boolean> {
    const token = await this.issueToken(userId, INVITE_TTL_HOURS * 60);
    return this.notifications
      .emailAddress({
        to: email,
        template: TEMPLATE.STAFF_INVITE,
        data: { name, setPasswordUrl: this.resetUrl(token), ttlHours: INVITE_TTL_HOURS },
      })
      .catch((e: Error) => {
        this.logger.warn(`Staff invite for ${userId} not sent: ${e.message}`);
        return false;
      });
  }

  /** A single live link per person: earlier unused ones stop working. */
  private async issueToken(userId: string, ttlMinutes: number): Promise<string> {
    const token = this.crypto.issueOpaqueToken(32);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          tokenHash: this.crypto.hashToken(token),
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
        },
      }),
    ]);
    return token;
  }

  private resetUrl(token: string): string {
    return `${this.config.value.APP_WEB_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private async endSessions(userId: string): Promise<number> {
    const now = new Date();
    const [sessions] = await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
    return sessions.count;
  }

  private async loadUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) throw AppError.notFound('User');
    return user;
  }
}
