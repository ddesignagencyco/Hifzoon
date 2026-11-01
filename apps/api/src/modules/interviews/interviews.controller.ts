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
import { Throttle } from '@nestjs/throttler';
import {
  INTERVIEW_DURATION,
  INTERVIEW_SCORE_MAX,
  INTERVIEW_SCORE_MIN,
  InterviewOutcome,
  InterviewStatus,
  Role,
  TeacherHiringStatus,
} from '@hifzoon/shared';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { AuthenticatedUser, CurrentUser, Public, Roles } from '../../common/decorators';
import { InterviewsService } from './interviews.service';

/** Scores are optional individually: Qari shb may fill the rubric in as he goes. */
class ScoresDto {
  @IsOptional()
  @IsInt()
  @Min(INTERVIEW_SCORE_MIN)
  @Max(INTERVIEW_SCORE_MAX)
  recitationScore?: number;
  @IsOptional() @IsInt() @Min(INTERVIEW_SCORE_MIN) @Max(INTERVIEW_SCORE_MAX) tajweedScore?: number;
  @IsOptional()
  @IsInt()
  @Min(INTERVIEW_SCORE_MIN)
  @Max(INTERVIEW_SCORE_MAX)
  memorisationScore?: number;
  @IsOptional() @IsInt() @Min(INTERVIEW_SCORE_MIN) @Max(INTERVIEW_SCORE_MAX) teachingScore?: number;
  @IsOptional()
  @IsInt()
  @Min(INTERVIEW_SCORE_MIN)
  @Max(INTERVIEW_SCORE_MAX)
  communicationScore?: number;
}

export class ScheduleInterviewDto {
  @IsUUID() applicationId!: string;
  @IsDateString() startsAt!: string;
  @IsOptional()
  @IsInt()
  @Min(INTERVIEW_DURATION.MIN_MINUTES)
  @Max(INTERVIEW_DURATION.MAX_MINUTES)
  durationMinutes?: number;
  /** Defaults to the caller — the common case is Qari shb booking himself. */
  @IsOptional() @IsUUID() interviewerId?: string;
  /** Which hiring step this interview serves, when the booker says. */
  @IsOptional() @IsEnum(TeacherHiringStatus) stage?: TeacherHiringStatus;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
  /** Set false to book without emailing the applicant (the link is in the response). */
  @IsOptional() @IsBoolean() notifyApplicant?: boolean;
}

export class RescheduleInterviewDto {
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional()
  @IsInt()
  @Min(INTERVIEW_DURATION.MIN_MINUTES)
  @Max(INTERVIEW_DURATION.MAX_MINUTES)
  durationMinutes?: number;
  @IsOptional() @IsUUID() interviewerId?: string;
  @IsOptional() @IsEnum(TeacherHiringStatus) stage?: TeacherHiringStatus;
  @IsOptional() @IsString() @MaxLength(64) timeZone?: string;
  @IsOptional() @IsBoolean() notifyApplicant?: boolean;
}

export class CancelInterviewDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class InterviewNotesDto {
  @IsString() @MaxLength(10_000) notes!: string;
}

export class InterviewOutcomeDto {
  @IsEnum(InterviewOutcome) outcome!: InterviewOutcome;
  @IsOptional() @IsString() @MaxLength(4000) outcomeNotes?: string;
  @IsOptional() @Type(() => ScoresDto) scores?: ScoresDto;
}

export class NoShowDto {
  @IsIn(['APPLICANT', 'INTERVIEWER']) who!: 'APPLICANT' | 'INTERVIEWER';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class ListInterviewsQueryDto {
  @IsOptional() @IsUUID() applicationId?: string;
  @IsOptional() @IsEnum(InterviewStatus) status?: InterviewStatus;
  @IsOptional() @IsUUID() interviewerId?: string;
  /** `mine=true` — only the interviews the caller is running. */
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/**
 * The applicant's token, posted in the body rather than taken from the path.
 *
 * A token in a URL ends up in access logs, browser history and `Referer` headers; this
 * one is the only credential an applicant has, so it travels in the body.
 */
export class ApplicantTokenDto {
  @IsString() @MaxLength(256) token!: string;
}

/**
 * Hiring interviews (INT) — a live video session between an academy interviewer
 * (Qari shb) and a teaching applicant.
 *
 * Two audiences on one controller: staff, who are authenticated normally, and the
 * applicant, who has no account at all and is authenticated purely by the opaque token
 * emailed to the address they applied with. The applicant's routes are `@Public` and
 * rate-limited hard, because an unauthenticated route that looks up a record by a secret
 * is exactly the shape you do not want to leave brute-forceable.
 */
@ApiTags('interviews')
@Controller('interviews')
export class InterviewsController {
  constructor(private readonly interviews: InterviewsService) {}

  // ── The applicant, by emailed link ────────────────────────────────────────

  @Public()
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'What the applicant sees before joining (no account needed)',
    description:
      'Exchanges the token from the emailed link for the interview time, who they are ' +
      'meeting and whether the room is open yet. Says nothing about the application ' +
      'itself. An unknown or expired token is a 404, so a wrong token is not an ' +
      'existence oracle.',
  })
  lobby(@Body() dto: ApplicantTokenDto) {
    return this.interviews.lobby(dto.token);
  }

