import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApplicationDocumentType, Role, TeacherHiringStatus } from '@hifzoon/shared';
import {
  Allow,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { TeachersService } from './teachers.service';

export class SubmitApplicationDto {
  @IsString() @MinLength(2) @MaxLength(160) applicantName!: string;
  @IsString() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(2) country?: string;
  @IsOptional() @Allow() qualifications?: unknown;
  @IsOptional() @IsString() @MaxLength(512) recitationAudioKey?: string;

  // B17 — `documents` is a map of document kind to storage key. The keys were never
  // validated, so an unknown one reached Prisma as an invalid enum value and surfaced as
  // a 500 on a public, unauthenticated endpoint. The shape is stated here rather than
  // inferred, so the contract and the whitelist cannot drift apart.
  @IsOptional()
  @IsObject()
  documents?: Partial<Record<ApplicationDocumentType, string>> & Record<string, unknown>;
}

export class RecordStepDto {
  @IsEnum(TeacherHiringStatus) step!: TeacherHiringStatus;
  @IsEnum(['PASSED', 'FAILED', 'PENDING']) status!: 'PASSED' | 'FAILED' | 'PENDING';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class ProfileChangeDto {
  @IsObject() changes!: Record<string, unknown>;
}

export class ReviewProfileChangeDto {
  @IsBoolean() approve!: boolean;
  /** Shown to the teacher when a change is rejected (M57). */
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class SafeguardingTrainingDto {
  @IsDateString() completedAt!: string;
}

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  // ── Public (FR-ADM-01, FR-TCH-01) ─────────────────────────────────────────

  @Public()
  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Apply to teach (FR-TCH-01)',
    description:
      'No account required. Creates the full hiring pipeline for the board to work through.',
  })
  apply(@Body() dto: SubmitApplicationDto) {
    const documents = dto.documents ?? {};
    const unknown = Object.keys(documents).filter(
      (key) => !Object.values(ApplicationDocumentType).includes(key as ApplicationDocumentType),
    );
    if (unknown.length > 0) {
      // A 400 naming the offender, rather than a 500 from the database on a public route.
      throw AppError.badRequest(`Unknown document type(s): ${unknown.join(', ')}`, {
        allowed: Object.values(ApplicationDocumentType),
      });
    }

    return this.teachers.submitApplication({
      applicantName: dto.applicantName,
      email: dto.email,
      phone: dto.phone,
      country: dto.country,
      qualifications: dto.qualifications,
      recitationAudioKey: dto.recitationAudioKey,
      documentKeys: documents as Partial<Record<ApplicationDocumentType, string>>,
    });
  }

  @Public()
  @Get('public')
  @ApiOperation({ summary: 'Approved teacher profiles for the website (FR-ADM-01)' })
  @ApiQuery({ name: 'subject', required: false, example: 'HIFZ' })
  @ApiQuery({ name: 'language', required: false, example: 'ur' })
  listPublic(@Query('subject') subject?: string, @Query('language') language?: string) {
    return this.teachers.listPublicProfiles({ subject, language });
  }

  @Get('me')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @ApiOperation({
    summary: 'Your own teacher profile (M1)',
    description:
      'The public profile route 404s until a teacher is APPROVED and ready to match, so a ' +
      'newly hired teacher had no way to learn their own profile id — and could not set ' +
      'availability or a timetable without it. This route answers before any approval.',
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.ownProfile(user.id);
  }

  @Public()
  @Get('public/:userId')
  @ApiOperation({
    summary: 'One teacher profile (FR-ADM-01)',
    description: 'Contact details are never included (CR-07).',
  })
  publicProfile(@Param('userId') userId: string) {
    return this.teachers.publicProfile(userId);
  }

  // ── Hiring pipeline (FR-TCH-01, FR-TCH-02) ────────────────────────────────

  @Get('applications/list')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Hiring pipeline board (FR-TCH-01)' })
  listApplications(
    @Query('status', new ParseEnumPipe(TeacherHiringStatus, { optional: true }))
    status?: TeacherHiringStatus,
  ) {
    return this.teachers.listApplications({ status });
  }

  @Get('applications/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: 'One application with its steps and documents (FR-TCH-01)' })
  application(@Param('id') id: string) {
    return this.teachers.getApplication(id);
  }

  @Post('applications/:id/steps')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record a hiring step outcome (FR-TCH-01)',
    description:
      'A step cannot be skipped, and approving with steps outstanding is refused with 409. ' +
      'Safeguarding training must be complete before a teacher becomes matchable (FR-TCH-02, CR-09).',
  })
  recordStep(
    @Param('id') id: string,
    @Body() dto: RecordStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachers.recordStep({ applicationId: id, ...dto, reviewerUserId: user.id });
  }

  @Post('profiles/:profileId/safeguarding-training')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record safeguarding training completion (CR-09)',
    description: 'The last gate before a teacher can be matched to a child (FR-TCH-02).',
  })
  recordTraining(@Param('profileId') profileId: string, @Body() dto: SafeguardingTrainingDto) {
    return this.teachers.recordSafeguardingTraining(profileId, new Date(dto.completedAt));
  }

  // ── Profile self-service and review (FR-TCH-05) ───────────────────────────

  @Patch('me/profile')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Propose changes to your own profile (FR-TCH-05)',
    description: 'Changes are staged for admin approval, not applied directly.',
  })
  requestChange(@Body() dto: ProfileChangeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.teachers.requestProfileChange({ userId: user.id, changes: dto.changes });
  }

  @Delete('me/profile/pending')
  @ApiBearerAuth()
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw your own staged profile change (M57)',
    description: 'Clears the change waiting for approval; the review outcome becomes WITHDRAWN.',
  })
  withdrawChange(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.withdrawProfileChange(user.id);
  }

  @Get('profile-changes')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Teachers with a profile change waiting for approval (M54)',
    description:
      'Each row has the staged values and the current values of the same fields, for a ' +
      'before/after view.',
  })
  pendingProfileChanges() {
    return this.teachers.listPendingProfileChanges();
  }

  @Post('profiles/:profileId/review')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve or reject a staged profile change (FR-TCH-05)',
    description: 'Only an allow-list of fields is ever applied.',
  })
  reviewChange(
    @Param('profileId') profileId: string,
    @Body() dto: ReviewProfileChangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teachers.reviewProfileChange({
      profileId,
      approve: dto.approve,
      reviewerUserId: user.id,
      reason: dto.reason,
    });
  }

  // ── Pre-class brief (FR-TCH-04) ───────────────────────────────────────────

  @Get('me/classes/:classId/brief')
  @ApiBearerAuth()
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Pre-class brief (FR-TCH-04)',
    description:
      'Last lesson card, current level and lesson position, and the mistakes that keep ' +
      'repeating over the last 30 days — in one call, because a teacher opening the ' +
      'room on a phone should not need five requests.',
  })
  brief(@Param('classId') classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.teachers.preClassBrief({ teacherUserId: user.id, classId });
  }
}
