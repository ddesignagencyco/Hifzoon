import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionsService } from './permissions.service';

const setBody = z.object({
  role: z.string().min(1).max(40),
  permission: z.string().min(1).max(80),
  granted: z.boolean(),
});

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('admin/permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'The role-permission matrix (defaults plus overrides)' })
  matrix() {
    return this.permissions.matrix();
  }

  /** What the signed-in person may do, so the UI can hide controls they cannot use. */
  @Get('mine')
  @ApiOperation({ summary: 'Permissions held by the signed-in user' })
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return { permissions: await this.permissions.effectiveFor(user.roles) };
  }

  @ZodBody(setBody)
  @Put()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @Audit({ action: 'ops.permission.set', targetType: 'role_permission', captureBody: false })
  @ApiOperation({ summary: 'Grant or withdraw a permission for a staff role' })
  set(
    @Body(new ZodValidationPipe(setBody)) body: z.infer<typeof setBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.permissions.set(body, user.id);
  }
}
