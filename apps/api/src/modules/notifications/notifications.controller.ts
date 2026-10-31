import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { toPagination } from '../../common/utils/pagination.util';
import { paginated } from '../../common/utils/pagination.util';
import { NotificationsService } from './notifications.service';

export class UpdatePreferencesDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() whatsapp?: boolean;
  @IsOptional() @IsBoolean() push?: boolean;

  /** `HH:mm` in the user's own timezone. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'quietFrom must be HH:mm' })
  quietFrom?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'quietTo must be HH:mm' })
  quietTo?: string;

  @IsOptional() @IsString() @MaxLength(5) language?: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'In-app notification centre (FR-NTF-02)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: { page?: string; limit?: string },
  ) {
    const params = toPagination(query);
    const [items, total] = await Promise.all([
      this.notifications.listForUser(user.id, params.take, params.skip),
      this.prisma.notification.count({ where: { userId: user.id } }),
    ]);
    return paginated(items, params, total);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'How many notifications are unread (M59)' })
  async unread(@CurrentUser() user: AuthenticatedUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark notifications read: the given ids, or all when none are given (M59)',
  })
  markRead(@CurrentUser() user: AuthenticatedUser, @Body() body: { ids?: string[] }) {
    const ids = Array.isArray(body?.ids)
      ? body.ids.filter((x) => typeof x === 'string').slice(0, 200)
      : undefined;
    return this.notifications.markRead(user.id, ids);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Channel and quiet-hour preferences (FR-NTF-01, FR-NTF-04)' })
  async preferences(@CurrentUser() user: AuthenticatedUser) {
    const existing = await this.prisma.notificationPreference.findUnique({
      where: { userId: user.id },
    });
    return (
      existing ?? {
        userId: user.id,
        email: true,
        whatsapp: false,
        push: true,
        quietFrom: null,
        quietTo: null,
        language: user.language,
      }
    );
  }

  @Patch('preferences')
  @Roles(
    Role.GUARDIAN,
    Role.STUDENT,
    Role.CHILD_STUDENT,
    Role.TEACHER,
    Role.ADMIN,
    Role.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Update channel preferences and quiet hours (FR-NTF-04)',
    description: 'Safeguarding alerts ignore quiet hours (CR-08).',
  })
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.whatsapp !== undefined ? { whatsapp: dto.whatsapp } : {}),
      ...(dto.push !== undefined ? { push: dto.push } : {}),
      ...(dto.language !== undefined ? { language: dto.language } : {}),
      ...(dto.quietFrom !== undefined
        ? { quietFrom: dto.quietFrom ? timeToDate(dto.quietFrom) : null }
        : {}),
      ...(dto.quietTo !== undefined
        ? { quietTo: dto.quietTo ? timeToDate(dto.quietTo) : null }
        : {}),
    };

    return this.prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register a push device token (IR-SW-06, P2)' })
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { platform: string; token: string },
  ) {
    if (!body?.platform || !body?.token)
      throw AppError.badRequest('platform and token are required');
    return this.prisma.deviceToken.upsert({
      where: { token: body.token },
      update: { platform: body.platform as never, userId: user.id },
      create: { userId: user.id, platform: body.platform as never, token: body.token },
      select: { id: true, platform: true },
    });
  }

  @Get('preferences/:userId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: "Staff view of a user's channel preferences (NTF-BE-04)" })
  async forUser(@Param('userId') userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
  }
}

function timeToDate(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes));
}
