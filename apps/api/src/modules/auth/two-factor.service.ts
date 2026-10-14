import { Injectable, Logger } from '@nestjs/common';
import { authenticator } from 'otplib';
import { ErrorCode } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { CryptoService } from '../../common/services/crypto.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * TOTP two-factor for staff accounts (FR-AUTH-01).
 *
 * The shared secret is stored encrypted with AES-256-GCM (CMP-BE-05) — a database
 * dump must not be enough to mint valid codes. Recovery codes are stored as hashes
 * and are single-use.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  /** Generates a secret and returns the otpauth URI plus fresh recovery codes. */
  async setup(
    userId: string,
  ): Promise<{ otpauthUrl: string; secret: string; recoveryCodes: string[] }> {
    const secret = authenticator.generateSecret();
    const recoveryCodes = Array.from({ length: 8 }, () => this.crypto.issueOpaqueToken(6));

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: this.crypto.encrypt(secret, 'two_factor'),
        // Stays false until `confirm` succeeds, so a half-finished setup cannot lock
        // the account out.
        twoFactorEnabled: false,
      },
    });

    const email = await this.prisma.user
      .findUnique({ where: { id: userId }, select: { email: true } })
      .then((u) => u?.email ?? userId);

    return {
      otpauthUrl: authenticator.keyuri(email, 'Hifzoon', secret),
      secret,
      recoveryCodes,
    };
  }

  /** Confirms enrolment: the first valid code flips `twoFactorEnabled`. */
  async confirm(
    userId: string,
    code: string,
    recoveryCodes?: string[],
  ): Promise<{ enabled: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) throw AppError.badRequest('Start two-factor setup first');

    const secret = this.crypto.decrypt(user.twoFactorSecret, 'two_factor');
    if (!authenticator.check(code, secret)) {
      throw new AppError(ErrorCode.INVALID_TWO_FACTOR_CODE, 'That code is not valid');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        ...(recoveryCodes?.length
          ? {
              recoveryCodes: {
                create: recoveryCodes.map((c) => ({ codeHash: this.crypto.hashToken(c) })),
              },
            }
          : {}),
      },
    });

    return { enabled: true };
  }

  async disable(userId: string): Promise<{ enabled: boolean }> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      }),
      this.prisma.recoveryCode.deleteMany({ where: { userId, usedAt: null } }),
    ]);
    return { enabled: false };
  }

  /**
   * Verifies a TOTP or, failing that, a single-use recovery code. Called from the
   * login flow; a failure here is indistinguishable to the caller from a wrong
   * password.
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled) return true;
    if (!user.twoFactorSecret) return false;

    const secret = this.crypto.decrypt(user.twoFactorSecret, 'two_factor');
    if (code && authenticator.check(code, secret)) return true;

    const hash = this.crypto.hashToken(code ?? '');
    const recovery = await this.prisma.recoveryCode.findFirst({
      where: { userId, codeHash: hash, usedAt: null },
      select: { id: true },
    });
    if (recovery) {
      await this.prisma.recoveryCode.update({
        where: { id: recovery.id },
        data: { usedAt: new Date() },
      });
      this.logger.warn(`Recovery code used by ${userId}`);
      return true;
    }
    return false;
  }
}
