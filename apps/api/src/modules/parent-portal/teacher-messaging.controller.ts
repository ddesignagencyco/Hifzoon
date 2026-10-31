import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppError } from '../../common/errors/app-error';
import { MessagingService } from './messaging.service';

const postMessageBody = z.object({ body: z.string().min(1).max(4000) });
const threadQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

/**
 * The teacher side of family messaging (FR-PAR-06).
 *
 * Same service, separate controller so the role sets cannot drift apart by accident.
 * Teachers can only read and post in threads tied to their own `teacher_profile` — the
 * service checks `teacherId: userId` ownership, so a teacher cannot read a thread that
 * happens to exist for a colleague.
 */
@ApiTags('teacher')
@ApiBearerAuth()
@Controller('teacher')
@Roles(Role.TEACHER)
export class TeacherMessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('threads')
  @ApiOperation({ summary: 'List family threads for this teacher' })
  listThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.messaging.listThreads({ userId: user.id, role: 'STAFF' });
  }

  @Post('threads')
  @Audit({ action: 'par.thread.open.teacher', targetType: 'message_thread' })
  @ApiOperation({ summary: 'Start a conversation with the family of one of your students (M66)' })
  openThread(@Body() body: { studentId?: string }, @CurrentUser() user: AuthenticatedUser) {
    if (typeof body?.studentId !== 'string') throw AppError.badRequest('studentId is required');
    return this.messaging.openThreadAsTeacher({
      teacherUserId: user.id,
      studentId: body.studentId,
    });
  }

  @ZodQuery(threadQuery)
  @Get('threads/:id')
  @ApiOperation({ summary: 'Read a thread' })
  getThread(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(threadQuery)) query: z.infer<typeof threadQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messaging.getThread({
      threadId: id,
      userId: user.id,
      role: 'STAFF',
      limit: query.limit,
    });
  }

  @ZodBody(postMessageBody)
  @Post('threads/:id/messages')
  @Audit({ action: 'par.message.post', targetType: 'message' })
  @ApiOperation({ summary: 'Reply to a family' })
  postMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(postMessageBody)) body: z.infer<typeof postMessageBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messaging.postMessage({
      threadId: id,
      senderId: user.id,
      body: body.body,
      senderRole: 'STAFF',
    });
  }
}
