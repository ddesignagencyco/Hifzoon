import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Role } from '@hifzoon/shared';
import type { Request } from 'express';

/** Route is reachable without a session (auth endpoints, catalog, webhooks). */
export const IS_PUBLIC_KEY = 'hifzoon:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Route works with or without a session.
 *
 * For endpoints whose *own* credential is the httpOnly refresh cookie (M5, logout): an
 * access token that has expired must not be the reason a user cannot sign out of a shared
 * machine, and the cookie is a credential in its own right. The caller is attached when the
 * token is valid and ignored when it is not, so authorisation inside the handler decides
 * what happens — never the guard's failure to parse a token.
 */
export const IS_OPTIONAL_AUTH_KEY = 'hifzoon:optionalAuth';
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

/** Required roles — any one of them is enough (FR-AUTH-02 multi-role). */
export const ROLES_KEY = 'hifzoon:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface AuditMetadata {
  action: string;
  targetType: string;
  targetId?: string;
  captureBody?: boolean;
}

/** Marks a route for the append-only audit trail (FR-OPS-06). */
export const AUDIT_KEY = 'hifzoon:audit';
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);

/** Idempotency-Key header is mandatory (TRD section 5.1 — payments and webhooks). */
export const IDEMPOTENT_KEY = 'hifzoon:idempotent';
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

/** Signed in user, as attached by JwtStrategy. */
export interface AuthenticatedUser {
  id: string;
  sessionId: string;
  email: string | null;
  name: string;
  roles: Role[];
  status: string;
  staff: boolean;
  language: string;
  timeZone: string;
  /**
   * FR-AUTH-01 — a staff account that has never enrolled a second factor. The session is
   * real (they need one in order to enrol) but every route outside the enrolment
   * allow-list is refused with TWO_FACTOR_ENROLMENT_REQUIRED. Never set for families or
   * students, who are not required to enrol.
   */
  twoFactorEnrolmentRequired?: boolean;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
  id?: string;
}

export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return undefined;
    return field ? user[field] : user;
  },
);

export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.headers['idempotency-key'];
  return Array.isArray(header) ? header[0] : header;
});
