import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, Public, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CasesService } from './cases.service';
import { QaService, RatingsService } from './qa.service';

const rateBody = z.object({
  stars: z.number().int().min(1).max(5),
  studentId: z.string().uuid().optional(),
  lessonCardId: z.string().uuid().optional(),
  comment: z.string().max(2000).optional(),
});

const reviewBody = z.object({
  rubricId: z.string().uuid().optional(),
  scores: z.record(z.string(), z.number().min(0).max(5)),
  feedback: z.string().max(4000).optional(),
  source: z.enum(['RANDOM_SAMPLE', 'MANUAL']).optional(),
});

const replyBody = z.object({ teacherReply: z.string().min(1).max(4000) });

const openCaseBody = z.object({
  type: z.enum(['COMPLAINT', 'SAFEGUARDING']),
  summary: z.string().min(10).max(8000),
  subjectUserId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  slaMinutes: z.number().int().min(1).max(604800).optional(),
});

const reportBody = z.object({
  type: z.enum(['COMPLAINT', 'SAFEGUARDING']),
  description: z.string().min(10).max(8000),
  classId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  subjectUserId: z.string().uuid().optional(),
});

const noteBody = z.object({ note: z.string().min(1).max(8000) });

const transitionBody = z.object({ status: z.enum(['INVESTIGATING', 'ACTIONED', 'CLOSED']) });

const assignBody = z.object({ ownerId: z.string().uuid() });

const listCasesQuery = z.object({
  type: z.enum(['COMPLAINT', 'SAFEGUARDING']).optional(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'ACTIONED', 'CLOSED']).optional(),
  overdueOnly: z.coerce.boolean().optional(),
});

const scorecardQuery = z.object({ months: z.coerce.number().int().min(1).max(24).default(3) });

/**
 * Family class ratings (FR-QA-01, FR-QA-02). Guardian-only.
 */
@ApiTags('quality')
@ApiBearerAuth()
@Controller('quality')
export class QualityRatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @ZodBody(rateBody)
  @Roles(Role.GUARDIAN)
  @Post('classes/:classId/rating')
  @Audit({ action: 'qa.class.rate', targetType: 'class_review' })
  @ApiOperation({ summary: 'Rate a class you attended' })
  rate(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(rateBody)) body: z.infer<typeof rateBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ratings.rate({ classId, familyUserId: user.id, ...body });
  }

  @Public()
  @Get('teachers/:teacherId/rating')
  @ApiOperation({ summary: 'Public rating summary for a teacher' })
  teacherRating(@Param('teacherId') teacherId: string) {
    return this.ratings.teacherSummary(teacherId);
  }
}

/**
 * Quality assurance reviews (FR-QA-03, FR-QA-04).
 *
 * `SUPERVISOR` only. An examiner may take an assessment but does not review lessons —
 * that is a deliberate separation, because the person assessing a child's attainment
 * should not also be the one quality-assuring the teaching that produced it.
 */
@ApiTags('quality')
@ApiBearerAuth()
@Controller('qa')
@Roles(Role.SUPERVISOR, Role.SUPER_ADMIN)
export class QaController {
  constructor(private readonly qa: QaService) {}

  @ZodBody(reviewBody)
  @ZodBody(reviewBody)
  @Post('classes/:classId/review')
  @Audit({ action: 'qa.review.submit', targetType: 'qa_review' })
  @ApiOperation({ summary: 'Submit a rubric review for a class' })
  submitReview(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(reviewBody)) body: z.infer<typeof reviewBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qa.submitReview({ classId, supervisorId: user.id, ...body });
  }

  @ZodBody(replyBody)
  @ZodBody(replyBody)
  @Post('reviews/:id/reply')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'qa.review.reply', targetType: 'qa_review' })
  @ApiOperation({ summary: 'Reply to a QA review of your class' })
  reply(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replyBody)) body: z.infer<typeof replyBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.qa.reply(id, user.id, body.teacherReply);
  }

  @Post('teachers/:teacherId/sample')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Draw this month QA sample for a teacher' })
  sample(@Param('teacherId') teacherId: string) {
    return this.qa.sampleForPeriod(teacherId);
  }

  @ZodQuery(scorecardQuery)
  @ZodQuery(scorecardQuery)
  @Get('teachers/:teacherId/scorecard')
  @Roles(Role.SUPERVISOR, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Teacher QA scorecard' })
  scorecard(
    @Param('teacherId') teacherId: string,
    @Query(new ZodValidationPipe(scorecardQuery)) query: z.infer<typeof scorecardQuery>,
  ) {
    return this.qa.teacherScorecard(teacherId, query.months);
  }
}

