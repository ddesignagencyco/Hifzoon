import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { PracticeAssignmentStatus, PracticeMode } from '@prisma/client';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracticeService } from './practice.service';

const assignBody = z.object({
  studentId: z.string().uuid(),
  fromSurah: z.number().int().min(1).max(114),
  fromAyah: z.number().int().min(1).max(286),
  toSurah: z.number().int().min(1).max(114),
  toAyah: z.number().int().min(1).max(286),
  mode: z.nativeEnum(PracticeMode),
  targetMinutes: z.number().int().min(5).max(600),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const listQuery = z.object({
  studentId: z.string().uuid().optional(),
  status: z.nativeEnum(PracticeAssignmentStatus).optional(),
});

const uploadBody = z.object({
  assignmentId: z.string().uuid(),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
});

const sessionBody = z.object({
  assignmentId: z.string().uuid(),
  minutes: z.number().int().min(1).max(180),
  wordsRecited: z.number().int().min(0).max(100_000).optional(),
  revealsCount: z.number().int().min(0).max(100_000).optional(),
  audioKey: z.string().min(1).max(300).optional(),
});

const STUDENT_SIDE = [Role.STUDENT, Role.CHILD_STUDENT, Role.GUARDIAN] as const;

/**
 * Practice between classes (FR-AIC). Teachers assign; the student (or a guardian on a young
 * child's behalf) logs sessions; everyone who may see the student may read the progress.
 */
@ApiTags('practice')
@ApiBearerAuth()
@Controller()
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post('practice-assignments')
  @Roles(Role.TEACHER)
  @ZodBody(assignBody)
  @ApiOperation({ summary: 'Assign practice to a student you teach' })
  assign(
    @Body(new ZodValidationPipe(assignBody)) body: z.infer<typeof assignBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.assign({ userId: user.id, roles: user.roles }, body);
  }

  @Get('practice-assignments')
  @Roles(Role.TEACHER, ...STUDENT_SIDE, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ZodQuery(listQuery)
  @ApiOperation({ summary: 'Practice assignments with progress' })
  list(
    @Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.list({ userId: user.id, roles: user.roles }, query);
  }

  @Get('practice-assignments/:id/sessions')
  @Roles(Role.TEACHER, ...STUDENT_SIDE, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Sessions logged against an assignment' })
  sessions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.practice.sessions({ userId: user.id, roles: user.roles }, id);
  }

  @Post('practice-sessions/upload-url')
  @Roles(...STUDENT_SIDE)
  @ZodBody(uploadBody)
  @ApiOperation({ summary: 'Signed upload for a practice recording' })
  uploadUrl(
    @Body(new ZodValidationPipe(uploadBody)) body: z.infer<typeof uploadBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.uploadUrl({ userId: user.id, roles: user.roles }, body);
  }

  @Post('practice-sessions')
  @Roles(...STUDENT_SIDE)
  @ZodBody(sessionBody)
  @ApiOperation({ summary: 'Log a practice session' })
  logSession(
    @Body(new ZodValidationPipe(sessionBody)) body: z.infer<typeof sessionBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.logSession({ userId: user.id, roles: user.roles }, body);
  }
}