  @Public()
  @Post('join/room')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'The applicant’s room token',
    description:
      'Refused until 10 minutes before the start and after the end, and refused outright ' +
      'once the interview is cancelled or finished. The applicant may publish audio and ' +
      'video: they are being interviewed, not watching.',
  })
  joinRoom(@Body() dto: ApplicantTokenDto) {
    return this.interviews.issueApplicantToken(dto.token);
  }

  @Public()
  @Post('join/state')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'The applicant’s view of the room (no account needed)',
    description:
      'Who is present and their mic/camera, so the applicant’s screen has the same polling ' +
      'fallback staff do when a WebSocket is blocked. The interviewer’s notes are never ' +
      'included: the applicant is sitting in the same room.',
  })
  joinState(@Body() dto: ApplicantTokenDto) {
    return this.interviews.applicantSnapshot(dto.token);
  }

  // ── Booking (staff) ───────────────────────────────────────────────────────

  @Post()
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Book an interview with an applicant',
    description:
      'Any application that is not already APPROVED or REJECTED can have an interview, ' +
      'optionally tagged with the hiring step it serves. The response carries the ' +
      'applicant’s join link once, at creation, so the booker can pass it on by hand if ' +
      'the email bounces — only its HMAC is stored.',
  })
  schedule(@Body() dto: ScheduleInterviewDto, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.schedule(user, {
      applicationId: dto.applicationId,
      startsAt: new Date(dto.startsAt),
      durationMinutes: dto.durationMinutes,
      interviewerId: dto.interviewerId,
      stage: dto.stage,
      timeZone: dto.timeZone ?? user.timeZone,
      notifyApplicant: dto.notifyApplicant,
    });
  }

  @Get()
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Interviews, newest first' })
  @ApiQuery({ name: 'applicationId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: InterviewStatus })
  @ApiQuery({ name: 'mine', required: false, example: true })
  list(@Query() query: ListInterviewsQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.list(user, {
      applicationId: query.applicationId,
      status: query.status,
      interviewerId: query.interviewerId,
      mine: query.mine,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }

  @Get(':interviewId')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'One interview, with notes, rubric and who attended',
    description:
      '`servesStep` names the hiring step this interview is evidence for; recording that ' +
      'step stays a separate action on the application.',
  })
  get(@Param('interviewId') interviewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.get(user, interviewId);
  }

  @Patch(':interviewId')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Move an interview',
    description:
      'The applicant’s existing link keeps working — its expiry follows the new end time, ' +
      'because that link is the only way in they have.',
  })
  reschedule(
    @Param('interviewId') interviewId: string,
    @Body() dto: RescheduleInterviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviews.reschedule(user, interviewId, {
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      durationMinutes: dto.durationMinutes,
      interviewerId: dto.interviewerId,
      stage: dto.stage,
      timeZone: dto.timeZone,
      notifyApplicant: dto.notifyApplicant,
    });
  }

  @Post(':interviewId/cancel')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an interview',
    description: 'The applicant is emailed and their join link stops working immediately.',
  })
  cancel(
    @Param('interviewId') interviewId: string,
    @Body() dto: CancelInterviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviews.cancel(user, interviewId, dto.reason);
  }

  // ── The room (staff) ──────────────────────────────────────────────────────

  @Post(':interviewId/token')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'A staff room token',
    description:
      'The assigned interviewer joins as INTERVIEWER; any other staff member sits in as ' +
      'an OBSERVER. Both can speak — there is no watch-only role in an interview.',
  })
  token(@Param('interviewId') interviewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.issueStaffToken(user, interviewId);
  }

  @Get(':interviewId/state')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Room state: who is present, their mic/camera, and the notes' })
  state(@Param('interviewId') interviewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.staffSnapshot(user, interviewId);
  }

  @Get(':interviewId/attendance')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Who turned up, and for how long',
    description:
      'Minutes accumulate across reconnects, so an applicant on a poor line is not ' +
      'recorded as absent for it.',
  })
  attendance(@Param('interviewId') interviewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.attendance(user, interviewId);
  }

  // ── Notes and the verdict ─────────────────────────────────────────────────

  @Patch(':interviewId/notes')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Autosave the interviewer’s notes',
    description:
      'Only the assigned interviewer (or an admin) may write. Notes are never sent to the ' +
      'applicant, who is sitting in the same room.',
  })
  saveNotes(
    @Param('interviewId') interviewId: string,
    @Body() dto: InterviewNotesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviews.saveNotes(user, interviewId, dto.notes);
  }

  @Post(':interviewId/outcome')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record the verdict and wrap the interview up',
    description:
      'Saves PASSED/FAILED with the 1–5 rubric, closes the room and banks attendance. It ' +
      'does not move the hiring pipeline: `recordStepHint` names the step this is evidence ' +
      'for, and an admin still records it on the application.',
  })
  recordOutcome(
    @Param('interviewId') interviewId: string,
    @Body() dto: InterviewOutcomeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviews.recordOutcome(user, interviewId, {
      outcome: dto.outcome,
      outcomeNotes: dto.outcomeNotes,
      scores: dto.scores,
    });
  }

  @Post(':interviewId/no-show')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record that the applicant or the interviewer did not turn up' })
  noShow(
    @Param('interviewId') interviewId: string,
    @Body() dto: NoShowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.interviews.markNoShow(user, interviewId, dto.who, dto.note);
  }

  @Post(':interviewId/end')
  @ApiBearerAuth()
  @Roles(Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the call without a verdict yet',
    description: 'Closes the room and banks attendance; the notes and rubric are kept.',
  })
  end(@Param('interviewId') interviewId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.interviews.end(user, interviewId);
  }
}
