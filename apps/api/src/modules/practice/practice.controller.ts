import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { MistakeType, PracticeAssignmentStatus, PracticeBoard, PracticeMode } from '@prisma/client';
import { z } from 'zod';

import { CurrentUser, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PracticeService } from './practice.service';
import { ProfileCompleteGuard } from '../teachers/profile-complete.guard';

const toReviewQuery = z.object({
  status: z.enum(['waiting', 'reviewed', 'all']).default('waiting'),
});

const assignBody = z.object({
  studentId: z.string().uuid(),
  // A surah/ayah range, or a board item (a dua chapter / dua, a Qaida lesson): exactly one,
  // checked by the service.
  fromSurah: z.number().int().min(1).max(114).nullish(),
  fromAyah: z.number().int().min(1).max(286).nullish(),
  toSurah: z.number().int().min(1).max(114).nullish(),
  toAyah: z.number().int().min(1).max(286).nullish(),
  board: z.nativeEnum(PracticeBoard).nullish(),
  boardLesson: z.number().int().min(1).max(500).nullish(),
  boardItem: z.number().int().min(0).max(500).nullish(),
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

const reviewBody = z.object({
  feedback: z.string().max(1000).optional(),
  mistakes: z
    .array(
      z.union([
        z.object({
          surah: z.number().int().min(1).max(114),
          ayah: z.number().int().min(1).max(286),
          wordIndex: z.number().int().min(0).max(500),
          type: z.nativeEnum(MistakeType),
        }),
        // Board practice: the dua word or Qaida item, named as the classroom logger names it.
        z.object({
          itemRef: z.string().trim().min(1).max(160),
          type: z.nativeEnum(MistakeType),
        }),
      ]),
    )
    .max(200)
    .optional(),
});

const STUDENT_SIDE = [Role.STUDENT, Role.CHILD_STUDENT, Role.GUARDIAN] as const;
const REVIEWERS = [Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN] as const;

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
  @UseGuards(ProfileCompleteGuard)
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

  @Get('practice-assignments/:id/reference-audio')
  @Roles(Role.TEACHER, ...STUDENT_SIDE, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reference recitation for each ayah of the passage (FR-AIC-04)' })
  referenceAudio(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.practice.referenceAudio({ userId: user.id, roles: user.roles }, id);
  }

  @Get('practice-assignments/:id/recording-allowed')
  @Roles(Role.TEACHER, ...STUDENT_SIDE, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Whether a guardian allows practice recordings for this student' })
  recordingAllowed(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.practice.recordingAllowed({ userId: user.id, roles: user.roles }, id);
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

  // Declared before `practice-sessions/:id` so the literal path is not read as an id.
  @Get('practice-sessions/to-review')
  @Roles(...REVIEWERS)
  @ZodQuery(toReviewQuery)
  @ApiOperation({
    summary:
      'Practice sessions of the last 30 days: waiting for the teacher (default), reviewed, or all',
  })
  toReview(
    @Query(new ZodValidationPipe(toReviewQuery)) query: z.infer<typeof toReviewQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.toReview({ userId: user.id, roles: user.roles }, query.status);
  }

  @Get('practice-sessions/:id')
  @Roles(Role.TEACHER, ...STUDENT_SIDE, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'One practice session with its assignment' })
  session(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.practice.session({ userId: user.id, roles: user.roles }, id);
  }

  @Post('practice-sessions/:id/review')
  @Roles(...REVIEWERS)
  @ZodBody(reviewBody)
  @ApiOperation({ summary: 'Teacher feedback and marked words on a practice session' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewBody)) body: z.infer<typeof reviewBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.practice.review({ userId: user.id, roles: user.roles }, id, body);
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
