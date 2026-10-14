import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { instantForLocalTime } from './dst.service';
import { expandRecurrence, parseRRule } from './rrule';

export interface MaterialiseResult {
  schedules: number;
  created: number;
  skipped: number;
  conflicts: number;
}

/**
 * Turns recurring schedules into concrete `class_session` rows (SCH-BE-02).
 *
 * Why materialise at all rather than compute on read:
 *   - a family can reschedule or cancel *one* occurrence, which needs a row to hang
 *     that state on
 *   - reminders, payroll and attendance all key off a session id
 *   - the no-double-booking constraints are range exclusions over real rows
 *
 * The job is idempotent through `materialised_until`: it only ever expands the window
 * beyond what has already been generated, so it can run nightly, or twice in a row,
 * or after a deploy without duplicating classes.
 */
@Injectable()
export class ScheduleMaterialiser {
  private readonly logger = new Logger(ScheduleMaterialiser.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates sessions for every active schedule up to `horizon`.
   *
   * `horizon` is 60 days out by default (TRD section 4.3): long enough that a family
   * always sees their next month, short enough that a cancelled teacher is not
   * discovered too late.
   */
  async materialiseDueSchedules(horizon: DateTime | Date): Promise<MaterialiseResult> {
    const until = toDateTime(horizon);
    const today = DateTime.utc().startOf('day');

    const schedules = await this.prisma.recurringSchedule.findMany({
      where: {
        status: 'ACTIVE',
        startsOn: { lte: until.toJSDate() },
        OR: [{ endsOn: null }, { endsOn: { gte: today.toJSDate() } }],
      },
      include: {
        enrolment: {
          select: { id: true, courseId: true, studentId: true, status: true },
        },
      },
      orderBy: { id: 'asc' },
      take: 500,
    });

    const result: MaterialiseResult = {
      schedules: schedules.length,
      created: 0,
      skipped: 0,
      conflicts: 0,
    };

    for (const schedule of schedules) {
      if (schedule.enrolment.status === 'CANCELLED') continue;

      const zone = schedule.familyTimeZone;
      const localStartMinutes = timeToMinutes(schedule.localStartTime);

      // The anchor is the schedule's first occurrence in the family's zone; using it
      // as the RRULE anchor keeps the weekday set stable across DST changes.
      const anchor = DateTime.fromJSDate(schedule.startsOn, { zone })
        .startOf('day')
        .set({
          hour: Math.floor(localStartMinutes / 60),
          minute: localStartMinutes % 60,
        });

      let rule;
      try {
        rule = parseRRule(schedule.rrule, anchor);
      } catch (error) {
        this.logger.error(
          `Schedule ${schedule.id} has an unusable RRULE ("${schedule.rrule}"): ${(error as Error).message}`,
        );
        result.skipped += 1;
        continue;
      }

      const from =
        anchor < DateTime.fromJSDate(schedule.materialisedUntil ?? schedule.startsOn, { zone })
          ? DateTime.fromJSDate(schedule.materialisedUntil ?? schedule.startsOn, { zone })
          : today;

      const occurrences = expandRecurrence({
        rule,
        anchor,
        from,
        to: until.setZone(zone),
      });

      for (const occurrence of occurrences) {
        const { startsAt, endsAt } = instantForLocalTime(
          zone,
          occurrence,
          localStartMinutes,
          schedule.durationMinutes,
        );

        const exists = await this.prisma.classSession.findFirst({
          where: { scheduleId: schedule.id, startsAt },
          select: { id: true },
        });
        if (exists) {
          result.skipped += 1;
          continue;
        }

        // Session and student link are created together: the class_student row is what
        // the student-side exclusion constraint reads, so creating it separately would
        // leave a window where a double booking could slip through.
        try {
          await this.prisma.$transaction(async (tx) => {
            const session = await tx.classSession.create({
              data: {
                scheduleId: schedule.id,
                teacherId: schedule.teacherId,
                courseId: schedule.enrolment.courseId,
                type: 'REGULAR',
                startsAt,
                endsAt,
                status: 'SCHEDULED',
              },
              select: { id: true },
            });

            await tx.classStudent.create({
              data: {
                classId: session.id,
                studentId: schedule.enrolment.studentId,
                startsAt,
                endsAt,
                enrolmentId: schedule.enrolment.id,
              },
            });
          });
          result.created += 1;
        } catch (error) {
          // FR-SCH-07 — a GiST exclusion constraint refused an overlapping booking.
          if (isExclusionViolation(error)) {
            this.logger.warn(
              `FR-SCH-07: skipped a session for schedule ${schedule.id} at ${startsAt.toISOString()} — teacher or student already booked`,
            );
            result.conflicts += 1;
            continue;
          }
          throw error;
        }
      }

      await this.prisma.recurringSchedule.update({
        where: { id: schedule.id },
        // A Date, not `toISODate()`: Prisma validates date columns as ISO-8601
        // datetimes and rejects a bare "2026-12-11" string.
        data: { materialisedUntil: until.endOf('day').toJSDate() },
      });
    }

    if (result.created > 0 || result.conflicts > 0) {
      this.logger.log(
        `Materialised ${result.created} session(s); ${result.conflicts} blocked by FR-SCH-07 double-booking`,
      );
    }
    return result;
  }

  /** Creates a single one-off session (trial, exam, make-up). */
  async createOneOff(input: {
    teacherId: string;
    courseId: string;
    type: 'TRIAL' | 'EXAM' | 'MAKEUP' | 'CIRCLE';
    startsAt: Date;
    durationMinutes: number;
    studentIds?: string[];
    enrolmentId?: string;
    scheduleId?: string;
    mushafLayout?: 'MADANI_15' | 'INDOPAK_13' | 'INDOPAK_16';
    womenOnly?: boolean;
  }): Promise<{ id: string; startsAt: string; endsAt: string }> {
    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);

    if (endsAt <= input.startsAt) {
      throw AppError.badRequest('A class must end after it starts');
    }

    try {
      const session = await this.prisma.classSession.create({
        data: {
          scheduleId: input.scheduleId ?? null,
          teacherId: input.teacherId,
          courseId: input.courseId,
          type: input.type,
          startsAt: input.startsAt,
          endsAt,
          status: 'SCHEDULED',
          mushafLayout: input.mushafLayout ?? 'MADANI_15',
          womenOnly: input.womenOnly ?? false,
        },
        select: { id: true, startsAt: true, endsAt: true },
      });

      for (const studentId of input.studentIds ?? []) {
        await this.prisma.classStudent.create({
          data: {
            classId: session.id,
            studentId,
            startsAt: input.startsAt,
            endsAt,
            enrolmentId: input.enrolmentId ?? null,
          },
        });
      }

      return {
        id: session.id,
        startsAt: session.startsAt.toISOString(),
        endsAt: session.endsAt.toISOString(),
      };
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new AppError(
          ErrorCode.DOUBLE_BOOKED,
          'That slot is already taken for the teacher or the student (FR-SCH-07)',
          { startsAt: input.startsAt.toISOString() },
        );
      }
      throw error;
    }
  }
}

/** Postgres raises 23P01 when a GiST exclusion constraint rejects a row. */
export function isExclusionViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    const message = error.message ?? '';
    return (
      message.includes('no_overlap') ||
      message.includes('23P01') ||
      message.includes('conflicting key value violates exclusion constraint')
    );
  }
  return false;
}

function toDateTime(value: DateTime | Date): DateTime {
  return value instanceof Date ? DateTime.fromJSDate(value, { zone: 'utc' }) : value;
}

function timeToMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}
