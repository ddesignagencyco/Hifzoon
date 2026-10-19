import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CourseType, EnrolmentStatus, Role } from '@hifzoon/shared';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { CoursesService } from './courses.service';

export class CreateCourseDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsEnum(CourseType) type!: CourseType;
  @IsString() description!: string;
  @IsOptional() @IsString() @MaxLength(5) locale?: string;
}

export class CreateLevelDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsInt() @Min(0) passMark?: number;
  @IsOptional() @IsObject() rubric?: Record<string, unknown>;
}

export class CreateLessonDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsArray() objectives?: unknown;
  @IsOptional() @IsObject() materials?: Record<string, unknown>;
  @IsOptional() @IsString() teacherNotes?: string;
}

export class CreateEnrolmentDto {
  @IsString() studentId!: string;
  @IsString() courseId!: string;
  @IsOptional() @IsString() teacherId?: string;
  @IsOptional() @IsEnum(EnrolmentStatus) status?: EnrolmentStatus;
}

export class UpdateEnrolmentStatusDto {
  @IsEnum(EnrolmentStatus) status!: EnrolmentStatus;
  @IsOptional() pausedUntil?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Public course catalogue with levels and lessons (FR-ADM-01, FR-CRS-01)',
  })
  @ApiQuery({ name: 'locale', required: false, example: 'en' })
  catalogue(@Query('locale') locale?: string) {
    return this.courses.catalogue(locale ?? 'en');
  }

  @Public()
  @Get(':codeOrId')
  @ApiOperation({ summary: 'One course with its full level and lesson plan' })
  find(@Param('codeOrId') codeOrId: string) {
    return this.courses.findCourse(codeOrId);
  }

  // ── Enrolments (FR-CRS-02) ────────────────────────────────────────────────

  @Post('enrolments')
  @ApiBearerAuth()
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Enrol a student in a course (FR-CRS-02)',
    description: 'One live enrolment per student per course; a second returns 409 CONFLICT.',
  })
  createEnrolment(@Body() dto: CreateEnrolmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.courses.createEnrolment({ ...dto, actorUserId: user.id, actorRoles: user.roles });
  }

  @Get('enrolments/list')
  @ApiBearerAuth()
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.STUDENT, Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @ApiOperation({
    summary: 'Enrolments, optionally filtered by student or teacher (FR-CRS-02)',
    description:
      "Scoped to the caller: a guardian sees their own family's students, a teacher " +
      'their own students, staff see everything (NFR-SEC-02).',
  })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'teacherUserId', required: false })
  listEnrolments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('studentId') studentId?: string,
    @Query('teacherUserId') teacherUserId?: string,
    @Query('status') status?: EnrolmentStatus,
  ) {
    return this.courses.listEnrolments({
      studentId,
      teacherUserId,
      status,
      actorUserId: user.id,
      actorRoles: user.roles,
    });
  }

  @Get('enrolments/:enrolmentId/next-lesson')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Next lesson for any teacher, including a substitute (FR-CRS-02)',
    description:
      'Scoped to the enrolment rather than the teacher, so a substitute with no ' +
      'enrolment of their own still sees the right plan.',
  })
  nextLesson(@Param('enrolmentId') enrolmentId: string) {
    return this.courses.nextLesson({ enrolmentId });
  }

  @Patch('enrolments/:enrolmentId/lesson-position')
  @ApiBearerAuth()
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance the lesson plan pointer' })
  advanceLesson(
    @Param('enrolmentId') enrolmentId: string,
    @Body() body: { position: number },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.advanceLesson({
      enrolmentId,
      position: body.position,
      actorUserId: user.id,
      actorRoles: user.roles,
    });
  }

  @Patch('enrolments/:enrolmentId/status')
  @ApiBearerAuth()
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause, cancel or complete an enrolment (FR-PAR-05)',
    description: 'Pausing or cancelling withdraws future scheduled sessions from the calendar.',
  })
  updateStatus(
    @Param('enrolmentId') enrolmentId: string,
    @Body() dto: UpdateEnrolmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.updateEnrolmentStatus({
      enrolmentId,
      status: dto.status,
      pausedUntil: dto.pausedUntil ? new Date(dto.pausedUntil) : undefined,
      reason: dto.reason,
      actorUserId: user.id,
      actorRoles: user.roles,
    });
  }

  // ── Admin course builder (FR-CRS-01) ──────────────────────────────────────

  @Post()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a course (FR-CRS-01)' })
  create(@Body() dto: CreateCourseDto) {
    return this.courses.createCourse(dto);
  }

  @Post(':courseId/levels')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a level to a course (FR-CRS-01)' })
  createLevel(@Param('courseId') courseId: string, @Body() dto: CreateLevelDto) {
    return this.courses.createLevel({ courseId, ...dto });
  }

  @Post('levels/:levelId/lessons')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a lesson to a level (FR-CRS-01)' })
  createLesson(@Param('levelId') levelId: string, @Body() dto: CreateLessonDto) {
    return this.courses.createLesson({ levelId, ...dto });
  }
}
