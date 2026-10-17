import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_CANCELLATION_NOTICE_HOURS,
  ErrorCode,
  SCHEDULE_MATERIALISE_DAYS,
} from '@hifzoon/shared';
import { DateTime } from 'luxon';

import { AppError } from '../../common/errors/app-error';
import {
  hasAnyRole,
  PolicyService,
  STAFF_SCOPE_ROLES,
  type PolicySubject,
} from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassReminderService } from '../notifications/class-reminder.service';
import { instantForLocalTime, isValidZone } from './dst.service';
import { ScheduleMaterialiser, isExclusionViolation } from './schedule-materialiser.service';
import { UnsupportedRecurrenceError, parseRRule } from './rrule';

export interface OpenSlot {
  teacherId: string;
  teacherName: string;
  startsAt: Date;
  endsAt: Date;
  /** The same instant expressed in the visitor's zone, which is what they chose from. */
  localTime: string;
  visitorZone: string;
  teacherZone: string;
}

/**
 * Scheduling and matching (SCH-BE-01, SCH-BE-03, SCH-BE-05, SCH-BE-06, FR-SCH-01,
 * FR-SCH-03, FR-SCH-04).
 *
 * The rule that shapes this service: *times are stored in UTC, chosen in local time*.
 * A teacher sets availability in their own zone; a family books a slot in the
 * visitor's zone; both land in the same `class_session` row. No component ever has to
 * guess which timezone a stored timestamp belongs to.
 */