/**
 * Complaints and safeguarding (FR-QA-05).
 *
 * Note the absence of `ADMIN` from every method. Routine administration has no
 * legitimate need to read an allegation about a named child or teacher, and granting
 * it "just for support" is how this data ends up being browsed.
 */
@ApiTags('safeguarding')
@ApiBearerAuth()
@Controller('cases')
@Roles(Role.SAFEGUARDING_LEAD, Role.SUPERVISOR, Role.SUPER_ADMIN)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @ZodBody(openCaseBody)
  @ZodBody(openCaseBody)
  @Post()
  @Audit({ action: 'qa.case.open', targetType: 'case_record' })
  @ApiOperation({ summary: 'Open a complaint or safeguarding case' })
  open(
    @Body(new ZodValidationPipe(openCaseBody)) body: z.infer<typeof openCaseBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.open({ ...body, openedById: user.id });
  }

  @ZodQuery(listCasesQuery)
  @ZodQuery(listCasesQuery)
  @Get()
  @ApiOperation({ summary: 'List cases' })
  list(@Query(new ZodValidationPipe(listCasesQuery)) query: z.infer<typeof listCasesQuery>) {
    return this.cases.list(query);
  }

  @ZodBody(reportBody)
  @Post('report')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.STUDENT, Role.CHILD_STUDENT)
  // A report pages the safeguarding lead, so it is rate limited per caller.
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Audit({ action: 'qa.case.report', targetType: 'case_record' })
  @ApiOperation({
    summary: 'Report a concern (M56, CR-08)',
    description:
      'For a guardian, teacher or student. Opens a case and pages the safeguarding lead. ' +
      'Returns only a reference and the time it was received.',
  })
  report(
    @Body(new ZodValidationPipe(reportBody)) body: z.infer<typeof reportBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.report({ ...body, reporterId: user.id });
  }

  // Declared before `:id` so "mine" is not read as a case id.
  @Get('mine')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.STUDENT, Role.CHILD_STUDENT)
  @ApiOperation({ summary: 'My reports: reference and status only (M56)' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.cases.mine(user.id);
  }

  @Get('sla')
  @Roles(Role.SAFEGUARDING_LEAD, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'SLA report: what is open and what is overdue' })
  sla() {
    return this.cases.slaReport();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a case (audited)' })
  read(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.read(id, user.id);
  }

  @ZodBody(noteBody)
  @ZodBody(noteBody)
  @Post(':id/notes')
  @Audit({ action: 'qa.case.note', targetType: 'case_record' })
  @ApiOperation({ summary: 'Append a note (append-only)' })
  addNote(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(noteBody)) body: z.infer<typeof noteBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.addNote(id, user.id, body.note);
  }

  @ZodBody(transitionBody)
  @ZodBody(transitionBody)
  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'qa.case.transition', targetType: 'case_record' })
  @ApiOperation({ summary: 'Advance or close a case' })
  transition(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionBody)) body: z.infer<typeof transitionBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.transition(id, body.status, user.id);
  }

  @ZodBody(assignBody)
  @ZodBody(assignBody)
  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'qa.case.assign', targetType: 'case_record' })
  @ApiOperation({ summary: 'Assign a case owner' })
  assign(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignBody)) body: z.infer<typeof assignBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.assign(id, body.ownerId, user.id);
  }
}
