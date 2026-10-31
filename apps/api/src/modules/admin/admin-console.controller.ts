import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, UserStatus } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminConsoleService } from './admin-console.service';

const searchQuery = z.object({
  q: z.string().min(2).max(120),
  entity: z.enum(['students', 'families', 'teachers', 'classes']).default('students'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const statusBody = z.object({ status: z.nativeEnum(UserStatus) });

const rolesBody = z.object({ roles: z.array(z.nativeEnum(Role)).min(1) });

const provisionTeacherBody = z.object({
  email: z.string().email().max(320),
  name: z.string().min(2).max(160),
  phone: z.string().min(5).max(32).optional(),
  password: z.string().min(12).max(200),
  languages: z.array(z.string().min(2).max(5)).min(1),
  subjects: z.array(z.string().min(1).max(60)).min(1),
  ageGroups: z.array(z.string().min(1).max(20)).min(1),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  bio: z.string().max(4000).optional(),
});

/**
 * Admin console (FR-OPS-04, OPS-FE-04).
 *
 * Restricted to `SUPER_ADMIN`. Support staff are modelled as `ADMIN` and deliberately
 * cannot reach these endpoints: role assignment and account locking are the two
 * operations that, if abused, let one staff member take over another or hide their own
 * activity. `ADMIN` can read the CRM and settings but cannot change an account.
 */
@ApiTags('admin/console')
@ApiBearerAuth()
@Controller('admin/console')
@Roles(Role.SUPER_ADMIN)
export class AdminConsoleController {
  constructor(private readonly console: AdminConsoleService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform counters for the admin home screen' })
  overview() {
    return this.console.overview();
  }

  @ZodQuery(searchQuery)
  @Get('search')
  // Admins pick students and families by name across the console (no ids to paste).
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiQuery({ name: 'q', required: true })
  @ApiOperation({ summary: 'Search students, families, teachers or classes' })
  search(@Query(new ZodValidationPipe(searchQuery)) query: z.infer<typeof searchQuery>) {
    return this.console.search(query.q, query.entity, query.limit);
  }

  @ZodBody(statusBody)
  @Patch('users/:id/status')
  @Audit({ action: 'ops.user.status', targetType: 'user' })
  @ApiOperation({ summary: 'Lock, disable or reactivate an account' })
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusBody)) body: z.infer<typeof statusBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.console.setUserStatus(id, body.status, user.id);
  }

  @ZodBody(rolesBody)
  @Patch('users/:id/roles')
  @Audit({ action: 'ops.user.roles', targetType: 'user' })
  @ApiOperation({ summary: 'Replace a user role assignment' })
  setRoles(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rolesBody)) body: z.infer<typeof rolesBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.console.setRoles(id, body.roles, user.id);
  }

  @Get('teachers/:teacherId/readiness')
  @ApiOperation({ summary: 'Why a teacher is or is not matchable (FR-TCH-02)' })
  readiness(@Param('teacherId') teacherId: string) {
    return this.console.teacherReadiness(teacherId);
  }

  @ZodBody(provisionTeacherBody)
  @Post('teachers')
  @Audit({ action: 'ops.teacher.provision', targetType: 'teacher_profile' })
  @ApiOperation({ summary: 'Provision a teacher account (starts uncleared)' })
  provisionTeacher(
    @Body(new ZodValidationPipe(provisionTeacherBody)) body: z.infer<typeof provisionTeacherBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.console.provisionTeacher({ ...body, actorId: user.id });
  }
}
