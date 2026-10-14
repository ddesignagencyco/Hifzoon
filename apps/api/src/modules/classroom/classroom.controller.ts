import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MUSHAF_MAX_PAGE, MUSHAF_MIN_PAGE, MushafLayout, Role } from '@hifzoon/shared';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { AuthenticatedUser, CurrentUser, Roles } from '../../common/decorators';
import { ClassroomService } from './classroom.service';

/**
 * Numeric query parameters arrive as strings.
 *
 * The global ValidationPipe runs with `enableImplicitConversion: false` on purpose —
 * implicit conversion would silently coerce request *body* fields, turning "007" into
 * a number and `"true"` into a boolean without the caller asking. Query parameters
 * therefore declare their own conversion, which keeps the coercion visible in the code
 * rather than implied by a global setting.
 */
export class BandwidthQueryDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(10000) rttMs!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) downlinkKbps!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) packetLossPercent?: number;
}

export class PageBodyDto {
  @IsInt() @Min(MUSHAF_MIN_PAGE) @Max(MUSHAF_MAX_PAGE) page!: number;
}

export class HighlightBodyDto {
  @IsInt() @Min(1) @Max(114) surah!: number;
  @IsInt() @Min(1) ayah!: number;
  @IsInt() @Min(0) wordIndex!: number;
}

export class LayoutBodyDto {
  @IsEnum(MushafLayout) layout!: MushafLayout;
}

export class TajweedBodyDto {
  @IsBoolean() enabled!: boolean;
}

export class RecordBodyDto {
  @IsOptional() overrideReason?: string;
}

@ApiTags('classroom')
@ApiBearerAuth()
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  // ── Joining (FR-CLS-01) ───────────────────────────────────────────────────

  @Post('classes/:classId/token')
  @ApiOperation({
    summary: 'Get a room token (FR-CLS-01, CLS-BE-02)',
    description:
      'Refused until 10 minutes before the class starts and after it ends. Returns the video ' +
      'provider token and the signed room token the socket authenticates with. ' +
      'A guardian joining to watch is issued a token that cannot publish audio or video (FR-CLS-13).',
  })
  token(@Param('classId') classId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.classroom.issueRoomToken(user, classId);
  }

  @Get('classes/:classId/state')
  @ApiOperation({
    summary: 'Classroom state snapshot (NFR-REL-01)',
    description:
      'Current page, highlight, layout and who is present. Served from Redis with the session ' +
      'row as the durable fallback, so a reconnect resumes in well under 10 seconds.',
  })
  state(@Param('classId') classId: string) {
    return this.classroom.snapshot(classId);
  }

  // ── Attendance (FR-CLS-14) ────────────────────────────────────────────────

  @Get('classes/:classId/attendance')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Attendance for a class (FR-CLS-14)',
    description:
      'Minutes are accumulated across reconnects, so a student on a poor connection is not ' +
      'penalised for it (FR-CLS-11).',
  })
  attendance(@Param('classId') classId: string) {
    return this.classroom.attendance(classId);
  }

  @Post('classes/:classId/attendance/close')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close open attendance rows when a class ends (FR-CLS-14)',
    description:
      'Banks the minutes for anyone still connected, so a browser closed without a leave ' +
      'event does not show as present forever or inflate payroll.',
  })
  closeAttendance(@Param('classId') classId: string) {
    return this.classroom.closeAttendance(classId);
  }

  // ── Teacher controls (REST mirror of the socket events) ────────────────────

  @Post('classes/:classId/page')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Turn the page (FR-CLS-03)',
    description:
      'REST mirror of the `mushaf:page` socket event, for clients that prefer polling or ' +
      'need the change to be durable before the socket round-trip.',
  })
  setPage(@Param('classId') classId: string, @Body() dto: PageBodyDto) {
    return this.classroom.setPage(classId, dto.page);
  }

  @Post('classes/:classId/highlight')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move the word highlight (FR-CLS-03)' })
  setHighlight(@Param('classId') classId: string, @Body() dto: HighlightBodyDto) {
    return this.classroom.setHighlight(classId, dto);
  }

  @Post('classes/:classId/layout')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Switch Mushaf layout (FR-CLS-04)',
    description: 'Madani 15-line in P1; IndoPak 13/16 arrive in P2 without a contract change.',
  })
  setLayout(@Param('classId') classId: string, @Body() dto: LayoutBodyDto) {
    return this.classroom.setLayout(classId, dto.layout);
  }

  @Post('classes/:classId/tajweed')
  @Roles(Role.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle the Tajweed colour layer (FR-CLS-05)' })
  setTajweed(@Param('classId') classId: string, @Body() dto: TajweedBodyDto) {
    return this.classroom.setTajweedColours(classId, dto.enabled);
  }

  // ── Recording (FR-CLS-12) ─────────────────────────────────────────────────

  @Get('classes/:classId/recording/consent')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Recording consent check for a class (FR-CLS-12)',
    description:
      'Lists every enrolled student and whether they have CLASS_RECORDING consent. Recording ' +
      'is only possible when all of them have it.',
  })
  recordingConsent(@Param('classId') classId: string) {
    return this.classroom.recordingConsent(classId);
  }

  @Post('classes/:classId/recording/start')
  @Roles(Role.TEACHER, Role.SUPERVISOR, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Start recording (FR-CLS-12)',
    description:
      'Refused with 403 CONSENT_REQUIRED when any enrolled student lacks consent. The response ' +
      'names who is missing it so the teacher can act rather than just being told "no".',
  })
  startRecording(@Param('classId') classId: string, @Body() dto: RecordBodyDto) {
    return this.classroom.startRecording(classId, dto.overrideReason);
  }

  // ── Weak networks (FR-CLS-11) ─────────────────────────────────────────────

  @Get('bandwidth-advice')
  @ApiOperation({
    summary: 'What to do at this bandwidth (FR-CLS-11, CLS-BE-16)',
    description:
      'Video degrades first; audio and the Mushaf sync never do, because the Mushaf is where ' +
      'the teaching happens.',
  })
  @ApiQuery({ name: 'rttMs', required: true, example: 120 })
  @ApiQuery({ name: 'downlinkKbps', required: true, example: 1200 })
  @ApiQuery({ name: 'packetLossPercent', required: false, example: 2 })
  bandwidthAdvice(@Query() query: BandwidthQueryDto) {
    return this.classroom.bandwidthAdvice(
      query.rttMs,
      query.downlinkKbps,
      query.packetLossPercent ?? 0,
    );
  }
}
