/**
 * Auth payload contracts shared between API and web (TRD section 6).
 */

import type { Role } from '../enums/identity.enum';

export interface AccessTokenClaims {
  sub: string;
  roles: Role[];
  /** True when the token was issued for a staff account, which requires 2FA (FR-AUTH-01). */
  staff: boolean;
  /** Session id — lets a session be revoked server-side. */
  sid: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface AuthUserPayload {
  id: string;
  email: string | null;
  name: string;
  roles: Role[];
  status: string;
  twoFactorEnabled: boolean;
  lastActiveAt: string | null;
}

export interface AuthTokensResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  refreshToken?: string;
  /** Present when the staff account must complete a 2FA challenge before tokens are issued. */
  twoFactorRequired?: boolean;
  user: AuthUserPayload;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}
