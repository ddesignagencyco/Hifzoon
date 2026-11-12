import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DataRequestStatus, Role } from '@hifzoon/shared';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { DataRequestsAdminService } from './data-requests-admin.service';

export class ListDataRequestsQueryDto {
  /** `openOnly=true` — requested or in progress, the ones still owed an answer. */
  @IsOptional() @Type(() => Boolean) @IsBoolean() openOnly?: boolean;
  @IsOptional() @IsEnum(DataRequestStatus) status?: DataRequestStatus;
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

export class RejectDataRequestDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason!: string;
}

/** CR-05 — the academy's queue of family export and deletion requests. */
@ApiTags('consent')
@ApiBearerAuth()
@Controller('admin/data-requests')
export class DataRequestsAdminController {
  constructor(private readonly requests: DataRequestsAdminService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Every family data request with its 30-day deadline',
    description: 'Nearest deadline first. `overdue` is true for an open request past `dueAt`.',
  })
  @ApiQuery({ name: 'openOnly', required: false, example: true })
  @ApiQuery({ name: 'status', required: false, enum: DataRequestStatus })
  list(@Query() query: ListDataRequestsQueryDto) {
    return this.requests.list({
      openOnly: query.openOnly,
      status: query.status,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
  }

  @Post(':dataRequestId/reject')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refuse a data request, with the reason the family is told',
    description: 'Only an open request can be refused; the refusal is audited.',
  })
  reject(
    @Param('dataRequestId') dataRequestId: string,
    @Body() dto: RejectDataRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requests.reject({ dataRequestId, reason: dto.reason, actorUserId: user.id });
  }
}
