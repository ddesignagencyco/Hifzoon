import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RevisionRequestReason, RevisionRequestStatus } from '@prisma/client';
import { Role } from '@hifzoon/shared';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import {
  REVISION_MESSAGE_MAX,
  RevisionRequestsService,
  RevisionScope,
} from './revision-requests.service';

export class CreateRevisionRequestDto {
  @IsEnum(RevisionRequestReason) reason!: RevisionRequestReason;
  @IsString() @MinLength(1) @MaxLength(REVISION_MESSAGE_MAX) message!: string;
}

export class RespondRevisionRequestDto {
  @IsString() @MinLength(1) @MaxLength(2000) response!: string;
}

export class RevisionListQuery {
  @IsOptional() @IsIn(['family', 'teacher', 'all']) scope?: RevisionScope;
  @IsOptional() @IsString() lessonCardId?: string;
  @IsOptional() @IsEnum(RevisionRequestStatus) status?: RevisionRequestStatus;
}

@ApiTags('lessons')
@ApiBearerAuth()
@Controller()
export class RevisionRequestsController {
  constructor(private readonly requests: RevisionRequestsService) {}

  @Post('lesson-cards/:lessonCardId/revision-requests')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'A guardian asks for a revision or follow-up on a shared lesson card',
    description: "Only on their own child's card, and only once it has been shared.",
  })
  create(
    @Param('lessonCardId') lessonCardId: string,
    @Body() dto: CreateRevisionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requests.create({ lessonCardId, ...dto, actor: user });
  }

  @Get('revision-requests')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Revision requests: the family’s own, a teacher’s queue, or all (staff)',
  })
  @ApiQuery({ name: 'scope', required: false, enum: ['family', 'teacher', 'all'] })
  @ApiQuery({ name: 'lessonCardId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: RevisionRequestStatus })
  list(@Query() query: RevisionListQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.requests.list({
      actor: user,
      scope: query.scope ?? 'family',
      lessonCardId: query.lessonCardId,
      status: query.status,
    });
  }

  @Get('revision-requests/count')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'How many requests match, for nav badges' })
  @ApiQuery({ name: 'scope', required: false, enum: ['family', 'teacher', 'all'] })
  @ApiQuery({ name: 'status', required: false, enum: RevisionRequestStatus })
  count(@Query() query: RevisionListQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.requests.count({
      actor: user,
      scope: query.scope ?? 'family',
      status: query.status,
    });
  }

  @Post('revision-requests/:id/respond')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'The card’s teacher or a supervisor answers a request',
    description: 'Sets ANSWERED, stores the reply, tells the guardians and is audited.',
  })
  respond(
    @Param('id') id: string,
    @Body() dto: RespondRevisionRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requests.respond({ id, response: dto.response, actor: user });
  }

  @Post('revision-requests/:id/close')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The family closes their request' })
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.requests.close({ id, actor: user });
  }
}
