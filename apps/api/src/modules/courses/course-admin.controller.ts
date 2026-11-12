import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AssessmentType, Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AssessmentsService } from './assessments.service';
import { CourseAdminService } from './course-admin.service';
import { CourseMaterialsService } from './course-materials.service';

const updateCourseBody = z
  .object({
    name: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    locale: z.string().min(2).max(5).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change' });
const activeBody = z.object({ active: z.boolean() });

const presignBody = z.object({
  contentType: z.string().min(3).max(100),
  size: z
    .number()
    .int()
    .min(1)
    .max(30 * 1024 * 1024),
});
const attachBody = z.object({
  key: z.string().min(10).max(512),
  name: z.string().trim().min(1).max(160),
  contentType: z.string().min(3).max(100),
  size: z
    .number()
    .int()
    .min(1)
    .max(30 * 1024 * 1024),
});

const assignExamBody = z.object({
  examinerId: z.string().uuid(),
  type: z.nativeEnum(AssessmentType),
  scheduledFor: z.coerce.date().optional(),
});
const reassignExamBody = z
  .object({
    examinerId: z.string().uuid().optional(),
    scheduledFor: z.coerce.date().nullable().optional(),
  })
  .refine((b) => b.examinerId !== undefined || b.scheduledFor !== undefined, {
    message: 'Nothing to change',
  });
const examResultBody = z.object({
  rubricScores: z.record(z.string(), z.number()),
  notes: z.string().max(4000).optional(),
});

/**
 * Course lifecycle, lesson file uploads and milestone exams (FR-CRS-01, FR-CRS-03).
 * Course building itself (create, levels, lessons) lives in `CoursesController` and
 * `CurriculumController`.
 */
@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
export class CourseAdminController {
  constructor(
    private readonly courses: CourseAdminService,
    private readonly materials: CourseMaterialsService,
    private readonly assessments: AssessmentsService,
  ) {}

  // ── Course lifecycle ──────────────────────────────────────────────────────

  @Get('admin/list')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Every course for the builder, including switched-off and archived' })
  @ApiQuery({ name: 'includeArchived', required: false })
  list(@Query('includeArchived') includeArchived?: string) {
    return this.courses.list({ includeArchived: includeArchived === 'true' });
  }

  @ZodBody(updateCourseBody)
  @Patch(':courseId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.course.update', targetType: 'course', captureBody: false })
  @ApiOperation({ summary: 'Edit a course’s name, description or language' })
  update(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body(new ZodValidationPipe(updateCourseBody)) body: z.infer<typeof updateCourseBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.update(courseId, body, user.id);
  }

  @ZodBody(activeBody)
  @Post(':courseId/active')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.course.active', targetType: 'course', captureBody: false })
  @ApiOperation({ summary: 'Switch a course on or off (off hides it from new enrolments)' })
  setActive(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body(new ZodValidationPipe(activeBody)) body: z.infer<typeof activeBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.setActive(courseId, body.active, user.id);
  }

  @Post(':courseId/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.course.archive', targetType: 'course', captureBody: false })
  @ApiOperation({ summary: 'Archive a course nobody is enrolled on' })
  archive(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.archive(courseId, user.id);
  }

  @Post(':courseId/restore')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.course.restore', targetType: 'course', captureBody: false })
  @ApiOperation({ summary: 'Bring an archived course back (switched off)' })
  restore(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.restore(courseId, user.id);
  }

  // ── Lesson files ──────────────────────────────────────────────────────────

  @ZodBody(presignBody)
  @Post('lessons/:lessonId/materials/presign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Get a signed upload for a lesson file',
    description:
      'PDF or image up to 20/10 MB, audio up to 25 MB. Then confirm with POST …/materials.',
  })
  presign(
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body(new ZodValidationPipe(presignBody)) body: z.infer<typeof presignBody>,
  ) {
    return this.materials.presign(lessonId, body);
  }

  @ZodBody(attachBody)
  @Post('lessons/:lessonId/materials')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.material.attach', targetType: 'lesson_template', captureBody: false })
  @ApiOperation({ summary: 'Attach an uploaded file to a lesson' })
  attach(
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body(new ZodValidationPipe(attachBody)) body: z.infer<typeof attachBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materials.attach(lessonId, body, user.id);
  }

  @Delete('lessons/:lessonId/materials/:fileId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.material.remove', targetType: 'lesson_template', captureBody: false })
  @ApiOperation({ summary: 'Remove a lesson file' })
  removeFile(
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.materials.remove(lessonId, fileId, user.id);
  }

  @Get('lessons/:lessonId/materials/:fileId/url')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.TEACHER, Role.SUPERVISOR)
  @ApiOperation({ summary: 'A short-lived link to read a lesson file' })
  fileUrl(
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.materials.downloadUrl(lessonId, fileId);
  }

  // ── Milestone exams ───────────────────────────────────────────────────────

  @ZodBody(assignExamBody)
  @Post('enrolments/:enrolmentId/exams')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.assessment.assign', targetType: 'assessment', captureBody: false })
  @ApiOperation({
    summary: 'Assign a milestone, ijazah or level exam to an examiner',
    description: 'Created pending at the child’s current level; the examiner records the result.',
  })
  assignExam(
    @Param('enrolmentId', new ParseUUIDPipe()) enrolmentId: string,
    @Body(new ZodValidationPipe(assignExamBody)) body: z.infer<typeof assignExamBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.assign({ enrolmentId, ...body }, user.id);
  }

  @Get('exams/mine')
  @Roles(Role.EXAMINER)
  @ApiOperation({ summary: 'Exams assigned to you that still need a result, with the rubric' })
  myExams(@CurrentUser() user: AuthenticatedUser) {
    return this.assessments.assignedTo(user.id);
  }

  @ZodBody(reassignExamBody)
  @Patch('exams/:assessmentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.assessment.reassign', targetType: 'assessment', captureBody: false })
  @ApiOperation({ summary: 'Change the examiner or planned date of an exam not yet taken' })
  reassignExam(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body(new ZodValidationPipe(reassignExamBody)) body: z.infer<typeof reassignExamBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.reassign(assessmentId, body, user.id);
  }

  @Delete('exams/:assessmentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.assessment.cancel', targetType: 'assessment', captureBody: false })
  @ApiOperation({ summary: 'Withdraw an exam that has not been taken' })
  cancelExam(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.cancelAssigned(assessmentId, user.id);
  }

  @ZodBody(examResultBody)
  @Post('exams/:assessmentId/result')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.EXAMINER, Role.SUPER_ADMIN)
  @Audit({ action: 'crs.assessment.record', targetType: 'assessment', captureBody: false })
  @ApiOperation({
    summary: 'Record the result of an exam assigned to you',
    description:
      'Scores per rubric criterion (0–100); the server computes the total and PASS/FAIL.',
  })
  recordExam(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body(new ZodValidationPipe(examResultBody)) body: z.infer<typeof examResultBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assessments.recordAssigned(assessmentId, body, user.id, user.roles);
  }
}
