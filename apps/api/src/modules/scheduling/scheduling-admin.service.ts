import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClassReminderService } from '../notifications/class-reminder.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { parseShiftRule } from './holidays';
import { isExclusionViolation, ScheduleMaterialiser } from './schedule-materialiser.service';
import { parseRRule } from './rrule';

/** How long a substitute offer stays open when the caller does not say. */
const DEFAULT_OFFER_HOURS = 12;
const MAX_OFFERED_AT_ONCE = 5;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Admin control of recurring schedules, academy holidays and substitute teachers
 * (FR-SCH-02, FR-SCH-05, FR-SCH-06).
 *
 * Every change that alters *future* classes works the same way: classes nobody has started
 * are removed and the nightly materialiser's own code regenerates them under the new rules.
 * Past and started classes are never touched — attendance, lesson cards and payroll hang off
 * them. One consequence worth knowing: a single class a family moved by hand inside an
 * affected range is regenerated at its normal slot.
 */
@Injectable()
export class SchedulingAdminService {
  private readonly logger = new Logger(SchedulingAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly materialiser: ScheduleMaterialiser,
    private readonly settings: SettingsService,
    private readonly reminders: ClassReminderService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Recurring schedules ───────────────────────────────────────────────────

  async updateSchedule(
    scheduleId: string,
    patch: {
      rrule?: string;
      localStartTime?: string;
      durationMinutes?: number;
      roomType?: 'ONE_TO_ONE' | 'CIRCLE';
      endsOn?: Date | null;
    },
    actorId: string,
  ) {
    const schedule = await this.loadSchedule(scheduleId);
    if (schedule.status === 'ENDED') {
      throw AppError.conflict('CONFLICT', 'This schedule has ended and cannot be edited');
    }

    if (
      patch.localStartTime !== undefined &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.localStartTime)
    ) {
      throw AppError.badRequest('Start time is HH:MM, 24-hour', { field: 'localStartTime' });
    }
    if (
      patch.durationMinutes !== undefined &&
      (!Number.isInteger(patch.durationMinutes) ||
        patch.durationMinutes < 10 ||
        patch.durationMinutes > 180)
    ) {
      throw AppError.badRequest('A class is between 10 and 180 minutes', {
        field: 'durationMinutes',
      });
    }
    if (patch.endsOn && patch.endsOn < schedule.startsOn) {
      throw AppError.badRequest('The schedule cannot end before it starts', { field: 'endsOn' });
    }
    if (patch.rrule !== undefined) {
      // Refuse a rule the materialiser could not expand, before anything is removed.
      try {
        parseRRule(
          patch.rrule,
          DateTime.fromJSDate(schedule.startsOn, { zone: schedule.familyTimeZone }),
        );
      } catch (error) {
        throw AppError.badRequest(`Unusable recurrence rule: ${(error as Error).message}`, {
          field: 'rrule',
        });
      }
    }

    const data: Prisma.RecurringScheduleUpdateInput = {
      ...(patch.rrule !== undefined ? { rrule: patch.rrule } : {}),
      ...(patch.localStartTime !== undefined
        ? { localStartTime: new Date(`1970-01-01T${patch.localStartTime}:00.000Z`) }
        : {}),
      ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
      ...(patch.roomType !== undefined ? { roomType: patch.roomType } : {}),
      ...(patch.endsOn !== undefined ? { endsOn: patch.endsOn } : {}),
      materialisedUntil: null,
    };

    const removed = await this.clearFutureClasses({ scheduleId });
    await this.prisma.recurringSchedule.update({ where: { id: scheduleId }, data });
    if (schedule.status === 'ACTIVE') await this.regenerate();

    await this.audit.record({
      actorId,
      action: 'sch.schedule.update',
      targetType: 'recurring_schedule',
      targetId: scheduleId,
      after: { ...patch, futureClassesRebuilt: removed },
    });
    return this.getScheduleSummary(scheduleId);
  }

