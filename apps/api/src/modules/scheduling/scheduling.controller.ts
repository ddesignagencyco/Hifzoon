import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import { SchedulingService } from './scheduling.service';

export class AvailabilitySlotDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/) endTime!: string;
}

export class SetAvailabilityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];

  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() effectiveTo?: string;
}

export class BookSlotDto {
  @IsString() teacherId!: string;
  @IsString() courseId!: string;
  @IsString() studentId!: string;
  @IsOptional() @IsString() enrolmentId?: string;
  @IsDateString() startsAt!: string;
  @IsInt() @Min(15) @Max(240) durationMinutes!: number;
  @IsIn(['ONE_TO_ONE', 'CIRCLE']) roomType!: 'ONE_TO_ONE' | 'CIRCLE';
  @IsIn(['TRIAL', 'REGULAR', 'CIRCLE', 'EXAM', 'MAKEUP']) type!:
    'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';
}

export class CancelClassDto {
  @IsIn(['FAMILY', 'TEACHER', 'ADMIN']) by!: 'FAMILY' | 'TEACHER' | 'ADMIN';
  @IsString() @MaxLength(500) reason!: string;
  @IsOptional() @IsInt() @Min(0) @Max(168) noticeHours?: number;
}

export class RescheduleDto {
  @IsDateString() newStartsAt!: string;
  @IsOptional() @IsInt() @Min(15) @Max(240) durationMinutes?: number;
}

export class CreateScheduleDto {
  @IsString() enrolmentId!: string;
  @IsString() teacherId!: string;
  @IsString() @MaxLength(255) rrule!: string;
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'localStartTime must be HH:mm' })
  localStartTime!: string;
  @IsString() @MaxLength(64) familyTimeZone!: string;
  @IsInt() @Min(5) @Max(480) durationMinutes!: number;
  @IsIn(['ONE_TO_ONE', 'CIRCLE']) roomType!: 'ONE_TO_ONE' | 'CIRCLE';
  @IsString() startsOn!: string;
  @IsOptional() @IsString() endsOn?: string;
}

