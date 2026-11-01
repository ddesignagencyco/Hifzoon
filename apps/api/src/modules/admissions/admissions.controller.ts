import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, Public, type AuthenticatedUser, Roles } from '../../common/decorators';
import { ZodBody, ZodQuery } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { pageQueryShape } from '../../common/dto/page-query.schema';
import { paginated, toPagination } from '../../common/utils/pagination.util';
import { AppError } from '../../common/errors/app-error';
import { AdmissionsService } from './admissions.service';
import { CmsService } from './cms.service';

const localeSchema = z
  .string()
  .min(2)
  .max(5)
  .default('en')
  .describe('Locale code, e.g. en, ur, ar');

const publicListQuery = z.object({
  type: z.enum(['BLOG', 'PRINTABLE', 'LANDING']).optional(),
  locale: localeSchema,
  country: z.string().length(2).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const savePostBody = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['BLOG', 'PRINTABLE', 'LANDING']),
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase kebab-case'),
  locale: z.string().min(2).max(5),
  title: z.string().min(1).max(240),
  body: z.string().min(1),
  countryCode: z.string().length(2).optional(),
  city: z.string().max(120).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const bookTrialBody = z.object({
  studentId: z.string().uuid(),
  courseId: z.string().uuid(),
  startsAt: z.coerce.date(),
  teacherId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});

const trialOutcomeBody = z.object({
  won: z.boolean(),
  placementLevelId: z.string().uuid().optional(),
  recommendedPlanId: z.string().uuid().optional(),
  notes: z.string().max(4000).optional(),
  lostReason: z.string().max(2000).optional(),
});

const trialOutcomeEditBody = z
  .object({
    placementLevelId: z.string().uuid().nullable().optional(),
    recommendedPlanId: z.string().uuid().nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

const teacherChangeBody = z.object({
  familyId: z.string().uuid(),
  studentId: z.string().uuid(),
  reason: z.string().min(10).max(2000),
});

// B10 — the body was `{ status }` only, so a zod-strict route rejected the one field the
// operation actually needs: *which teacher the child moves to*. Approving a change
// without naming a successor resolved the request and left the child with no teacher.
const resolveChangeBody = z
  .object({
    status: z.enum(['APPROVED', 'DECLINED', 'CANCELLED']),
    newTeacherId: z.string().uuid().optional(),
    /** M58 — shown to the family with the decision. */
    resolutionNote: z.string().trim().max(2000).optional(),
  })
  .refine((body) => body.status !== 'APPROVED' || Boolean(body.newTeacherId), {
    message: 'newTeacherId is required to approve a teacher change',
    path: ['newTeacherId'],
  });

const faqSubmitBody = z.object({
  locale: z.string().min(2).max(5).default('en'),
  question: z.string().min(5).max(2000),
  answer: z.string().max(4000).optional(),
});

const moderateFaqBody = z.object({ approved: z.boolean() });

const teacherChangeQuery = z.object({
  ...pageQueryShape,
  status: z.enum(['OPEN', 'APPROVED', 'DECLINED', 'CANCELLED']).optional(),
});

const editorialQuery = z.object({
  ...pageQueryShape,
  type: z.enum(['BLOG', 'PRINTABLE', 'LANDING']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  locale: z.string().min(2).max(5).optional(),
});

/**
 * Admissions and marketing content (FR-ADM-03..08).
 *
 * The public half (`/content/*`, `/faq`) is `@Public()` because a parent looking for
 * enrolment terms must not have to register first. Everything that writes is
 * role-gated, and the trial/teacher-change paths additionally check ownership inside
 * the service — a role guard alone would let any guardian act on any student.
 */
@ApiTags('admissions')
@Controller()
export class AdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly cms: CmsService,
  ) {}

  // ── Trials (FR-ADM-03, FR-ADM-04) ────────────────────────────────────────

  @ZodBody(bookTrialBody)
  @Post('trials')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.trial.book', targetType: 'class_session' })
  @ApiOperation({ summary: 'Book a trial class' })
  bookTrial(
    @Body(new ZodValidationPipe(bookTrialBody)) body: z.infer<typeof bookTrialBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.bookTrial({ ...body, actorId: user.id });
  }

  @Get('trials')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Trial classes with their saved result and CRM lead (default: 30 days back to 30 days ahead)',
  })
  listTrials(@Query('from') from?: string, @Query('to') to?: string) {
    const day = 86_400_000;
    const parse = (v: string | undefined, fallback: number) => {
      const d = v ? new Date(v) : new Date(fallback);
      if (Number.isNaN(d.getTime())) throw AppError.badRequest('from/to must be ISO dates');
      return d;
    };
    return this.admissions.listTrials({
      from: parse(from, Date.now() - 30 * day),
      to: parse(to, Date.now() + 30 * day),
    });
  }

  @ZodBody(trialOutcomeBody)
  @Post('trials/:classId/outcome')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.trial.outcome', targetType: 'trial_outcome' })
  @ApiOperation({
    summary: 'Record the trial outcome and mint the subscribe link',
    description: 'The trial’s own teacher (FR-ADM-05) or staff.',
  })
  completeOutcome(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(trialOutcomeBody)) body: z.infer<typeof trialOutcomeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.completeTrialOutcome({
      classId,
      ...body,
      actorId: user.id,
      actorRoles: user.roles,
    });
  }

  @Get('trials/:classId/outcome')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'The saved result of a trial, or null if none yet' })
  getOutcome(@Param('classId') classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admissions.getTrialOutcome(classId, user.id, user.roles);
  }

  @ZodBody(trialOutcomeEditBody)
  @Patch('trials/:classId/outcome')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.trial.outcome.edit', targetType: 'trial_outcome' })
  @ApiOperation({
    summary: 'Correct a saved trial result (level, plan, notes)',
    description: 'Allowed until the family has subscribed; the won/lost result itself is final.',
  })
  editOutcome(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(trialOutcomeEditBody)) body: z.infer<typeof trialOutcomeEditBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.editTrialOutcome({
      classId,
      ...body,
      actorId: user.id,
      actorRoles: user.roles,
    });
  }

  // ── Teacher changes (FR-ADM-05) ───────────────────────────────────────────

  @ZodBody(teacherChangeBody)
  @Post('teacher-changes')
  @Roles(Role.GUARDIAN)
  @Audit({ action: 'adm.teacherChange.request', targetType: 'teacher_change_request' })
  @ApiOperation({ summary: 'Request a different teacher' })
  requestTeacherChange(
    @Body(new ZodValidationPipe(teacherChangeBody)) body: z.infer<typeof teacherChangeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.requestTeacherChange({ ...body, actorId: user.id });
  }

  @ZodQuery(teacherChangeQuery)
  @Get('teacher-changes')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'List teacher change requests (M15)',
    description:
      "Staff see the whole operations queue. A guardian sees their own family's requests, " +
      'because the alternative is a portal that can raise one and then cannot show whether ' +
      'it was answered.',
  })
  async listTeacherChanges(
    @Query(new ZodValidationPipe(teacherChangeQuery)) query: z.infer<typeof teacherChangeQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const params = toPagination(query);
    const { items, total } = await this.admissions.listTeacherChanges(
      query.status,
      { userId: user.id, roles: user.roles },
      { skip: params.skip, take: params.take },
    );
    return paginated(items, params, total);
  }

  @ZodBody(resolveChangeBody)
  @Post('teacher-changes/:id/resolve')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'adm.teacherChange.resolve', targetType: 'teacher_change_request' })
  @ApiOperation({ summary: 'Resolve a teacher change request' })
  resolveChange(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resolveChangeBody)) body: z.infer<typeof resolveChangeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.resolveTeacherChange({ requestId: id, ...body, actorId: user.id });
  }

  @Post('teacher-changes/:id/cancel')
  @Roles(Role.GUARDIAN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'adm.teacherChange.cancelByFamily', targetType: 'teacher_change_request' })
  @ApiOperation({ summary: 'Withdraw your own open teacher-change request (M58)' })
  cancelChange(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.admissions.cancelOwnTeacherChange(id, user.id);
  }

  @Patch('courses/enrolments/:id/teacher')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'adm.enrolment.teacher', targetType: 'enrolment' })
  @ApiOperation({
    summary: 'Move an enrolment to another teacher, with its weekly times and future classes (M60)',
  })
  changeEnrolmentTeacher(
    @Param('id') id: string,
    @Body() body: { teacherId?: string; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (typeof body?.teacherId !== 'string') throw AppError.badRequest('teacherId is required');
    return this.admissions.changeEnrolmentTeacher({
      enrolmentId: id,
      teacherId: body.teacherId,
      note: typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : undefined,
      actorId: user.id,
    });
  }

  // ── Public CMS (FR-ADM-06, FR-ADM-08) ─────────────────────────────────────

  @Public()
  @ZodQuery(publicListQuery)
  @Get('content')
  @ApiOperation({ summary: 'Public blog posts, printables and landing pages' })
  listContent(
    @Query(new ZodValidationPipe(publicListQuery)) query: z.infer<typeof publicListQuery>,
  ) {
    return this.cms.listPublic(query);
  }

  @Public()
  @Get('content/:slug')
  @ApiOperation({ summary: 'Public page by slug' })
  getContent(@Param('slug') slug: string, @Query('locale') locale = 'en') {
    return this.cms.getPublic(slug, locale);
  }

  @Public()
  @Get('faq')
  @ApiOperation({ summary: 'Approved FAQ entries' })
  listFaq(@Query('locale') locale = 'en') {
    return this.cms.listFaq(locale);
  }

  @Public()
  @ZodBody(faqSubmitBody)
  @Post('faq')
  // M64 — public submissions are audited like their moderation, so spam can be traced.
  @Audit({ action: 'cms.faq.submit', targetType: 'faq_item' })
  @ApiOperation({ summary: 'Suggest an FAQ entry for moderation' })
  submitFaq(@Body(new ZodValidationPipe(faqSubmitBody)) body: z.infer<typeof faqSubmitBody>) {
    return this.cms.submitFaq(body);
  }

  // ── Editorial (FR-ADM-06, FR-ADM-07) ──────────────────────────────────────

  @ZodQuery(editorialQuery)
  @Get('content-admin')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editorial list including drafts' })
  async listAll(@Query(new ZodValidationPipe(editorialQuery)) query: z.infer<typeof editorialQuery>) {
    const params = toPagination(query);
    const { items, total } = await this.cms.listAll({
      type: query.type,
      status: query.status,
      locale: query.locale,
      skip: params.skip,
      take: params.take,
    });
    return paginated(items, params, total);
  }

  @ZodBody(savePostBody)
  @Post('content-admin')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.cms.save', targetType: 'cms_post' })
  @ApiOperation({ summary: 'Create or update a post' })
  savePost(
    @Body(new ZodValidationPipe(savePostBody)) body: z.infer<typeof savePostBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cms.save({ ...body, actorId: user.id });
  }

  @Delete('content-admin/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.cms.archive', targetType: 'cms_post' })
  @ApiOperation({ summary: 'Archive a post (soft delete)' })
  removePost(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cms.remove(id, user.id);
  }

  @ZodBody(moderateFaqBody)
  @Post('faq-admin/:id/moderate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'adm.faq.moderate', targetType: 'faq_item' })
  @ApiOperation({ summary: 'Approve or reject a suggested FAQ' })
  moderateFaq(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moderateFaqBody)) body: z.infer<typeof moderateFaqBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cms.moderateFaq({ id, ...body, actorId: user.id });
  }
}
