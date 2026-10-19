import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { ErrorCode } from '@hifzoon/shared';
import { AppError } from '../errors/app-error';
import { AppConfigService } from '../../config/app-config.service';
import type { AuthenticatedUser } from '../decorators';

/**
 * FR-AUTH-01 / M42 — a staff account must not stay usable without a second factor.
 *
 * Signing in with a password alone used to be enough for any staff account, so the
 * strongest accounts in the product (SUPER_ADMIN sees every family's data) were the least
 * protected. The fix has to leave a way in, though: refusing the sign-in outright would
 * leave nobody able to enrol, because enrolment is itself an authenticated call.
 *
 * So an unenrolled staff member gets a *restricted* session instead of a rejection. It
 * reaches the identity and enrolment routes below and nothing else — every other route
 * answers 403 TWO_FACTOR_ENROLMENT_REQUIRED. The flag is computed from live account state
 * on each request (JwtStrategy), so the restriction lifts the moment enrolment completes,
 * without waiting for a token to expire.
 *
 * Runs as an interceptor rather than a guard because it must see `request.user`, which the
 * JWT guard only attaches later in the chain.
 */
@Injectable()
export class TwoFactorEnrolmentInterceptor implements NestInterceptor {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Matched on the path suffix so the API prefix stays an implementation detail.
   * `auth/me` is included deliberately: the client needs the identity to render the
   * "2FA is required" state at all.
   */
  private static readonly ALLOWED = [
    '/auth/me',
    '/auth/refresh',
    '/auth/logout',
    '/auth/two-factor/setup',
    '/auth/two-factor/confirm',
  ];

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    if (!this.config.value.TWO_FACTOR_ENROLMENT_ENFORCED) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user?.twoFactorEnrolmentRequired) return next.handle();

    const path = request.path ?? '';
    const allowed = TwoFactorEnrolmentInterceptor.ALLOWED.some((suffix) => path.endsWith(suffix));
    if (allowed) return next.handle();

    throw new AppError(
      ErrorCode.TWO_FACTOR_ENROLMENT_REQUIRED,
      'Two-factor authentication is required for staff accounts before this account can be used (FR-AUTH-01)',
      { paths: TwoFactorEnrolmentInterceptor.ALLOWED },
    );
  }
}