@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly reminders: ClassReminderService,
    private readonly materialiser: ScheduleMaterialiser,
  ) {}

  // ── Teacher availability (FR-SCH-01) ──────────────────────────────────────

  /**
   * Replaces a teacher's weekly availability. Submitted as local `HH:mm` in the
   * teacher's own zone, matching the admin editor; storing UTC here would make the
   * grid drift by an hour twice a year.
   */
  async setAvailability(input: {
    teacherId: string;
    slots: Array<{ weekday: number; startTime: string; endTime: string }>;
    effectiveFrom?: string;
    effectiveTo?: string;
    actorUserId: string;
    actorRoles: string[];
  }) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: input.teacherId },
      select: { id: true, userId: true, user: { select: { timeZone: true } } },
    });
    if (!profile) throw AppError.notFound('Teacher');

    // NFR-SEC-02 — a teacher edits only their own availability; staff may edit any.
    const subject: PolicySubject = { userId: input.actorUserId, roles: input.actorRoles };
    if (!hasAnyRole(subject, STAFF_SCOPE_ROLES) && profile.userId !== input.actorUserId) {
      throw AppError.notOwner();
    }

    const zone = profile.user.timeZone;
    if (!isValidZone(zone)) throw AppError.badRequest(`Teacher has an invalid time zone "${zone}"`);

    for (const slot of input.slots) {
      const start = toMinutes(slot.startTime);
      const end = toMinutes(slot.endTime);
      if (start === null || end === null) {
        throw AppError.badRequest(`Times must be HH:mm, got "${slot.startTime}"–"${slot.endTime}"`);
      }
      if (end <= start) {
        throw AppError.badRequest('Availability must end after it starts');
      }
      if (slot.weekday < 0 || slot.weekday > 6) {
        throw AppError.badRequest('weekday must be 0 (Sunday) to 6 (Saturday)');
      }
    }

    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({ where: { teacherId: input.teacherId } }),
      this.prisma.availabilitySlot.createMany({
        data: input.slots.map((slot) => ({
          teacherId: input.teacherId,
          weekday: slot.weekday,
          startTime: minutesToDate(toMinutes(slot.startTime)!),
          endTime: minutesToDate(toMinutes(slot.endTime)!),
          timeZone: zone,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        })),
      }),
    ]);

    this.logger.log(
      `Availability replaced for teacher ${input.teacherId} (${input.slots.length} slots, ${zone})`,
    );
    return this.formatAvailability(input.teacherId);
  }

  /**
   * FR-SCH-01 — a teacher's published availability, readable by staff or the teacher
   * themselves. Timetable consumers use the slot data, not this profile lookup, so no
   * guardian path is needed here.
   */
  async getAvailability(teacherId: string, subject: PolicySubject) {
    if (!hasAnyRole(subject, STAFF_SCOPE_ROLES)) {
      const profile = await this.prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { userId: true },
      });
      if (!profile || profile.userId !== subject.userId) throw AppError.notOwner();
    }
    return this.formatAvailability(teacherId);
  }

  private async formatAvailability(teacherId: string) {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: {
        user: { select: { name: true, timeZone: true } },
        availability: {
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
          select: {
            weekday: true,
            startTime: true,
            endTime: true,
            timeZone: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
    });
    if (!profile) throw AppError.notFound('Teacher');

    const zone = profile.user.timeZone;
    return {
      teacherId,
      timeZone: zone,
      slots: profile.availability.map((slot) => ({
        weekday: slot.weekday,
        startTime: toHHmm(slot.startTime),
        endTime: toHHmm(slot.endTime),
        timeZone: slot.timeZone,
        effectiveFrom: slot.effectiveFrom,
        effectiveTo: slot.effectiveTo,
      })),
    };
  }

  // ── Open slots (FR-ADM-03, SCH-BE-03) ─────────────────────────────────────

  /**
   * Finds bookable slots for trials, shown in the *visitor's* timezone.
   *
   * A slot is offered when it sits inside the teacher's weekly availability, does not
   * overlap an existing session, and is far enough ahead to be planned. Teacher-side
   * matching filters (gender, language, course) are applied by the caller so the same
   * search serves both public booking and admin matching (FR-SCH-03).
   */
  async findOpenSlots(input: {
    teacherIds?: string[];
    from: Date;
    to: Date;
    visitorZone: string;
    durationMinutes?: number;
    courseId?: string;
    gender?: 'MALE' | 'FEMALE';
    language?: string;
    ageGroup?: string;
    limit?: number;
  }): Promise<OpenSlot[]> {
    if (!isValidZone(input.visitorZone)) {
      throw AppError.badRequest(`"${input.visitorZone}" is not a valid IANA time zone`);
    }
    if (!input.from || Number.isNaN(input.from.getTime()) || !input.to || Number.isNaN(input.to.getTime())) {
      throw AppError.badRequest('`from` and `to` must be valid ISO dates');
    }
    const duration = input.durationMinutes ?? 30;
    const from = DateTime.fromJSDate(input.from, { zone: input.visitorZone }).startOf('day');
    const to = DateTime.fromJSDate(input.to, { zone: input.visitorZone }).endOf('day');
    if (to <= from) throw AppError.badRequest('`to` must be after `from`');
    if (to.diff(from, 'days').days > 62) {
      throw AppError.badRequest('Search window cannot exceed 62 days');
    }

    // Resolve the course once: `TeacherProfile.subjects` stores course *codes*, so the
    // id alone cannot be compared against it (fixes SCH-BE-03 returning no slots).
    let requiredCourseCode: string | null = null;
    if (input.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: { code: true },
      });
      if (!course) throw AppError.notFound('Course');
      requiredCourseCode = course.code;
    }

    const teachers = await this.prisma.teacherProfile.findMany({
      where: {
        // FR-TCH-02 — only fully cleared teachers are bookable.
        readyToMatch: true,
        ...(input.teacherIds?.length ? { id: { in: input.teacherIds } } : {}),
        ...(input.gender ? { gender: input.gender } : {}),
        ...(input.language ? { languages: { has: input.language } } : {}),
        ...(input.ageGroup ? { ageGroups: { has: input.ageGroup } } : {}),
      },
      select: {
        id: true,
        subjects: true,
        user: { select: { name: true, timeZone: true } },
        availability: { select: { weekday: true, startTime: true, endTime: true } },
        schedules: {
          where: { status: 'ACTIVE' },
          select: { teacherId: true, enrolment: { select: { courseId: true } } },
        },
      },
      take: 50,
    });

    const booked = await this.prisma.classSession.findMany({
      where: {
        teacherId: { in: teachers.map((t) => t.id) },
        status: { in: ['SCHEDULED', 'LIVE', 'COMPLETED'] },
        startsAt: { lt: to.toJSDate() },
        endsAt: { gt: from.toJSDate() },
      },
      select: { teacherId: true, startsAt: true, endsAt: true },
      take: 5_000,
    });

    const slots: OpenSlot[] = [];
    const now = DateTime.utc();

    for (const teacher of teachers) {
      if (input.courseId) {
        // A teacher serves a course if they list its code as a subject *or* already
        // teach an active enrolment for it.
        const teachesCourse =
          (requiredCourseCode !== null && teacher.subjects.includes(requiredCourseCode)) ||
          teacher.schedules.some((s) => s.enrolment.courseId === input.courseId);
        if (!teachesCourse) continue;
      }

      const teacherZone = teacher.user.timeZone;
      const busy = booked.filter((b) => b.teacherId === teacher.id);

      for (let day = from; day <= to; day = day.plus({ days: 1 })) {
        const weekdayInTeacherZone = day.setZone(teacherZone).weekday % 7;
        const daySlots = teacher.availability.filter(
          (slot) => slot.weekday === weekdayInTeacherZone,
        );

        for (const slot of daySlots) {
          const localDate = day.setZone(teacherZone);
          const startMinutes = slot.startTime.getUTCHours() * 60 + slot.startTime.getUTCMinutes();
          const endMinutes = slot.endTime.getUTCHours() * 60 + slot.endTime.getUTCMinutes();

          // 15-minute grid: fine enough to feel bookable, coarse enough that a family
          // is not choosing between 96 options in a day.
          for (
            let minute = Math.ceil(startMinutes / 15) * 15;
            minute + duration <= endMinutes;
            minute += 15
          ) {
            const resolved = instantForLocalTime(teacherZone, localDate, minute, duration);
            if (resolved.startsAt < now.plus({ hours: 2 }).toJSDate()) continue;

            const overlaps = busy.some(
              (b) => resolved.startsAt < b.endsAt && resolved.endsAt > b.startsAt,
            );
            if (overlaps) continue;

            slots.push({
              teacherId: teacher.id,
              teacherName: teacher.user.name,
              startsAt: resolved.startsAt,
              endsAt: resolved.endsAt,
              localTime: DateTime.fromJSDate(resolved.startsAt, {
                zone: input.visitorZone,
              }).toFormat('ccc dd LLL, HH:mm'),
              visitorZone: input.visitorZone,
              teacherZone,
            });

            if (slots.length >= (input.limit ?? 60)) return slots;
          }
        }
      }
    }

    return slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  // ── Booking (FR-ADM-03) ───────────────────────────────────────────────────

  /** Books a trial or regular class, enforcing enrolment, consent and FR-SCH-07. */
  async bookSlot(input: {
    teacherId: string;
    courseId: string;
    studentId: string;
    enrolmentId?: string;
    startsAt: Date;
    durationMinutes: number;
    roomType: 'ONE_TO_ONE' | 'CIRCLE';
    type: 'TRIAL' | 'REGULAR' | 'CIRCLE' | 'EXAM' | 'MAKEUP';
    actorUserId: string;
    /** The caller's real roles — PolicyService decides access from these. */
    actorRoles: string[];
  }) {
    await this.policies.assertStudentAccess(
      { userId: input.actorUserId, roles: input.actorRoles },
      input.studentId,
    );
    await this.policies.assertTeacherMatchable(input.teacherId);
    await this.assertBookableSlot(input);

    // CR-01 / FR-AUTH-04 — an under-13 child may only be scheduled with DATA_COLLECTION
    // consent in place.
    const missing = await this.prisma.consent.findFirst({
      where: { studentId: input.studentId, purpose: 'DATA_COLLECTION', status: 'GRANTED' },
      select: { id: true },
    });
    if (!missing) {
      throw new AppError(
        ErrorCode.CONSENT_REQUIRED,
        'Guardian consent for data collection is required before a class can be booked (CR-01)',
        { studentId: input.studentId },
      );
    }

    const endsAt = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);

    try {
      const session = await this.prisma.$transaction(async (tx) => {
        const created = await tx.classSession.create({
          data: {
            teacherId: input.teacherId,
            courseId: input.courseId,
            type: input.type,
            startsAt: input.startsAt,
            endsAt,
            status: 'SCHEDULED',
          },
          select: { id: true, startsAt: true, endsAt: true },
        });

        const enrolmentId =
          input.enrolmentId ??
          (input.type === 'TRIAL' ? await this.ensureTrialEnrolment(tx, input) : null);

        await tx.classStudent.create({
          data: {
            classId: created.id,
            studentId: input.studentId,
            startsAt: input.startsAt,
            endsAt,
            enrolmentId,
          },
        });

        return created;
      });

      await this.reminders.planForClass(session.id);
      return session;
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new AppError(
          ErrorCode.DOUBLE_BOOKED,
          'That slot is no longer free for the teacher or the student (FR-SCH-07)',
          { startsAt: input.startsAt.toISOString() },
        );
      }
      throw error;
    }
  }

  /**
   * B28 — a trial relationship has to be an `Enrolment`, not just a calendar entry.
   *
   * Every ownership question in the product keys off `Enrolment(teacherId)`: can this
   * teacher record mistakes for this student, may this guardian watch the class, does
   * the student appear on the teacher's list. A trial that created only a `ClassStudent`
   * row answered none of them, so a trial class was unusable end to end. Creating the
   * TRIAL enrolment at booking time fixes the trial *and* leaves an upgrade path: after
   * the trial the family activates this same row instead of starting a second one.
   *
   * An existing non-cancelled enrolment for the same course is reused, so booking a
   * second trial (or a second class in the same course) cannot fork the relationship.
   */
  private async ensureTrialEnrolment(
    tx: Prisma.TransactionClient,
    input: { teacherId: string; courseId: string; studentId: string },
  ): Promise<string> {
    const existing = await tx.enrolment.findFirst({
      where: {
        studentId: input.studentId,
        courseId: input.courseId,
        status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.enrolment.create({
      data: {
        studentId: input.studentId,
        courseId: input.courseId,
        teacherId: input.teacherId,
        status: 'TRIAL',
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
 * FR-SCH-03 — the two questions `findOpenSlots` answers, re-asked at booking time.
 *
 * The web only offers a course's own teachers and only shows times drawn from the
 * teacher's availability, so these were never exercised by the product's own traffic.
 * The API is the guard, though, and it was accepting both: a trial booked with a teacher
 * who does not teach the course returned 201 (B26), and a class at 03:00 UTC for a
   * teacher available 16:00–20:00 returned 201 (B27). Either one lets any client put a
 * child in front of the wrong teacher, or in the middle of the night.
 *
 * The subject rule is deliberately the same one `findOpenSlots` uses — code in
 * `subjects`, or already teaching the course — so a teacher the finder hides cannot be
 * booked by asking for them directly.
 */
  private async assertBookableSlot(input: {
    teacherId: string;
    courseId: string;
    startsAt: Date;
    durationMinutes: number;
  }): Promise<void> {
    const [course, teacher] = await Promise.all([
      this.prisma.course.findUnique({
        where: { id: input.courseId },
        select: { code: true },
      }),
      this.prisma.teacherProfile.findUnique({
        where: { id: input.teacherId },
        select: {
          subjects: true,
          user: { select: { timeZone: true } },
          availability: { select: { weekday: true, startTime: true, endTime: true } },
          schedules: {
            where: { status: 'ACTIVE' },
            select: { enrolment: { select: { courseId: true } } },
          },
        },
      }),
    ]);

    if (!course) throw AppError.notFound('Course');
    if (!teacher) throw AppError.notFound('Teacher');

    const teachesCourse =
      teacher.subjects.includes(course.code) ||
      teacher.schedules.some((s) => s.enrolment.courseId === input.courseId);
    if (!teachesCourse) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'This teacher does not teach that course (FR-SCH-03)',
        { field: 'teacherId', teacherId: input.teacherId, courseCode: course.code },
      );
    }

    const zone = teacher.user.timeZone;
    const local = DateTime.fromJSDate(input.startsAt, { zone });
    const weekday = local.weekday % 7;
    const startMinutes = local.hour * 60 + local.minute;
    const windows = teacher.availability.filter((slot) => slot.weekday === weekday);
    const fits = windows.some((slot) => {
      const from = slot.startTime.getUTCHours() * 60 + slot.startTime.getUTCMinutes();
      const to = slot.endTime.getUTCHours() * 60 + slot.endTime.getUTCMinutes();
      return startMinutes >= from && startMinutes + input.durationMinutes <= to;
    });

    if (!fits) {
      throw new AppError(
        ErrorCode.SLOT_UNAVAILABLE,
        'That time is outside the teacher’s availability (FR-SCH-03)',
        {
          field: 'startsAt',
          startsAt: input.startsAt.toISOString(),
          localTime: local.toFormat('ccc dd LLL, HH:mm'),
          teacherZone: zone,
          availableWindows: windows.map((slot) => ({
            weekday: slot.weekday,
            startTime: slot.startTime.toISOString(),
            endTime: slot.endTime.toISOString(),
          })),
        },
      );
    }
  }

  // ── Cancellation and make-up credits (FR-SCH-04) ──────────────────────────

  /**
   * FR-SCH-04 — cancelling inside the notice window costs the family the class and
   * creates a make-up credit only when *we* cancel. A teacher cancellation always
   * produces a credit; the family is not charged for our mistake.
   */
  async cancelSession(input: {
    classId: string;
    by: 'FAMILY' | 'TEACHER' | 'ADMIN';
    reason: string;
    noticeHours?: number;
    actorUserId: string;
    roles: string[];
  }) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        teacherId: true,
        teacher: { select: { userId: true } },
        schedule: { select: { id: true } },
        students: { select: { studentId: true, student: { select: { familyId: true } } } },
      },
    });

    if (!session) throw AppError.notFound('Class');
    if (!['SCHEDULED', 'LIVE'].includes(session.status)) {
      throw new AppError(ErrorCode.CONFLICT, `Class is already ${session.status}`);
    }

    // NFR-SEC-02 — the `by` field is caller-supplied, so it is a *claim*, not a
    // permission. Authorise against the caller's real identity before acting on it.
    const subject: PolicySubject = { userId: input.actorUserId, roles: input.roles };
    const isStaff = hasAnyRole(subject, STAFF_SCOPE_ROLES);
    const isOwningTeacher = session.teacher.userId === input.actorUserId;

    if (input.by === 'ADMIN') {
      if (!isStaff) throw AppError.notOwner();
    } else if (input.by === 'TEACHER') {
      if (!isStaff && !isOwningTeacher) throw AppError.notOwner();
    } else {
      // FAMILY — a guardian must own every student on the class.
      if (!isStaff && !isOwningTeacher) {
        if (session.students.length === 0) throw AppError.notOwner();
        for (const link of session.students) {
          await this.policies.assertGuardianOwnsStudent(input.actorUserId, link.studentId);
        }
      }
    }

    const noticeHours = input.noticeHours ?? DEFAULT_CANCELLATION_NOTICE_HOURS;
    const hoursUntilStart = (session.startsAt.getTime() - Date.now()) / 3_600_000;
    const late = hoursUntilStart < noticeHours;

    // There is no CANCELLED_ADMIN status; an academy cancellation is recorded on the
    // teacher side so it always reads as "we did this, not the family".
    const status = input.by === 'FAMILY' ? 'CANCELLED_FAMILY' : 'CANCELLED_TEACHER';

    // FR-SCH-04 — a family cancellation never earns a make-up credit (it is charged
    // when late); a teacher or admin cancellation always does.
    const creditsCreated =
      input.by === 'FAMILY' ? 0 : await this.createMakeupCredits(session, input.reason);

    await this.prisma.$transaction([
      this.prisma.classSession.update({
        where: { id: session.id },
        data: {
          status,
          cancelledAt: new Date(),
          cancelReason: input.reason,
          // A late family cancellation is still chargeable (FR-SCH-04).
          charged: input.by === 'FAMILY' && late,
        },
      }),
      // Remove the class-student rows so the student is no longer blocked by the
      // overlap constraint and the teacher slot frees up.
      this.prisma.classStudent.deleteMany({ where: { classId: session.id } }),
    ]);

    await this.reminders.cancelForClass(session.id);

    this.logger.log(
      `Class ${session.id} cancelled by ${input.by} (${late ? 'late' : 'within notice'}), ${creditsCreated} make-up credit(s)`,
    );

    return {
      classId: session.id,
      status,
      charged: input.by === 'FAMILY' && late,
      makeUpCredits: creditsCreated,
      noticeHours,
    };
  }

  /** FR-SCH-04 — one credit per affected student, expiring in 60 days. */
  private async createMakeupCredits(
    session: { id: string; students: Array<{ studentId: string; student: { familyId: string } }> },
    reason: string,
  ): Promise<number> {
    if (session.students.length === 0) return 0;

    const result = await this.prisma.makeupCredit.createMany({
      data: session.students.map((link) => ({
        familyId: link.student.familyId,
        studentId: link.studentId,
        sourceClassId: session.id,
        status: 'AVAILABLE' as const,
        expiresAt: new Date(Date.now() + 60 * 86_400_000),
      })),
    });

    void reason;
    return result.count;
  }

  /** Reschedules one occurrence. FR-SCH-07 still applies, enforced by the database. */
  async reschedule(input: {
    classId: string;
    newStartsAt: Date;
    durationMinutes?: number;
    actorUserId: string;
    roles: string[];
  }) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        scheduleId: true,
        teacher: { select: { userId: true } },
        students: { select: { studentId: true } },
      },
    });

    if (!session) throw AppError.notFound('Class');
    if (session.status !== 'SCHEDULED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        `Only a SCHEDULED class can be moved; this one is ${session.status}`,
      );
    }
    if (input.newStartsAt.getTime() < Date.now()) {
      throw AppError.badRequest('A class cannot be moved into the past');
    }

    // NFR-SEC-02 — only staff, the class's own teacher, or a guardian of a student on
    // the class may move it.
    const subject: PolicySubject = { userId: input.actorUserId, roles: input.roles };
    if (!hasAnyRole(subject, STAFF_SCOPE_ROLES) && session.teacher.userId !== input.actorUserId) {
      if (session.students.length === 0) throw AppError.notOwner();
      for (const link of session.students) {
        await this.policies.assertGuardianOwnsStudent(input.actorUserId, link.studentId);
      }
    }

    const duration =
      input.durationMinutes ??
      Math.round((session.endsAt.getTime() - session.startsAt.getTime()) / 60_000);
    const newEndsAt = new Date(input.newStartsAt.getTime() + duration * 60_000);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const moved = await tx.classSession.update({
          where: { id: session.id },
          data: { startsAt: input.newStartsAt, endsAt: newEndsAt },
          select: { id: true, startsAt: true, endsAt: true },
        });

        // The denormalised range on class_student has to move with it, or the student
        // would appear booked for the old time and the overlap constraint would
        // wrongly refuse their next class.
        await tx.classStudent.updateMany({
          where: { classId: session.id },
          data: { startsAt: input.newStartsAt, endsAt: newEndsAt },
        });

        return moved;
      });

      // FR-NTF-01 — the old reminders would point at the wrong room.
      await this.reminders.cancelForClass(session.id);
      await this.reminders.planForClass(session.id);

      this.logger.log(
        `Class ${session.id} rescheduled from ${session.startsAt.toISOString()} to ${input.newStartsAt.toISOString()}`,
      );
      return updated;
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new AppError(
          ErrorCode.DOUBLE_BOOKED,
          'The new time collides with another booking (FR-SCH-07)',
          { startsAt: input.newStartsAt.toISOString() },
        );
      }
      throw error;
    }
  }

  // ── Recurring schedules (FR-SCH-02) ───────────────────────────────────────

  /**
   * Creates a recurring schedule and materialises its first 60 days immediately, so a
   * family sees real classes straight away rather than waiting for the nightly job.
   *
   * The RRULE is validated here and the anchor is the schedule's first local
   * occurrence — that pairing is what makes "every Tuesday at 16:00 local" survive a
   * DST change.
   */
  async createRecurringSchedule(input: {
    enrolmentId: string;
    teacherId: string;
    rrule: string;
    localStartTime: string;
    familyTimeZone: string;
    durationMinutes: number;
    roomType: 'ONE_TO_ONE' | 'CIRCLE';
    startsOn: string;
    endsOn?: string;
  }) {
    if (!isValidZone(input.familyTimeZone)) {
      throw AppError.badRequest(`"${input.familyTimeZone}" is not a valid IANA time zone`);
    }

    const localStartMinutes = toMinutes(input.localStartTime);
    if (localStartMinutes === null) {
      throw AppError.badRequest(`localStartTime must be HH:mm, got "${input.localStartTime}"`);
    }

    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: { id: true, courseId: true, studentId: true, status: true },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');
    if (['CANCELLED', 'COMPLETED'].includes(enrolment.status)) {
      throw AppError.badRequest(`Cannot schedule against a ${enrolment.status} enrolment`);
    }

    await this.policies.assertTeacherMatchable(input.teacherId);

    const startsOn = DateTime.fromISO(input.startsOn, { zone: input.familyTimeZone }).startOf(
      'day',
    );
    if (!startsOn.isValid)
      throw AppError.badRequest(`startsOn is not a valid date: "${input.startsOn}"`);

    const anchor = startsOn.set({
      hour: Math.floor(localStartMinutes / 60),
      minute: localStartMinutes % 60,
    });

    try {
      parseRRule(input.rrule, anchor);
    } catch (error) {
      throw AppError.badRequest((error as Error).message);
    }

    const schedule = await this.prisma.recurringSchedule.create({
      data: {
        enrolmentId: input.enrolmentId,
        teacherId: input.teacherId,
        rrule: input.rrule,
        localStartTime: minutesToDate(localStartMinutes),
        familyTimeZone: input.familyTimeZone,
        durationMinutes: input.durationMinutes,
        roomType: input.roomType,
        startsOn: startsOn.toJSDate(),
        endsOn: input.endsOn
          ? DateTime.fromISO(input.endsOn, { zone: input.familyTimeZone }).startOf('day').toJSDate()
          : null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        rrule: true,
        localStartTime: true,
        familyTimeZone: true,
        durationMinutes: true,
        startsOn: true,
        materialisedUntil: true,
      },
    });

    const materialised = await this.materialiser.materialiseDueSchedules(
      DateTime.utc().plus({ days: SCHEDULE_MATERIALISE_DAYS }),
    );

    // Re-read rather than trusting the pre-materialisation object: the materialiser
    // advances `materialised_until`, and the caller needs the value that was written.
    const [fresh, sessions] = await Promise.all([
      this.prisma.recurringSchedule.findUniqueOrThrow({
        where: { id: schedule.id },
        select: { materialisedUntil: true },
      }),
      this.prisma.classSession.findMany({
        where: { scheduleId: schedule.id },
        select: { id: true, startsAt: true, endsAt: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    return {
      scheduleId: schedule.id,
      familyTimeZone: schedule.familyTimeZone,
      localStartTime: toHHmm(schedule.localStartTime),
      rrule: schedule.rrule,
      materialisedUntil: fresh.materialisedUntil,
      sessions: sessions.map((session) => ({
        ...session,
        localStart: DateTime.fromJSDate(session.startsAt, { zone: input.familyTimeZone }).toFormat(
          'ccc dd LLL, HH:mm',
        ),
      })),
      skippedConflicts: materialised.conflicts,
    };
  }

  async getSchedule(scheduleId: string, subject: PolicySubject) {
    const schedule = await this.prisma.recurringSchedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        rrule: true,
        localStartTime: true,
        familyTimeZone: true,
        durationMinutes: true,
        roomType: true,
        startsOn: true,
        endsOn: true,
        status: true,
        materialisedUntil: true,
        enrolment: {
          select: { id: true, student: { select: { id: true, displayName: true } } },
        },
        teacher: { select: { id: true, user: { select: { id: true, name: true } } } },
        sessions: {
          select: { id: true, startsAt: true, endsAt: true, status: true },
          orderBy: { startsAt: 'asc' },
          take: 200,
        },
      },
    });
    if (!schedule) throw AppError.notFound('Schedule');

    // NFR-SEC-02 — staff, the schedule's teacher, or a guardian of the enrolled student.
    if (
      !hasAnyRole(subject, STAFF_SCOPE_ROLES) &&
      schedule.teacher.user.id !== subject.userId
    ) {
      await this.policies.assertGuardianOwnsStudent(subject.userId, schedule.enrolment.student.id);
    }

    return {
      ...schedule,
      localStartTime: toHHmm(schedule.localStartTime),
      sessions: schedule.sessions.map((session) => ({
        ...session,
        localStart: DateTime.fromJSDate(session.startsAt, {
          zone: schedule.familyTimeZone,
        }).toFormat('ccc dd LLL, HH:mm'),
      })),
    };
  }

  // ── Matching (FR-SCH-03) ──────────────────────────────────────────────────

  /**
   * Top-3 teacher suggestions for a student.
   *
   * Scoring is deliberately simple and explainable: a family or an admin looking at
   * these suggestions should be able to see *why* each teacher appeared. Language and
   * subject overlap dominate, availability and rating break ties, and anyone not
   * fully cleared is excluded outright (FR-TCH-02).
   */
  async suggestTeachers(
    input: {
      studentId: string;
      courseId: string;
      requiredLanguages?: string[];
      limit?: number;
    },
    subject: PolicySubject,
  ) {
    // Matching exposes a student's attributes (language, gender, age) to whoever
    // calls it, so it needs the same ownership gate as any other student read.
    await this.policies.assertStudentAccess(subject, input.studentId, 'teacher');

    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      select: { language: true, gender: true, birthYear: true },
    });
    if (!student) throw AppError.notFound('Student');

    const age = new Date().getUTCFullYear() - student.birthYear;
    const ageGroup = age <= 6 ? '4-6' : age <= 9 ? '6-9' : age <= 13 ? '10-13' : '14+';

    const course = await this.prisma.course.findUnique({
      where: { id: input.courseId },
      select: { code: true, name: true },
    });

    const candidates = await this.prisma.teacherProfile.findMany({
      where: { readyToMatch: true, hiringStatus: 'APPROVED' },
      select: {
        id: true,
        bio: true,
        photoUrl: true,
        gender: true,
        languages: true,
        subjects: true,
        ageGroups: true,
        ratingAvg: true,
        ratingCount: true,
        user: { select: { name: true, timeZone: true } },
        availability: { select: { weekday: true } },
      },
      take: 200,
    });

    const required = new Set(input.requiredLanguages ?? [student.language]);

    const scored = candidates
      .map((teacher) => {
        let score = 0;
        const reasons: string[] = [];

        const languageOverlap = teacher.languages.filter((l) => required.has(l));
        if (languageOverlap.length > 0) {
          score += languageOverlap.length * 10;
          reasons.push(`teaches in ${languageOverlap.join(', ')}`);
        } else {
          return null; // Hard requirement: a teacher who cannot speak the family's language is out.
        }

        const subjectMatch = teacher.subjects.includes(course?.code ?? '');
        if (subjectMatch) {
          score += 25;
          reasons.push(`specialises in ${course?.name}`);
        }

        if (teacher.gender && teacher.gender === student.gender) {
          score += 5;
          reasons.push('same gender for the learner');
        }

        if (teacher.ageGroups.includes(ageGroup)) {
          score += 10;
          reasons.push(`teaches the ${ageGroup} age group`);
        }

        score += Math.min(20, Number(teacher.ratingAvg) * 4);
        if (teacher.ratingCount >= 5)
          reasons.push(`rated ${Number(teacher.ratingAvg).toFixed(1)}/5`);

        return {
          teacherId: teacher.id,
          name: teacher.user.name,
          bio: teacher.bio,
          photoUrl: teacher.photoUrl,
          gender: teacher.gender,
          languages: teacher.languages,
          subjects: teacher.subjects,
          ratingAvg: Number(teacher.ratingAvg),
          ratingCount: teacher.ratingCount,
          timeZone: teacher.user.timeZone,
          availableWeekdays: [...new Set(teacher.availability.map((a) => a.weekday))].sort(),
          score,
          reasons,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 3);

    return { studentId: input.studentId, courseId: input.courseId, suggestions: scored };
  }

  // ── Calendar reads (FR-TCH-03, FR-PAR-01) ─────────────────────────────────

  /** Teacher timetable, rendered in the caller's timezone. */
  async teacherTimetable(
    teacherId: string,
    from: Date,
    to: Date,
    viewerZone: string,
    subject: PolicySubject,
  ) {
    assertRange(from, to);
    if (!hasAnyRole(subject, STAFF_SCOPE_ROLES)) {
      const profile = await this.prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { userId: true },
      });
      if (!profile || profile.userId !== subject.userId) throw AppError.notOwner();
    }

    const sessions = await this.prisma.classSession.findMany({
      where: {
        teacherId,
        startsAt: { gte: from, lte: to },
        status: { notIn: ['CANCELLED_FAMILY', 'CANCELLED_TEACHER'] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        roomId: true,
        course: { select: { name: true, code: true } },
        students: { select: { student: { select: { id: true, displayName: true } } } },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });

    return sessions.map((session) => ({
      ...session,
      localStart: DateTime.fromJSDate(session.startsAt, { zone: viewerZone }).toISO(),
      localEnd: DateTime.fromJSDate(session.endsAt, { zone: viewerZone }).toISO(),
      viewerZone,
    }));
  }

  async familyTimetable(
    familyId: string,
    from: Date,
    to: Date,
    viewerZone: string,
    subject: PolicySubject,
  ) {
    assertRange(from, to);
    // CR-10 — a guardian only ever sees their own family's timetable; staff see all.
    if (!hasAnyRole(subject, STAFF_SCOPE_ROLES)) {
      await this.policies.assertGuardianInFamily(subject.userId, familyId);
    }

    const sessions = await this.prisma.classSession.findMany({
      where: {
        students: { some: { student: { familyId } } },
        startsAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        mushafLayout: true,
        teacher: { select: { user: { select: { name: true } } } },
        students: {
          where: { student: { familyId } },
          select: { student: { select: { id: true, displayName: true } } },
        },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    });

    return sessions.map((session) => ({
      ...session,
      localStart: DateTime.fromJSDate(session.startsAt, { zone: viewerZone }).toISO(),
      localEnd: DateTime.fromJSDate(session.endsAt, { zone: viewerZone }).toISO(),
      viewerZone,
    }));
  }

  /** Horizon the nightly materialiser works to (TRD section 4.3). */
  get materialiseHorizonDays(): number {
    return SCHEDULE_MATERIALISE_DAYS;
  }
}

function toMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** A malformed query string used to reach Prisma and surface as a 500 (SCH-BE-01). */
function assertRange(from: Date, to: Date): void {
  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    throw AppError.badRequest('`from` and `to` must be valid ISO dates');
  }
  if (to < from) throw AppError.badRequest('`to` must be after `from`');
}

function minutesToDate(minutes: number): Date {
  return new Date(Date.UTC(1970, 0, 1, Math.floor(minutes / 60), minutes % 60));
}

function toHHmm(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
}

export { parseRRule, UnsupportedRecurrenceError };
