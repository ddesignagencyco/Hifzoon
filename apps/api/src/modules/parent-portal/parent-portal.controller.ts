import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { MessagingService } from './messaging.service';
import { ParentPortalService } from './parent-portal.service';

const monthQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const chartQuery = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

const openThreadBody = z.object({
  familyId: z.string().uuid(),
  teacherId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  enrolmentId: z.string().uuid().optional(),
});

const postMessageBody = z.object({ body: z.string().min(1).max(4000) });

const threadQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).optional() });

/**
 * Parent portal (FR-PAR-01..07).
 *
 * Every read path calls `PolicyService.assertGuardianOwnsStudent` inside the service
 * rather than trusting the `:studentId` in the URL. The role guard only proves the
 * caller is *a* guardian; without the ownership check, one parent could read another
 * family's progress by changing an id, which is the single most likely serious bug in a
 * portal like this.
 */
@ApiTags('parent')
@ApiBearerAuth()
@Controller('parent')
@Roles(Role.GUARDIAN)
export class ParentPortalController {
  constructor(
    private readonly portal: ParentPortalService,
    private readonly messaging: MessagingService,
  ) {}

  @Get('students/:studentId/dashboard')
  @ApiOperation({ summary: 'Everything the parent home screen needs, in one call' })
  dashboard(@Param('studentId') studentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.portal.dashboard(user.id, studentId);
  }

  @ZodQuery(chartQuery)
  @Get('students/:studentId/charts')
  @ApiOperation({ summary: 'Memorisation progress series' })
  charts(
    @Param('studentId') studentId: string,
    @Query(new ZodValidationPipe(chartQuery)) query: z.infer<typeof chartQuery>,
  ) {
    return this.portal.progressChart(studentId, query.months);
  }

  @ZodQuery(monthQuery)
  @Get('students/:studentId/report-card')
  @ApiOperation({ summary: 'Monthly report card' })
  reportCard(
    @Param('studentId') studentId: string,
    @Query(new ZodValidationPipe(monthQuery)) query: z.infer<typeof monthQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.portal.monthlyReportCard(user.id, studentId, query.year, query.month);
  }

  // ── Messaging (FR-PAR-06) ─────────────────────────────────────────────────

  @Get('threads')
  @ApiOperation({ summary: 'List message threads' })
  listThreads(@CurrentUser() user: AuthenticatedUser) {
    return this.messaging.listThreads({ userId: user.id, role: 'GUARDIAN' });
  }

  @ZodBody(openThreadBody)
  @Post('threads')
  @Audit({ action: 'par.thread.open', targetType: 'message_thread' })
  @ApiOperation({ summary: 'Open (or reuse) a thread with a teacher' })
  openThread(
    @Body(new ZodValidationPipe(openThreadBody)) body: z.infer<typeof openThreadBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messaging.openThread({ ...body, actorId: user.id, actorRole: 'GUARDIAN' });
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
      role: 'GUARDIAN',
      limit: query.limit,
    });
  }

  @ZodBody(postMessageBody)
  @Post('threads/:id/messages')
  @Audit({ action: 'par.message.post', targetType: 'message' })
  @ApiOperation({ summary: 'Send a message' })
  postMessage(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(postMessageBody)) body: z.infer<typeof postMessageBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messaging.postMessage({
      threadId: id,
      senderId: user.id,
      body: body.body,
      senderRole: 'GUARDIAN',
    });
  }
}