@ApiTags('scheduling')
@Controller('scheduling')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  // ── Availability (FR-SCH-01) ──────────────────────────────────────────────

  @Put('teachers/:teacherId/availability')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: "Replace a teacher's weekly availability (FR-SCH-01)",
    description: "Times are `HH:mm` in the teacher's own IANA zone and are stored as UTC.",
  })
  setAvailability(
    @Param('teacherId') teacherId: string,
    @Body() dto: SetAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.setAvailability({
      teacherId,
      ...dto,
      actorUserId: user.id,
      actorRoles: user.roles,
    });
  }

  @Get('teachers/:teacherId/availability')
  @Roles(Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Weekly availability with the teacher's zone (FR-SCH-01)" })
  availability(
    @Param('teacherId') teacherId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.getAvailability(teacherId, {
      userId: user.id,
      roles: user.roles,
    });
  }

  // ── Open slots (FR-ADM-03, FR-SCH-03) ─────────────────────────────────────

  @Public()
  @Get('open-slots')
  @ApiOperation({
    summary: 'Search bookable slots (FR-ADM-03, SCH-BE-03)',
    description:
      "Times come back rendered in `visitorZone`, which is the visitor's detected zone. " +
      'Public on purpose: a family picks a trial slot before creating an account. ' +
      'Only teachers who have completed the hiring pipeline and safeguarding training are offered (FR-TCH-02).',
  })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'visitorZone', required: true, example: 'Europe/London' })
  @ApiQuery({ name: 'limit', required: false, description: 'Maximum slots to return (default 60)' })
  openSlots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('visitorZone') visitorZone: string,
    @Query('durationMinutes') durationMinutes?: string,
    @Query('courseId') courseId?: string,
    @Query('gender') gender?: string,
    @Query('language') language?: string,
    @Query('ageGroup') ageGroup?: string,
    @Query('limit') limit?: string,
  ) {
    return this.scheduling.findOpenSlots({
      from: new Date(from),
      to: new Date(to),
      visitorZone,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      courseId,
      gender: gender as 'MALE' | 'FEMALE' | undefined,
      language,
      ageGroup,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ── Booking (FR-ADM-03) ───────────────────────────────────────────────────

  @Post('book')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book a trial or regular class (FR-ADM-03)',
    description:
      'Requires DATA_COLLECTION consent for the student (CR-01) and returns 409 DOUBLE_BOOKED ' +
      'if the teacher or student is already booked (FR-SCH-07).',
  })
  book(@Body() dto: BookSlotDto, @CurrentUser() user: AuthenticatedUser) {
    return this.scheduling.bookSlot({
      ...dto,
      startsAt: new Date(dto.startsAt),
      actorUserId: user.id,
      actorRoles: user.roles,
    });
  }

  // ── Cancellation and rescheduling (FR-SCH-04) ─────────────────────────────

  @Post('classes/:classId/cancel')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a class (FR-SCH-04)',
    description:
      'Inside the notice window (4 hours by default) a family cancellation is charged and a ' +
      'teacher or admin cancellation creates a make-up credit.',
  })
  cancel(
    @Param('classId') classId: string,
    @Body() dto: CancelClassDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.cancelSession({
      classId,
      ...dto,
      actorUserId: user.id,
      roles: user.roles,
    });
  }

  @Post('classes/:classId/reschedule')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a single class (FR-SCH-04)',
    description:
      'Reminders are cancelled and re-planned so the family is never sent to the old room.',
  })
  reschedule(
    @Param('classId') classId: string,
    @Body() dto: RescheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.reschedule({
      classId,
      newStartsAt: new Date(dto.newStartsAt),
      durationMinutes: dto.durationMinutes,
      actorUserId: user.id,
      roles: user.roles,
    });
  }

  // ── Recurring schedules (FR-SCH-02) ───────────────────────────────────────

  @Post('schedules')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create a recurring schedule (FR-SCH-02)',
    description:
      'RRULE is limited to FREQ=DAILY/WEEKLY with INTERVAL, BYDAY, COUNT and UNTIL. ' +
      "Occurrences keep the family's local wall-clock time across DST changes.",
  })
  createSchedule(@Body() dto: CreateScheduleDto) {
    return this.scheduling.createRecurringSchedule(dto);
  }

  @Get('schedules/:scheduleId')
  @Roles(Role.GUARDIAN, Role.TEACHER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'A recurring schedule and how far it has been materialised' })
  schedule(
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.getSchedule(scheduleId, { userId: user.id, roles: user.roles });
  }

  // ── Matching (FR-SCH-03) ──────────────────────────────────────────────────

  @Get('matching/:studentId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({
    summary: 'Top teacher suggestions with reasons (FR-SCH-03)',
    description:
      'Each suggestion carries the reasons it scored highly, so a human can sanity-check it.',
  })
  suggestions(
    @Param('studentId') studentId: string,
    @Query('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!courseId) throw AppError.badRequest('courseId is required');
    return this.scheduling.suggestTeachers(
      { studentId, courseId },
      { userId: user.id, roles: user.roles },
    );
  }

  // ── Timetables (FR-TCH-03, FR-PAR-01) ─────────────────────────────────────

  @Get('teachers/:teacherId/timetable')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: "Teacher timetable rendered in the viewer's zone (FR-TCH-03)" })
  teacherTimetable(
    @Param('teacherId') teacherId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') tz = 'UTC',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.teacherTimetable(
      teacherId,
      new Date(from),
      new Date(to),
      tz,
      { userId: user.id, roles: user.roles },
    );
  }

  @Get('families/:familyId/timetable')
  @Roles(Role.GUARDIAN, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Family timetable rendered in the viewer's zone (FR-PAR-01)" })
  familyTimetable(
    @Param('familyId') familyId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tz') tz = 'UTC',
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scheduling.familyTimetable(
      familyId,
      new Date(from),
      new Date(to),
      tz,
      { userId: user.id, roles: user.roles },
    );
  }
}