  /** Stops generating classes and removes the future ones; resume brings them back. */
  async pauseSchedule(scheduleId: string, actorId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    if (schedule.status !== 'ACTIVE') {
      throw AppError.conflict(
        'CONFLICT',
        `Schedule is ${schedule.status}; only an active one can be paused`,
      );
    }
    const removed = await this.clearFutureClasses({ scheduleId });
    await this.prisma.recurringSchedule.update({
      where: { id: scheduleId },
      data: { status: 'PAUSED', materialisedUntil: null },
    });
    await this.audit.record({
      actorId,
      action: 'sch.schedule.pause',
      targetType: 'recurring_schedule',
      targetId: scheduleId,
      after: { futureClassesRemoved: removed },
    });
    return this.getScheduleSummary(scheduleId);
  }

  async resumeSchedule(scheduleId: string, actorId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    if (schedule.status !== 'PAUSED') {
      throw AppError.conflict(
        'CONFLICT',
        `Schedule is ${schedule.status}; only a paused one can be resumed`,
      );
    }
    await this.prisma.recurringSchedule.update({
      where: { id: scheduleId },
      data: { status: 'ACTIVE', materialisedUntil: null },
    });
    await this.regenerate();
    await this.audit.record({
      actorId,
      action: 'sch.schedule.resume',
      targetType: 'recurring_schedule',
      targetId: scheduleId,
    });
    return this.getScheduleSummary(scheduleId);
  }

  /** Ends a schedule for good: no more classes are generated and future ones are removed. */
  async endSchedule(scheduleId: string, actorId: string) {
    const schedule = await this.loadSchedule(scheduleId);
    if (schedule.status === 'ENDED') {
      throw AppError.conflict('CONFLICT', 'This schedule has already ended');
    }
    const removed = await this.clearFutureClasses({ scheduleId });
    const today = DateTime.utc().startOf('day').toJSDate();
    await this.prisma.recurringSchedule.update({
      where: { id: scheduleId },
      data: {
        status: 'ENDED',
        endsOn: schedule.endsOn && schedule.endsOn < today ? schedule.endsOn : today,
      },
    });
    await this.audit.record({
      actorId,
      action: 'sch.schedule.end',
      targetType: 'recurring_schedule',
      targetId: scheduleId,
      after: { futureClassesRemoved: removed },
    });
    return this.getScheduleSummary(scheduleId);
  }

  // ── Holidays and the Ramadan timetable ────────────────────────────────────

  listHolidays(opts: { from?: Date } = {}) {
    return this.prisma.academyHoliday.findMany({
      where: opts.from ? { endsOn: { gte: opts.from } } : {},
      orderBy: { startsOn: 'asc' },
    });
  }

  async createHoliday(input: HolidayInput, actorId: string) {
    const data = this.checkedHoliday(input);
    await this.assertNoOverlappingRamadan(data);
    const holiday = await this.prisma.academyHoliday.create({ data });
    const rebuilt = await this.rebuildRange(holiday.startsOn, holiday.endsOn);
    await this.audit.record({
      actorId,
      action: 'sch.holiday.create',
      targetType: 'academy_holiday',
      targetId: holiday.id,
      after: { ...input, classesRebuilt: rebuilt },
    });
    return { ...holiday, classesRebuilt: rebuilt };
  }

  async updateHoliday(id: string, patch: Partial<HolidayInput>, actorId: string) {
    const current = await this.prisma.academyHoliday.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Holiday');
    const data = this.checkedHoliday({
      name: patch.name ?? current.name,
      type: patch.type ?? current.type,
      startsOn: patch.startsOn ?? current.startsOn,
      endsOn: patch.endsOn ?? current.endsOn,
      shiftRule: patch.shiftRule !== undefined ? patch.shiftRule : current.shiftRule,
    });
    await this.assertNoOverlappingRamadan(data, id);
    const holiday = await this.prisma.academyHoliday.update({ where: { id }, data });
    // Both the old and the new dates change: classes may need to come back or go away.
    const rebuilt = await this.rebuildRange(
      new Date(Math.min(current.startsOn.getTime(), holiday.startsOn.getTime())),
      new Date(Math.max(current.endsOn.getTime(), holiday.endsOn.getTime())),
    );
    await this.audit.record({
      actorId,
      action: 'sch.holiday.update',
      targetType: 'academy_holiday',
      targetId: id,
      before: { name: current.name, startsOn: iso(current.startsOn), endsOn: iso(current.endsOn) },
      after: { ...patch, classesRebuilt: rebuilt },
    });
    return { ...holiday, classesRebuilt: rebuilt };
  }

