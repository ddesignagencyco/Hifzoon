import { Role } from '@hifzoon/shared';

import { ROLES_KEY } from '../../common/decorators';
import { AdminConsoleController } from './admin-console.controller';

describe('AdminConsoleController roles', () => {
  const rolesOf = (handler: unknown) => Reflect.getMetadata(ROLES_KEY, handler as object) as Role[];

  it('lets hiring reviewers (ADMIN, SUPERVISOR) read a teacher readiness report', () => {
    expect(rolesOf(AdminConsoleController.prototype.readiness)).toEqual(
      expect.arrayContaining([Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR]),
    );
  });

  it('keeps account changes SUPER_ADMIN only', () => {
    expect(rolesOf(AdminConsoleController.prototype.setRoles)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, AdminConsoleController)).toEqual([Role.SUPER_ADMIN]);
  });
});
