import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@hifzoon/shared';

import { PERMISSION_KEY } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { PermissionsService } from './permissions.service';

/**
 * Enforces `@RequirePermission(key)`. A route without the decorator is unaffected, so the
 * matrix is adopted route by route; the roles guard still applies to anything else.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<{ user?: { roles: string[] } }>();
    const roles = request.user?.roles ?? [];
    if (await this.permissions.can(roles, required)) return true;

    throw new AppError(
      ErrorCode.ROLE_REQUIRED,
      `Your role does not have the "${required}" permission`,
      {
        permission: required,
      },
    );
  }
}