  async deleteHoliday(id: string, actorId: string) {
    const current = await this.prisma.academyHoliday.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('Holiday');
    await this.prisma.academyHoliday.delete({ where: { id } });
    // The classes the holiday had removed come back.
    const rebuilt = await this.rebuildRange(current.startsOn, current.endsOn);
    await this.audit.record({
      actorId,
      action: 'sch.holiday.delete',
      targetType: 'academy_holiday',
      targetId: id,
      before: { name: current.name, type: current.type },
      after: { classesRebuilt: rebuilt },
    });
    return { id, deleted: true, classesRebuilt: rebuilt };
  }

  // ── Substitute teachers (FR-SCH-06) ───────────────────────────────────────

  /** Teachers who could take this class: cleared, teach the course, and free at that time. */
  async substituteCandidates(classId: string) {
    const klass = await this.loadClassForSubstitution(classId);
    const candidates = await this.prisma.teacherProfile.findMany({
      where: {
        id: { not: klass.teacherId },
        readyToMatch: true,
        hiringStatus: 'APPROVED',
        // Women-only classes stay with a female teacher.
        ...(klass.womenOnly ? { gender: 'FEMALE' as const } : {}),
        OR: [
          { subjects: { has: klass.course.code } },
          { schedules: { some: { status: 'ACTIVE', enrolment: { courseId: klass.courseId } } } },
        ],
        // Not teaching anything that overlaps the class.
        classes: {
          none: {
            status: { in: ['SCHEDULED', 'LIVE'] },
            startsAt: { lt: klass.endsAt },
            endsAt: { gt: klass.startsAt },
          },
        },
      },
      select: {
        id: true,
        gender: true,
        ratingAvg: true,
        ratingCount: true,
        user: { select: { name: true } },
        substituteOffers: {
          where: { classId },
          select: { status: true },
        },
      },
      orderBy: [{ ratingAvg: 'desc' }, { id: 'asc' }],
      take: 50,
    });
    return {
      classId,
      startsAt: klass.startsAt,
      candidates: candidates.map((t) => ({
        teacherId: t.id,
        name: t.user.name,
        gender: t.gender,
        ratingAvg: Number(t.ratingAvg),
        ratingCount: t.ratingCount,
        offerStatus: t.substituteOffers[0]?.status ?? null,
      })),
    };
  }

