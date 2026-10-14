import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

import { IS_PUBLIC_KEY } from '../decorators';

/**
 * Applied globally. Routes opt out with `@Public()`; everything else needs a valid
 * access token (FR-AUTH-01). Class- and method-level metadata both count, so a
 * controller can be public wholesale.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(
    context: ExecutionContext,
  ): boolean | Observable<boolean> | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /**
   * Passport signals "no usable credential" by calling this with a falsy user.
   * It must raise an HTTP exception — throwing a bare Error would surface as a 500
   * and tell a caller with an expired token that the server is broken.
   */
  override handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err instanceof UnauthorizedException) throw err;
    if (err)
      throw new UnauthorizedException(err instanceof Error ? err.message : 'Authentication failed');
    if (!user) {
      const reason = info instanceof Error ? info.message : undefined;
      throw new UnauthorizedException(reason ?? 'A valid access token is required');
    }
    return user;
  }
}
