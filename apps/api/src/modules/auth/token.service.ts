import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';

import { AuthenticatedUser } from '../../common/decorators';
import { Role } from '@hifzoon/shared';

export interface JwtPayload {
  sub: string;
  roles: Role[];
  staff: boolean;
  sid: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

@Injectable()
export class TokenService {
  constructor() {}

  /**
   * The access token is deliberately thin: identity, roles and the session id.
   * Everything that can change (status, roles, 2FA) is re-read on refresh, so a
   * revoked session or a disabled account cannot ride an unexpired token for more
   * than the 15 minute TTL.
   */
  toAccessPayload(user: { id: string }, roles: Role[], sessionId: string): JwtPayload {
    return {
      sub: user.id,
      roles,
      staff: roles.some((role) => STAFF_SET.has(role)),
      sid: sessionId,
    };
  }

  toAuthenticatedUser(payload: JwtPayload): AuthenticatedUser {
    return {
      id: payload.sub,
      sessionId: payload.sid,
      email: null,
      name: '',
      roles: payload.roles,
      status: UserStatus.ACTIVE,
      staff: payload.staff,
      language: 'en',
      timeZone: 'UTC',
    };
  }
}

/** Mirrors `STAFF_ROLES` in packages/shared without importing the enum twice. */
const STAFF_SET = new Set<Role>([
  Role.TEACHER,
  Role.EXAMINER,
  Role.SUPERVISOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.SAFEGUARDING_LEAD,
]);
