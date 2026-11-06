import { Role } from '@hifzoon/shared';

import { ROLES_KEY } from '../../common/decorators';
import { CoursesController } from './courses.controller';

describe('CoursesController enrolments list roles', () => {
  it('lets the kids PIN session (CHILD_STUDENT) read its own enrolments', () => {
    const roles = Reflect.getMetadata(
      ROLES_KEY,
      CoursesController.prototype.listEnrolments,
    ) as Role[];
    expect(roles).toContain(Role.CHILD_STUDENT);
    expect(roles).toContain(Role.STUDENT);
  });
});
