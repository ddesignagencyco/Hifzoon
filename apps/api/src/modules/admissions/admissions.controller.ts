import {
  Body,
  Controller,
  Delete,
  Get,
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
  status: z.enum(['OPEN', 'APPROVED', 'DECLINED', 'CANCELLED']).optional(),
});

const editorialQuery = z.object({
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

  @ZodBody(trialOutcomeBody)
  @Post('trials/:classId/outcome')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'adm.trial.outcome', targetType: 'trial_outcome' })
  @ApiOperation({ summary: 'Record the trial outcome and mint the subscribe link' })
  completeOutcome(
    @Param('classId') classId: string,
    @Body(new ZodValidationPipe(trialOutcomeBody)) body: z.infer<typeof trialOutcomeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.completeTrialOutcome({ classId, ...body, actorId: user.id });
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
  listTeacherChanges(
    @Query(new ZodValidationPipe(teacherChangeQuery)) query: z.infer<typeof teacherChangeQuery>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.listTeacherChanges(query.status, {
      userId: user.id,
      roles: user.roles,
    });
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
  @ApiOperation({ summary: 'Suggest an FAQ entry for moderation' })
  submitFaq(@Body(new ZodValidationPipe(faqSubmitBody)) body: z.infer<typeof faqSubmitBody>) {
    return this.cms.submitFaq(body);
  }

  // ── Editorial (FR-ADM-06, FR-ADM-07) ──────────────────────────────────────

  @ZodQuery(editorialQuery)
  @Get('content-admin')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editorial list including drafts' })
  listAll(@Query(new ZodValidationPipe(editorialQuery)) query: z.infer<typeof editorialQuery>) {
    return this.cms.listAll(query);
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
