import type { Reflector } from '@nestjs/core';
import { Role } from '@hifzoon/shared';

import { RolesGuard } from './roles.guard';

function run(required: Role[] | undefined, roles: Role[]): boolean {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
  };
  return new RolesGuard(reflector).canActivate(context as never);
}

describe('RolesGuard', () => {
  it('lets a route with no role list through', () => {
    expect(run(undefined, [])).toBe(true);
  });

  it('grants access on any matching role', () => {
    expect(run([Role.TEACHER, Role.ADMIN], [Role.ADMIN])).toBe(true);
  });

  it('refuses a caller with none of the listed roles', () => {
    expect(() => run([Role.ADMIN], [Role.SUPERVISOR])).toThrow(/requires one of/);
  });

  it('lets SUPER_ADMIN through a route that lists ADMIN only', () => {
    expect(run([Role.TEACHER, Role.SUPERVISOR, Role.ADMIN], [Role.SUPER_ADMIN])).toBe(true);
  });

  it('does not let SUPER_ADMIN into routes that do not list ADMIN', () => {
    expect(() => run([Role.TEACHER], [Role.SUPER_ADMIN])).toThrow(/requires one of/);
  });
});
