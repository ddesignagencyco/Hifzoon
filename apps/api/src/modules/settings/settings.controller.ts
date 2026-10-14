import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SettingsService } from './settings.service';

const patchBody = z.object({
  patch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/**
 * Platform configuration (FR-OPS-05, OPS-FE-05).
 *
 * `GET` is `ADMIN`+ so support staff can see the current configuration when diagnosing a
 * problem. `PATCH` is `SUPER_ADMIN` only: these values change billing, scheduling and
 * safeguarding behaviour for every student at once, and the blast radius of an
 * accidental edit is the whole platform.
 */
@ApiTags('admin/settings')
@ApiBearerAuth()
@Controller('admin/settings')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'List every setting with its current value' })
  describe() {
    return this.settings.describe();
  }

  @Patch()
  @Roles(Role.SUPER_ADMIN)
  @ZodBody(patchBody)
  @Audit({ action: 'ops.setting.update', targetType: 'app_setting' })
  @ApiOperation({ summary: 'Update settings (SUPER_ADMIN only)' })
  update(
    @Body(new ZodValidationPipe(patchBody)) body: z.infer<typeof patchBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.settings.setMany(body.patch, user.id);
  }
}
