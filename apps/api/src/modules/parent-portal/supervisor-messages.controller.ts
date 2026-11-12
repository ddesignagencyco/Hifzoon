import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SupervisorMessagesService } from './supervisor-messages.service';

const listQuery = z.object({
  teacherId: z.string().uuid().optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Supervisors' read-only view of guardian ↔ teacher conversations (FR-PAR-07). Admins are
 * deliberately not included: routine administration has no need to read families' messages.
 */
@ApiTags('supervision')
@ApiBearerAuth()
@Controller('supervision/messages')
@Roles(Role.SUPERVISOR, Role.SUPER_ADMIN)
export class SupervisorMessagesController {
  constructor(private readonly messages: SupervisorMessagesService) {}

  @ZodQuery(listQuery)
  @Get('threads')
  @ApiOperation({
    summary: 'Conversations of your assigned teachers (no message text)',
    description: 'Opening a conversation is audited; this list is not.',
  })
  @ApiQuery({ name: 'teacherId', required: false })
  threads(
    @Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.listThreads({ userId: user.id, roles: user.roles }, query);
  }

  @Get('threads/:threadId')
  @ApiOperation({
    summary: 'Read one conversation, read-only',
    description: 'Does not mark messages read and cannot post. Recorded in the audit log.',
  })
  thread(
    @Param('threadId', new ParseUUIDPipe()) threadId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messages.getThread({ userId: user.id, roles: user.roles }, threadId);
  }
}
