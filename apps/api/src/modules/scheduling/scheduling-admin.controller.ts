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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@hifzoon/shared';
import { z } from 'zod';

import { Audit, CurrentUser, Roles, type AuthenticatedUser } from '../../common/decorators';
import { ZodBody } from '../../common/decorators/zod-openapi.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchedulingAdminService } from './scheduling-admin.service';

const updateScheduleBody = z
  .object({
    rrule: z.string().min(5).max(500).optional(),
    localStartTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    durationMinutes: z.number().int().min(10).max(180).optional(),
    roomType: z.enum(['ONE_TO_ONE', 'CIRCLE']).optional(),
    endsOn: z.coerce.date().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Send at least one field to change' });

const holidayBody = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(['HOLIDAY', 'RAMADAN_TIMETABLE']),
  startsOn: z.coerce.date(),
  endsOn: z.coerce.date(),
  /** RAMADAN_TIMETABLE only: `{ shiftMinutes?, durationMinutes? }`. */
  shiftRule: z
    .object({
      shiftMinutes: z.number().int().min(-360).max(360).optional(),
      durationMinutes: z.number().int().min(10).max(180).optional(),
    })
    .optional(),
});
const holidayPatchBody = holidayBody.partial();

const offerBody = z.object({
  teacherIds: z.array(z.string().uuid()).min(1).max(5),
  expiresInHours: z.number().int().min(1).max(72).optional(),
});
const assignBody = z.object({ teacherId: z.string().uuid() });
const respondBody = z.object({ accept: z.boolean() });

/**
 * Admin control of recurring schedules, holidays and substitute teachers
 * (FR-SCH-02, FR-SCH-05, FR-SCH-06). Single-class cancel and reschedule already live on
 * `SchedulingController` (`POST /scheduling/classes/:classId/cancel|reschedule`) and accept
 * ADMIN / SUPER_ADMIN.
 */
@ApiTags('scheduling')
@ApiBearerAuth()
@Controller('scheduling')
export class SchedulingAdminController {
  constructor(private readonly admin: SchedulingAdminService) {}

  // ── Recurring schedules ───────────────────────────────────────────────────

  @ZodBody(updateScheduleBody)
  @Patch('schedules/:scheduleId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.schedule.update', targetType: 'recurring_schedule', captureBody: false })
  @ApiOperation({
    summary: 'Edit a recurring schedule',
    description:
      'Upcoming classes nobody has started are rebuilt under the new pattern; past ones are kept.',
  })
  update(
    @Param('scheduleId', new ParseUUIDPipe()) scheduleId: string,
    @Body(new ZodValidationPipe(updateScheduleBody)) body: z.infer<typeof updateScheduleBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.updateSchedule(scheduleId, body, user.id);
  }

  @Post('schedules/:scheduleId/pause')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.schedule.pause', targetType: 'recurring_schedule', captureBody: false })
  @ApiOperation({ summary: 'Pause a schedule: upcoming unstarted classes are removed' })
  pause(
    @Param('scheduleId', new ParseUUIDPipe()) scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.pauseSchedule(scheduleId, user.id);
  }

  @Post('schedules/:scheduleId/resume')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.schedule.resume', targetType: 'recurring_schedule', captureBody: false })
  @ApiOperation({ summary: 'Resume a paused schedule: classes are generated again' })
  resume(
    @Param('scheduleId', new ParseUUIDPipe()) scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.resumeSchedule(scheduleId, user.id);
  }

  @Post('schedules/:scheduleId/end')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.schedule.end', targetType: 'recurring_schedule', captureBody: false })
  @ApiOperation({ summary: 'End a schedule for good; upcoming unstarted classes are removed' })
  end(
    @Param('scheduleId', new ParseUUIDPipe()) scheduleId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.endSchedule(scheduleId, user.id);
  }

  // ── Holidays and the Ramadan timetable ────────────────────────────────────

  @Get('holidays')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.SUPERVISOR, Role.TEACHER)
  @ApiOperation({ summary: 'Academy closures and Ramadan timetable windows' })
  @ApiQuery({ name: 'from', required: false, description: 'Only those ending on/after this date' })
  holidays(@Query('from') from?: string) {
    const date = from ? new Date(from) : undefined;
    return this.admin.listHolidays({
      from: date && !Number.isNaN(date.getTime()) ? date : undefined,
    });
  }

  @ZodBody(holidayBody)
  @Post('holidays')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.holiday.create', targetType: 'academy_holiday', captureBody: false })
  @ApiOperation({
    summary: 'Add a closure or Ramadan timetable',
    description:
      'A HOLIDAY removes classes on those dates; a RAMADAN_TIMETABLE shifts (and may shorten) them.',
  })
  createHoliday(
    @Body(new ZodValidationPipe(holidayBody)) body: z.infer<typeof holidayBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.createHoliday(body, user.id);
  }

  @ZodBody(holidayPatchBody)
  @Patch('holidays/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.holiday.update', targetType: 'academy_holiday', captureBody: false })
  @ApiOperation({ summary: 'Edit a closure or Ramadan timetable' })
  updateHoliday(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(holidayPatchBody)) body: z.infer<typeof holidayPatchBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.updateHoliday(id, body, user.id);
  }

  @Delete('holidays/:id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.holiday.delete', targetType: 'academy_holiday', captureBody: false })
  @ApiOperation({ summary: 'Remove a closure; the classes it removed come back' })
  deleteHoliday(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.deleteHoliday(id, user.id);
  }

  // ── Substitute teachers ───────────────────────────────────────────────────

  @Get('classes/:classId/substitute-candidates')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Teachers who could cover this class' })
  candidates(@Param('classId', new ParseUUIDPipe()) classId: string) {
    return this.admin.substituteCandidates(classId);
  }

  @ZodBody(offerBody)
  @Post('classes/:classId/substitute-offers')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.substitute.offer', targetType: 'class_session', captureBody: false })
  @ApiOperation({ summary: 'Offer the class to up to five teachers; the first to accept gets it' })
  offer(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body(new ZodValidationPipe(offerBody)) body: z.infer<typeof offerBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.offerSubstitute(classId, body, user.id);
  }

  @ZodBody(assignBody)
  @Put('classes/:classId/substitute')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Audit({ action: 'sch.substitute.assign', targetType: 'class_session', captureBody: false })
  @ApiOperation({ summary: 'Put a named teacher on the class straight away' })
  assign(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Body(new ZodValidationPipe(assignBody)) body: z.infer<typeof assignBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.assignSubstitute(classId, body.teacherId, user.id);
  }

  @Get('substitute-offers/mine')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Classes you have been asked to cover' })
  myOffers(@CurrentUser() user: AuthenticatedUser) {
    return this.admin.myOffers(user.id);
  }

  @ZodBody(respondBody)
  @Post('substitute-offers/:offerId/respond')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Accept or decline a substitute offer' })
  respond(
    @Param('offerId', new ParseUUIDPipe()) offerId: string,
    @Body(new ZodValidationPipe(respondBody)) body: z.infer<typeof respondBody>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.respondToOffer(offerId, user.id, body.accept);
  }
}