  /**
   * Offers a class to up to five teachers at once, in priority `order`. The first to accept
   * gets it; the rest of the offers close.
   */
  async offerSubstitute(
    classId: string,
    input: { teacherIds: string[]; expiresInHours?: number },
    actorId: string,
  ) {
    const teacherIds = [...new Set(input.teacherIds)];
    if (teacherIds.length === 0 || teacherIds.length > MAX_OFFERED_AT_ONCE) {
      throw AppError.badRequest(`Offer the class to between 1 and ${MAX_OFFERED_AT_ONCE} teachers`);
    }
    const klass = await this.loadClassForSubstitution(classId);
    const allowed = new Set(
      (await this.substituteCandidates(classId)).candidates.map((c) => c.teacherId),
    );
    const refused = teacherIds.filter((id) => !allowed.has(id));
    if (refused.length > 0) {
      throw AppError.badRequest(
        'Some teachers cannot take this class (not cleared, busy, or wrong subject)',
        {
          teacherIds: refused,
        },
      );
    }

    const hours = Math.min(Math.max(input.expiresInHours ?? DEFAULT_OFFER_HOURS, 1), 72);
    // An offer that outlives the class is useless.
    const expiresAt = new Date(
      Math.min(Date.now() + hours * 3_600_000, klass.startsAt.getTime() - 5 * 60_000),
    );
    if (expiresAt <= new Date()) {
      throw AppError.conflict('CONFLICT', 'This class starts too soon to offer to other teachers');
    }

    await this.prisma.$transaction(
      teacherIds.map((teacherId, index) =>
        this.prisma.substituteOffer.upsert({
          where: { classId_teacherId: { classId, teacherId } },
          create: { classId, teacherId, order: index + 1, expiresAt },
          update: {
            order: index + 1,
            status: 'OFFERED',
            respondedAt: null,
            offeredAt: new Date(),
            expiresAt,
          },
        }),
      ),
    );

    const teachers = await this.prisma.teacherProfile.findMany({
      where: { id: { in: teacherIds } },
      select: { userId: true },
    });
    await this.notifications
      .enqueue({
        userIds: teachers.map((t) => t.userId),
        template: TEMPLATE.SUBSTITUTE_OFFERED,
        data: {
          courseName: klass.course.name,
          startsAt: klass.startsAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      })
      .catch((error: Error) =>
        this.logger.warn(`Substitute offer for ${classId} not notified: ${error.message}`),
      );

    await this.audit.record({
      actorId,
      action: 'sch.substitute.offer',
      targetType: 'class_session',
      targetId: classId,
      after: { teacherIds, expiresAt },
    });
    return { classId, offered: teacherIds.length, expiresAt };
  }

  /** The signed-in teacher's open offers, soonest class first. */
  async myOffers(userId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) return [];
    const offers = await this.prisma.substituteOffer.findMany({
      where: { teacherId: profile.id, status: 'OFFERED', expiresAt: { gt: new Date() } },
      include: {
        class: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            status: true,
            course: { select: { name: true } },
            students: { select: { student: { select: { displayName: true } } } },
          },
        },
      },
      orderBy: { class: { startsAt: 'asc' } },
      take: 50,
    });
    return offers
      .filter((o) => o.class.status === 'SCHEDULED')
      .map((o) => ({
        offerId: o.id,
        classId: o.class.id,
        course: o.class.course.name,
        startsAt: o.class.startsAt,
        endsAt: o.class.endsAt,
        students: o.class.students.map((s) => s.student.displayName),
        expiresAt: o.expiresAt,
      }));
  }

  async respondToOffer(offerId: string, userId: string, accept: boolean) {
    const offer = await this.prisma.substituteOffer.findUnique({
      where: { id: offerId },
      include: { teacher: { select: { id: true, userId: true } } },
    });
    if (!offer || offer.teacher.userId !== userId) throw AppError.notFound('Offer');
    if (offer.status !== 'OFFERED') {
      throw AppError.conflict('CONFLICT', `This offer is already ${offer.status.toLowerCase()}`);
    }
    if (offer.expiresAt <= new Date()) {
      await this.prisma.substituteOffer.update({
        where: { id: offerId },
        data: { status: 'EXPIRED', respondedAt: new Date() },
      });
      throw AppError.conflict('CONFLICT', 'This offer has expired');
    }

    if (!accept) {
      await this.prisma.substituteOffer.update({
        where: { id: offerId },
        data: { status: 'DECLINED', respondedAt: new Date() },
      });
      return { offerId, status: 'DECLINED' as const };
    }

    const klass = await this.loadClassForSubstitution(offer.classId);
    await this.assignTeacher(klass.id, offer.teacherId, userId, offerId);
    return { offerId, status: 'ACCEPTED' as const, classId: klass.id };
  }

  /** Staff put a named teacher on the class straight away (no offer round). */
  async assignSubstitute(classId: string, teacherId: string, actorId: string) {
    await this.loadClassForSubstitution(classId);
    const allowed = (await this.substituteCandidates(classId)).candidates.some(
      (c) => c.teacherId === teacherId,
    );
    if (!allowed) {
      throw AppError.badRequest(
        'That teacher cannot take this class (not cleared, busy, or wrong subject)',
      );
    }
    await this.assignTeacher(classId, teacherId, actorId, null);
    return { classId, teacherId };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /**
   * Moves the class to the new teacher inside one transaction. The class must still be
   * scheduled and the teacher must still be free; the first caller wins, everyone else's open
   * offers close.
   */
  private async assignTeacher(
    classId: string,
    teacherId: string,
    actorId: string,
    acceptedOfferId: string | null,
  ) {
    const before = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        teacherId: true,
        teacher: { select: { userId: true } },
        course: { select: { name: true } },
        startsAt: true,
        students: {
          select: {
            student: { select: { family: { select: { members: { select: { userId: true } } } } } },
          },
        },
      },
    });
    if (!before) throw AppError.notFound('Class');

    try {
      await this.prisma.$transaction(async (tx) => {
        const moved = await tx.classSession.updateMany({
          where: {
            id: classId,
            status: 'SCHEDULED',
            teacherId: before.teacherId,
            startsAt: { gt: new Date() },
          },
          data: { teacherId },
        });
        if (moved.count !== 1) {
          throw AppError.conflict(
            'CONFLICT',
            'This class has already been taken or is no longer scheduled',
          );
        }
        if (acceptedOfferId) {
          await tx.substituteOffer.update({
            where: { id: acceptedOfferId },
            data: { status: 'ACCEPTED', respondedAt: new Date() },
          });
        }
        await tx.substituteOffer.updateMany({
          where: {
            classId,
            status: 'OFFERED',
            ...(acceptedOfferId ? { id: { not: acceptedOfferId } } : {}),
          },
          data: { status: 'EXPIRED', respondedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      // The GiST exclusion refusing an overlapping teacher booking (FR-SCH-07).
      if (isExclusionViolation(error)) {
        throw AppError.conflict('CONFLICT', 'That teacher is already booked at this time');
      }
      throw error;
    }

    await this.reminders.cancelForClass(classId).catch(() => undefined);
    await this.reminders.planForClass(classId).catch(() => undefined);

    const newTeacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { userId: true, user: { select: { name: true } } },
    });
    const familyUsers = before.students.flatMap((s) =>
      s.student.family.members.map((m) => m.userId),
    );
    await this.notifications
      .enqueue({
        userIds: [
          ...new Set(
            [...familyUsers, before.teacher.userId, newTeacher?.userId ?? ''].filter(Boolean),
          ),
        ],
        template: TEMPLATE.TEACHER_CHANGE,
        data: { courseName: before.course.name, startsAt: before.startsAt.toISOString() },
      })
      .catch((error: Error) =>
        this.logger.warn(`Substitute for ${classId} assigned but not notified: ${error.message}`),
      );

    await this.audit.record({
      actorId,
      action: 'sch.substitute.assign',
      targetType: 'class_session',
      targetId: classId,
      before: { teacherId: before.teacherId },
      after: { teacherId, viaOffer: acceptedOfferId !== null },
    });
  }

  private async loadClassForSubstitution(classId: string) {
    const klass = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        teacherId: true,
        courseId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        womenOnly: true,
        course: { select: { code: true, name: true } },
      },
    });
    if (!klass) throw AppError.notFound('Class');
    if (klass.status !== 'SCHEDULED' || klass.startsAt <= new Date()) {
      throw AppError.conflict('CONFLICT', 'Only an upcoming scheduled class can have a substitute');
    }
    return klass;
  }

  private async loadSchedule(id: string) {
    const schedule = await this.prisma.recurringSchedule.findUnique({ where: { id } });
    if (!schedule) throw AppError.notFound('Schedule');
    return schedule;
  }

  private getScheduleSummary(id: string) {
    return this.prisma.recurringSchedule.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        rrule: true,
        localStartTime: true,
        durationMinutes: true,
        roomType: true,
        startsOn: true,
        endsOn: true,
        familyTimeZone: true,
        materialisedUntil: true,
      },
    });
  }

  /**
   * Removes upcoming classes nobody has started (and their reminders). Started, completed and
   * cancelled classes are history and stay. Returns how many were removed.
   */
  private async clearFutureClasses(
    where: { scheduleId: string } | { startsBetween: [Date, Date] },
  ): Promise<number> {
    const filter: Prisma.ClassSessionWhereInput =
      'scheduleId' in where
        ? { scheduleId: where.scheduleId }
        : {
            scheduleId: { not: null },
            startsAt: { gte: where.startsBetween[0], lt: where.startsBetween[1] },
          };
    const doomed = await this.prisma.classSession.findMany({
      where: { ...filter, status: 'SCHEDULED', startedAt: null, startsAt: { gt: new Date() } },
      select: { id: true, scheduleId: true },
    });
    if (doomed.length === 0) return 0;
    for (const klass of doomed)
      await this.reminders.cancelForClass(klass.id).catch(() => undefined);
    await this.prisma.classSession.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
    // The affected schedules must regenerate from today.
    const scheduleIds = [
      ...new Set(doomed.map((d) => d.scheduleId).filter((x): x is string => !!x)),
    ];
    await this.prisma.recurringSchedule.updateMany({
      where: { id: { in: scheduleIds } },
      data: { materialisedUntil: null },
    });
    return doomed.length;
  }

  /** Re-expands every active schedule over the usual horizon. Idempotent. */
  private async regenerate() {
    const days = await this.settings.getNumber('scheduling.materialise_days');
    const horizon = DateTime.utc().plus({ days: Number.isFinite(days) && days > 0 ? days : 60 });
    await this.materialiser.materialiseDueSchedules(horizon);
  }

  private async rebuildRange(from: Date, to: Date): Promise<number> {
    // Classes whose local date could fall on the range in any zone: pad a day either side.
    const start = new Date(from.getTime() - 24 * 3_600_000);
    const end = new Date(to.getTime() + 2 * 24 * 3_600_000);
    const removed = await this.clearFutureClasses({ startsBetween: [start, end] });
    // Every active schedule re-expands: a removed holiday brings back classes that were never
    // generated, so there is nothing to delete for it to notice.
    await this.prisma.recurringSchedule.updateMany({
      where: { status: 'ACTIVE' },
      data: { materialisedUntil: null },
    });
    await this.regenerate();
    return removed;
  }

  private checkedHoliday(input: HolidayInput) {
    const name = input.name.trim();
    if (!name) throw AppError.badRequest('A holiday needs a name');
    if (input.endsOn < input.startsOn) {
      throw AppError.badRequest('A holiday cannot end before it starts');
    }
    let shiftRule: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
    if (input.type === 'RAMADAN_TIMETABLE') {
      const rule = parseShiftRule(input.shiftRule);
      if (!rule) {
        throw AppError.badRequest(
          'A Ramadan timetable needs shiftMinutes and/or durationMinutes in its shiftRule',
          { field: 'shiftRule' },
        );
      }
      if (Math.abs(rule.shiftMinutes) > 6 * 60) {
        throw AppError.badRequest('Shift classes by at most 6 hours', { field: 'shiftRule' });
      }
      if (
        rule.durationMinutes !== undefined &&
        (rule.durationMinutes < 10 || rule.durationMinutes > 180)
      ) {
        throw AppError.badRequest('A class is between 10 and 180 minutes', { field: 'shiftRule' });
      }
      shiftRule = rule as unknown as Prisma.InputJsonValue;
    }
    return {
      name,
      type: input.type,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      shiftRule,
    };
  }

  private async assertNoOverlappingRamadan(
    data: { type: 'HOLIDAY' | 'RAMADAN_TIMETABLE'; startsOn: Date; endsOn: Date },
    ignoreId?: string,
  ) {
    if (data.type !== 'RAMADAN_TIMETABLE') return;
    const clash = await this.prisma.academyHoliday.findFirst({
      where: {
        type: 'RAMADAN_TIMETABLE',
        startsOn: { lte: data.endsOn },
        endsOn: { gte: data.startsOn },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (clash) {
      throw AppError.conflict('CONFLICT', `This overlaps the Ramadan timetable "${clash.name}"`, {
        holidayId: clash.id,
      });
    }
  }
}

export interface HolidayInput {
  name: string;
  type: 'HOLIDAY' | 'RAMADAN_TIMETABLE';
  startsOn: Date;
  endsOn: Date;
  shiftRule?: unknown;
}
