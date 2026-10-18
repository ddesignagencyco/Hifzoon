import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AppConfigService } from '../../../config/app-config.service';
import { AuthenticatedUser } from '../../../common/decorators';
import { PrismaService } from '../../../prisma/prisma.service';
import { toSharedRoles } from '../../../common/prisma-enum-bridge';
import { JwtPayload } from '../token.service';

export const JWT_ACCESS_OPTIONS = Symbol('JWT_ACCESS_OPTIONS');

/** Options object shared by Passport and the manual signer in AuthService. */
export function accessTokenOptions(config: AppConfigService) {
  return {
    secretOrKey: config.value.JWT_ACCESS_SECRET,
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    ignoreExpiration: false,
    issuer: config.value.JWT_ISSUER,
    audience: config.value.JWT_AUDIENCE,
  };
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super(accessTokenOptions(config));
  }

  /**
   * Validates the signature, then re-checks the session and account state on every
   * request. That is one extra indexed lookup per call in exchange for immediate
   * revocation of staff sessions (FR-AUTH-01, NFR-SEC-02).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        language: true,
        timeZone: true,
        lockedUntil: true,
        twoFactorEnabled: true,
        roles: { select: { role: true } },
        sessions: {
          where: { id: payload.sid },
          select: { id: true, revokedAt: true, expiresAt: true, lastActiveAt: true },
          take: 1,
        },
      },
    });

    if (!user) throw new UnauthorizedException('Account no longer exists');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is locked');
    }

    const session = user.sessions[0];
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session expired');
    }

    const roles = toSharedRoles(user.roles.map((r) => r.role));

    return {
      id: user.id,
      sessionId: session.id,
      email: user.email,
      name: user.name,
      roles,
      status: user.status,
      staff: payload.staff,
      language: user.language,
      timeZone: user.timeZone,
      // FR-AUTH-01 — read live rather than trusting the token, so enrolling 2FA lifts the
      // restriction on the next request without waiting for the token to expire (M42).
      twoFactorEnrolmentRequired: payload.staff && !user.twoFactorEnabled,
    };
  }
}
