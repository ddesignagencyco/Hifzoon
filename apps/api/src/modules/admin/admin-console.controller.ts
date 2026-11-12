import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role, UserStatus } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminConsoleService } from './admin-console.service';

const searchQuery = z.object({
  q: z.string().min(2).max(120),
  entity: z.enum(['students', 'families', 'teachers', 'classes']).default('students'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});

const statusBody = z.object({ status: z.nativeEnum(UserStatus) });

const staffBody = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(2).max(160),
  phone: z.string().min(5).max(32).optional(),
  roles: z
    .array(z.enum(['ADMIN', 'SUPERVISOR', 'SAFEGUARDING_LEAD', 'EXAMINER']))
    .min(1)
    .max(4),
});

const rolesBody = z.object({ roles: z.array(z.nativeEnum(Role)).min(1) });
const timeZoneBody = z.object({ timeZone: z.string().min(1).max(64) });

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
  constructor(
    private readonly console: AdminConsoleService,
    private readonly accounts: AdminAccountsService,
  ) {}

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
    return this.console.search(query.q, query.entity, query.limit, query.page);
  }

  @Get('examiners')
  // Overrides the controller's super-admin default: admins assign exams, so they need this.
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Active users who hold the Examiner role (for the exam picker)' })
  @ApiQuery({ name: 'q', required: false, description: 'Name or email' })
  examiners(@Query('q') q?: string) {
    return this.console.listExaminers({ q: q?.slice(0, 120) });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'An account with its current roles' })
  getUser(@Param('id') id: string) {
    return this.console.getUser(id);
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

  @ZodBody(staffBody)
  @Post('staff')
  @Audit({ action: 'ops.staff.create', targetType: 'user', captureBody: false })
  @ApiOperation({
    summary: 'Create a staff account and email the invite',
    description:
      'No password is set or shown: the person chooses theirs from the emailed link (7 days).',
  })
  createStaff(
    @Body(new ZodValidationPipe(staffBody)) body: z.infer<typeof staffBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.createStaff(body, user.id);
  }

  @Post('users/:id/resend-invite')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ops.staff.resendInvite', targetType: 'user', captureBody: false })
  @ApiOperation({ summary: 'Send a fresh invite to someone who has not set a password yet' })
  resendInvite(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.resendInvite(id, user.id);
  }

  @Post('users/:id/password-reset')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ops.user.passwordReset', targetType: 'user', captureBody: false })
  @ApiOperation({
    summary: 'Email the person a password-reset link and sign them out everywhere',
    description: 'The admin never sees or sets the password.',
  })
  passwordReset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.sendPasswordReset(id, user.id);
  }

  @Post('users/:id/two-factor/reset')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ops.user.twoFactorReset', targetType: 'user', captureBody: false })
  @ApiOperation({ summary: 'Clear two-factor (lost device); they enrol again at next sign-in' })
  resetTwoFactor(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.resetTwoFactor(id, user.id);
  }

  @Post('users/:id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'ops.user.revokeSessions', targetType: 'user', captureBody: false })
  @ApiOperation({ summary: 'Sign the person out of every device' })
  revokeSessions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.revokeSessions(id, user.id);
  }

  @Get('users/:id/sessions')
  @ApiOperation({ summary: "A person's active sessions" })
  sessions(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accounts.listSessions(id);
  }

  @ZodBody(timeZoneBody)
  @Patch('users/:id/time-zone')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: "Set a user's time zone",
    description:
      'Teachers cannot change their own zone (their hours are stored in it), so the office does.',
  })
  setTimeZone(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(timeZoneBody)) body: z.infer<typeof timeZoneBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.console.setTimeZone(id, body.timeZone, user.id);
  }

  @Get('teachers/:teacherId/readiness')
  // Read-only checklist (hiring status, training recorded, outstanding steps): the hiring
  // reviewers — ADMIN and SUPERVISOR — need it on the application pages, which showed a
  // 403 panel. Nothing here changes an account.
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
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
