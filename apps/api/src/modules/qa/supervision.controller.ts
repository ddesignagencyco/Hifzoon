import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';

import { CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { SupervisionService } from './supervision.service';

@ApiTags('supervision')
@ApiBearerAuth()
@Controller('supervision')
export class SupervisionController {
  constructor(private readonly supervision: SupervisionService) {}

  @Get('me/teachers')
  @Roles(Role.SUPERVISOR)
  @ApiOperation({ summary: 'The teachers I oversee (my caseload)' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.supervision.caseload(user.id);
  }

  @Get('supervisors/:supervisorId/teachers')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "A supervisor's caseload" })
  caseload(@Param('supervisorId', ParseUUIDPipe) supervisorId: string) {
    return this.supervision.caseload(supervisorId);
  }

  @Put('supervisors/:supervisorId/teachers/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign a teacher to a supervisor (idempotent)' })
  assign(
    @Param('supervisorId', ParseUUIDPipe) supervisorId: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supervision.assign(supervisorId, teacherId, user.id);
  }

  @Delete('supervisors/:supervisorId/teachers/:teacherId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a teacher from a supervisor' })
  unassign(
    @Param('supervisorId', ParseUUIDPipe) supervisorId: string,
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.supervision.unassign(supervisorId, teacherId, user.id);
  }
}
