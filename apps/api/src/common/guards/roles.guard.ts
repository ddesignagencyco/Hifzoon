import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Role } from '@hifzoon/shared';

import { ROLES_KEY } from '../decorators';
import { AppError } from '../errors/app-error';

/**
 * RBAC (FR-AUTH-02, NFR-SEC-02). A user may hold several roles; holding any role on
 * the route's list grants access. Ownership is checked separately by the services
 * through PolicyService, because "may touch *their* students" cannot be expressed
 * as a static role list.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: { roles: Role[] } }>();
    const roles = request.user?.roles ?? [];

    if (required.some((role) => roles.includes(role))) return true;

    throw new AppError(
      ErrorCode.ROLE_REQUIRED,
      `This action requires one of the following roles: ${required.join(', ')}`,
    );
  }
}
