import { Injectable, Logger, Optional } from '@nestjs/common';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { ClassReminderService } from '../notifications/class-reminder.service';
import { AppConfigService } from '../../config/app-config.service';
import { leadTrialBooked, leadTrialResult } from '../crm/trial-lead';
import { randomBytes } from 'node:crypto';
import { DateTime } from 'luxon';
import { ErrorCode } from '@hifzoon/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { SettingsService } from '../settings/settings.service';

const TRIAL_MINUTES_DEFAULT = 30;
/** A trial "package" is 3 x 30-minute sessions per calendar week, not a single class. */
const TRIAL_SESSIONS_PER_WEEK = 3;
const CANCELLED_CLASS_STATUSES = new Set(['CANCELLED_FAMILY', 'CANCELLED_TEACHER']);

/**
 * Admissions: trial booking, trial outcome, teacher change requests (FR-ADM-03..07).
 *
 * The design decisions here are mostly about *not losing a family*:
 *
 *   - **A trial booking is one atomic transaction.** The class session, its student
 *     link, the trial enrolment, the CRM stage change and the follow-up task either all
 *     happen or none do. A family that booked a trial but has no enrolment is invisible
 *     in the pipeline; a class with a student and no enrolment teaches a child who
 *     cannot be invoiced.
 *
 *   - **The subscribe token is generated once and never rotated.** It is the family's
 *     key to pay after the trial, so it must survive a password reset and a lost
 *     email. It is opaque and high-entropy, and it is stored only as-is because it is
 *     the *capability*, not a credential that needs protecting from a database read.
 *
 *   - **A teacher change request is not a teacher change.** Requesting one never
 *     mutates the enrolment. An operations decision that unbinds a child's teacher is a
 *     scheduling change with credit implications, and letting a family trigger it
 *     directly is how two children end up on the same slot (FR-SCH-07).
 */
@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    // Optional so unit harnesses without billing still build the service.
    @Optional() private readonly billing?: BillingService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly reminders?: ClassReminderService,
    @Optional() private readonly config?: AppConfigService,
  ) {}

  /**
   * Books a trial: creates the session, links the student, enrols as TRIAL, and moves
   * the linked lead to TRIAL_BOOKED (FR-ADM-03).
   *
   * A teacher is always assigned — `class_session.teacher_id` is NOT NULL because
   * attendance, lesson cards, payroll and QA all key off a session's teacher, and a
   * session with no teacher cannot be paid for or reviewed. When the caller does not
   * name one, the best available match is chosen here rather than leaving it for a
   * human, because an unassigned trial is a trial the family waits on.
   */
  async bookTrial(input: {
    studentId: string;
    courseId: string;
    startsAt: Date;
    actorId: string;
    teacherId?: string;
    leadId?: string;
    notes?: string;
  }) {
    const enabled = await this.settings.getBoolean('platform.trial.enabled');
    if (!enabled) {
      throw new AppError('FORBIDDEN', 'Trial booking is disabled on this deployment');
    }

    const minutes = await this.settings.getNumber('trial.default_duration_minutes');
    const duration = Number.isFinite(minutes) && minutes > 0 ? minutes : TRIAL_MINUTES_DEFAULT;
    const endsAt = new Date(input.startsAt.getTime() + duration * 60_000);

    if (input.startsAt.getTime() < Date.now() - 60_000) {
      throw AppError.badRequest('A trial cannot start in the past');
    }
    if (endsAt <= input.startsAt) {
      throw AppError.badRequest('A trial must end after it starts');
    }

    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      include: { family: { select: { id: true, name: true } } },
    });
    if (!student) throw AppError.notFound('Student');

    const course = await this.prisma.course.findUnique({ where: { id: input.courseId } });
    if (!course || !course.active) throw AppError.notFound('Course');

    // A child already enrolled in this course doesn't need a trial: booking one minted a
    // second enrolment that the result then turned ACTIVE, so the same course showed up
    // two or three times with the same teacher.
    const enrolled = await this.prisma.enrolment.findFirst({
      where: { studentId: input.studentId, courseId: input.courseId, status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { id: true },
    });
    if (enrolled) {
      throw AppError.conflict(
        'CONFLICT',
        `${student.displayName} is already enrolled in ${course.name}, so no trial is needed. Book a regular class instead.`,
        { enrolmentId: enrolled.id },
      );
    }

    // A trial is a package of up to TRIAL_SESSIONS_PER_WEEK sessions per calendar week,
    // not a single class (FR-ADM-03). A student's existing TRIAL enrolment for this
    // course is reused across the week's bookings — rather than minting a new one each
    // time — so the eventual outcome (won/lost) is recorded once against one enrolment,
    // not fragmented across three.
    const existingTrial = await this.prisma.enrolment.findFirst({
      where: { studentId: input.studentId, courseId: input.courseId, status: 'TRIAL' },
      include: {
        classes: {
          include: { class: { select: { id: true, startsAt: true, status: true } } },
        },
      },
    });

    const weekStart = DateTime.fromJSDate(input.startsAt).startOf('week').toJSDate();
    const weekEnd = DateTime.fromJSDate(input.startsAt).endOf('week').toJSDate();

    if (existingTrial) {
      const sessionsThisWeek = existingTrial.classes
        .map((c) => c.class)
        .filter(
          (s) =>
            !CANCELLED_CLASS_STATUSES.has(s.status) &&
            s.startsAt.getTime() >= weekStart.getTime() &&
            s.startsAt.getTime() <= weekEnd.getTime(),
        );

      if (sessionsThisWeek.length >= TRIAL_SESSIONS_PER_WEEK) {
        throw AppError.conflict(
          'CONFLICT',
          `${student.displayName} already has ${TRIAL_SESSIONS_PER_WEEK} trial sessions booked for the week of ${weekStart.toISOString().slice(0, 10)}`,
          { enrolmentId: existingTrial.id, weekStart, weekEnd },
        );
      }
    }

    const teacherId =
      input.teacherId ??
      existingTrial?.teacherId ??
      (await this.pickTrialTeacher(student, course.code));
    if (!teacherId) {
      throw new AppError(
        'DEPENDENCY_UNAVAILABLE',
        'No teacher is currently cleared and available to take a trial',
        { courseId: input.courseId, startsAt: input.startsAt },
      );
    }

    const classSession = await this.prisma.$transaction(async (tx) => {
      const session = await tx.classSession.create({
        data: {
          type: 'TRIAL',
          startsAt: input.startsAt,
          endsAt,
          status: 'SCHEDULED',
          courseId: input.courseId,
          teacherId,
        },
      });

      // The enrolment is what makes the student billable and reportable. Creating the
      // link before the enrolment and patching it after is deliberate: enrolment_id is
      // part of the unique key for the link, so it cannot be set in the same insert.
      //
      // The 2nd and 3rd session of a trial week reuse the 1st session's enrolment
      // (`existingTrial`, resolved above) rather than minting a new one, so the whole
      // week's package converges on a single enrolment and a single eventual outcome.
      const enrolment =
        existingTrial ??
        (await tx.enrolment.create({
          data: {
            studentId: input.studentId,
            courseId: input.courseId,
            teacherId,
            status: 'TRIAL',
            startedAt: input.startsAt,
          },
        }));

      await tx.classStudent.create({
        data: {
          classId: session.id,
          studentId: input.studentId,
          startsAt: input.startsAt,
          endsAt,
          enrolmentId: enrolment.id,
        },
      });

      if (input.leadId) {
        await tx.lead.update({
          where: { id: input.leadId },
          data: { status: 'TRIAL_BOOKED', trialClassId: session.id, familyId: student.familyId },
        });

        await tx.task.create({
          data: {
            leadId: input.leadId,
            type: 'OTHER',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            note: `Trial booked for ${student.displayName}`,
          },
        });
      }

      return session;
    });

    // M61 — a trial booked by the academy reaches the family like one they booked
    // themselves: a confirmation now, and the day-before and 15-minute reminders.
    await this.notifyTrialBooked(classSession.id).catch((err) =>
      this.logger.warn(`Trial ${classSession.id} booked but the family was not notified: ${(err as Error).message}`),
    );

    if (!input.leadId) {
      // No lead picked: find the family's open lead, or open one, so every trial is in the
      // CRM. Outside the booking transaction: a CRM hiccup must not cancel the trial.
      await leadTrialBooked(this.prisma, { classId: classSession.id, studentId: input.studentId, source: null }).catch((err) =>
        this.logger.warn(`CRM lead not updated for trial ${classSession.id}: ${(err as Error).message}`),
      );
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'adm.trial.book',
      targetType: 'class_session',
      targetId: classSession.id,
      after: {
        studentId: input.studentId,
        courseId: input.courseId,
        teacherId,
        startsAt: input.startsAt,
      },
    });

    return classSession;
  }

  /**
   * Chooses a trial teacher when the caller did not.
   *
   * Scoring is intentionally boring and explainable: the student's own language is a
   * hard filter (a child who cannot follow the explanation does not benefit from a
   * higher-rated teacher), then a matched gender, then a shared teaching weekday, then
   * rating. Rating comes last on purpose — it should never outrank being able to
   * communicate with the child.
   */
  private async pickTrialTeacher(
    student: { language: string; gender: string },
    courseCode: string,
  ): Promise<string | null> {
    const candidates = await this.prisma.teacherProfile.findMany({
      where: { readyToMatch: true, hiringStatus: 'APPROVED', languages: { has: student.language } },
      select: {
        id: true,
        gender: true,
        subjects: true,
        ratingAvg: true,
        ratingCount: true,
        // Only hours still in effect: past months' rows say nothing about who is free now.
        availability: {
          where: { OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
          select: { weekday: true },
        },
      },
      take: 100,
    });

    const scored = candidates
      .map((teacher) => {
        let score = 0;
        if (teacher.gender && teacher.gender === student.gender) score += 50;
        if (teacher.subjects.includes(courseCode)) score += 20;
        score += teacher.availability.length * 2;
        // A teacher with one 5-star review should not outrank one with forty, so the
        // rating is damped by its sample size.
        score += Number(teacher.ratingAvg) * Math.min(teacher.ratingCount, 40) * 0.1;
        return { id: teacher.id, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored[0]?.id ?? null;
  }

  /** A teacher may only record the result of a trial they taught; staff may record any. */
  private async assertMayRecordOutcome(
    teacherProfileId: string,
    actorId: string,
    actorRoles?: string[],
  ) {
    // No roles means an internal caller (a job, a test harness), not a request.
    if (!actorRoles || actorRoles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')) return;
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherProfileId },
      select: { userId: true },
    });
    if (teacher?.userId !== actorId) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only the teacher of this trial can record its result');
    }
  }

  private async notifyTrialBooked(classId: string) {
    if (!this.notifications) return;
    await this.reminders?.planForClass(classId);
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        startsAt: true,
        teacher: { select: { user: { select: { name: true } } } },
        students: {
          select: {
            student: {
              select: { displayName: true, timeZone: true, family: { select: { timeZone: true, members: { select: { userId: true } } } } },
            },
          },
        },
      },
    });
    const student = session?.students[0]?.student;
    if (!session || !student) return;
    const zone = student.family.timeZone ?? student.timeZone ?? 'UTC';
    await this.notifications.enqueue({
      userIds: student.family.members.map((m) => m.userId),
      template: TEMPLATE.TRIAL_BOOKED_BY_ACADEMY,
      data: {
        studentName: student.displayName,
        teacherName: session.teacher.user.name,
        localTime: DateTime.fromJSDate(session.startsAt, { zone }).toFormat('ccc d LLL, HH:mm'),
        timeZone: zone,
        joinUrl: `${(this.config?.value.APP_WEB_URL ?? '').replace(/\/$/, '')}/classroom/${classId}`,
      },
    });
  }

  /**
   * Trial classes in a window with their saved result and CRM lead — the admin's list of
   * trials to record. Replaces reading every teacher's timetable in the browser, which
   * missed teachers outside the public directory and anything booked after the page loaded.
   */
  async listTrials(range: { from: Date; to: Date }) {
    const sessions = await this.prisma.classSession.findMany({
      where: { type: 'TRIAL', startsAt: { gte: range.from, lte: range.to } },
      orderBy: { startsAt: 'desc' },
      take: 300,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        course: { select: { id: true, code: true, name: true } },
        teacher: { select: { id: true, user: { select: { name: true } } } },
        students: {
          select: {
            enrolmentId: true,
            student: { select: { id: true, displayName: true, familyId: true, family: { select: { name: true } } } },
          },
        },
      },
    });
    const classIds = sessions.map((s) => s.id);
    const enrolmentIds = [...new Set(sessions.flatMap((s) => s.students.map((x) => x.enrolmentId)).filter((x): x is string => Boolean(x)))];
    const familyIds = [...new Set(sessions.flatMap((s) => s.students.map((x) => x.student.familyId)))];
    const [outcomes, leads] = await Promise.all([
      this.prisma.trialOutcome.findMany({
        where: { OR: [{ classId: { in: classIds } }, { enrolmentId: { in: enrolmentIds } }] },
        select: { classId: true, enrolmentId: true, completedAt: true, enrolment: { select: { status: true } } },
      }),
      this.prisma.lead.findMany({
        where: { OR: [{ trialClassId: { in: classIds } }, { familyId: { in: familyIds } }] },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, contactName: true, trialClassId: true, familyId: true },
      }),
    ]);

    return sessions.map((s) => {
      const enrolment = s.students.map((x) => x.enrolmentId).find(Boolean);
      const familyId = s.students[0]?.student.familyId;
      const outcome = outcomes.find((o) => (enrolment && o.enrolmentId === enrolment) || o.classId === s.id);
      const lead = leads.find((l) => l.trialClassId === s.id) ?? leads.find((l) => familyId && l.familyId === familyId);
      return {
        id: s.id,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        course: s.course,
        teacherId: s.teacher.id,
        teacherName: s.teacher.user.name,
        familyName: s.students[0]?.student.family.name ?? null,
        students: s.students.map((x) => ({ student: { id: x.student.id, displayName: x.student.displayName } })),
        result: outcome
          ? { won: outcome.enrolment ? outcome.enrolment.status !== 'CANCELLED' : null, savedAt: outcome.completedAt }
          : null,
        lead: lead ? { id: lead.id, status: lead.status, contactName: lead.contactName } : null,
      };
    });
  }

  /** The outcome recorded for a trial class (its package), or null. */
  private async outcomeForClass(classId: string) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: { teacherId: true, type: true, students: { select: { enrolmentId: true } } },
    });
    if (!session || session.type !== 'TRIAL') throw AppError.notFound('Trial class');
    const linked = [...new Set(session.students.map((s) => s.enrolmentId).filter(Boolean))];
    const outcome =
      linked.length === 1
        ? await this.prisma.trialOutcome.findFirst({ where: { enrolmentId: linked[0] as string } })
        : await this.prisma.trialOutcome.findFirst({ where: { classId } });
    return { session, outcome };
  }

  async getTrialOutcome(classId: string, actorId: string, actorRoles: string[]) {
    const { session, outcome } = await this.outcomeForClass(classId);
    await this.assertMayRecordOutcome(session.teacherId, actorId, actorRoles);
    if (!outcome) return null;
    const enrolment = outcome.enrolmentId
      ? await this.prisma.enrolment.findUnique({
          where: { id: outcome.enrolmentId },
          select: { status: true, subscriptionId: true },
        })
      : null;
    return {
      ...outcome,
      won: enrolment ? enrolment.status !== 'CANCELLED' : null,
      subscribed: Boolean(enrolment?.subscriptionId),
    };
  }

  /**
   * Corrects the level, plan or notes of a saved result (R11). The won/lost result stays,
   * and once the family has subscribed the offer is history and can no longer change.
   */
  async editTrialOutcome(input: {
    classId: string;
    actorId: string;
    actorRoles: string[];
    placementLevelId?: string | null;
    recommendedPlanId?: string | null;
    notes?: string | null;
  }) {
    const { session, outcome } = await this.outcomeForClass(input.classId);
    await this.assertMayRecordOutcome(session.teacherId, input.actorId, input.actorRoles);
    if (!outcome) throw AppError.notFound('Trial outcome');
    if (outcome.enrolmentId) {
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: outcome.enrolmentId },
        select: { subscriptionId: true },
      });
      if (enrolment?.subscriptionId) {
        throw new AppError(ErrorCode.CONFLICT, 'The family has already subscribed from this result');
      }
    }
    const updated = await this.prisma.trialOutcome.update({
      where: { id: outcome.id },
      data: {
        ...(input.placementLevelId !== undefined ? { placementLevelId: input.placementLevelId } : {}),
        ...(input.recommendedPlanId !== undefined ? { recommendedPlanId: input.recommendedPlanId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.audit.record({
      actorId: input.actorId,
      action: 'adm.trial.outcome.edit',
      targetType: 'trial_outcome',
      targetId: outcome.id,
      before: {
        placementLevelId: outcome.placementLevelId,
        recommendedPlanId: outcome.recommendedPlanId,
        notes: outcome.notes,
      },
      after: {
        placementLevelId: updated.placementLevelId,
        recommendedPlanId: updated.recommendedPlanId,
        notes: updated.notes,
      },
    });
    return updated;
  }

  /**
   * Publishes the trial result and returns the family's subscribe link (FR-ADM-04).
   *
   * `subscribeToken` is generated once per trial *package* (one enrolment, up to 3
   * sessions/week), not per class — a trial can be won or lost after its 1st, 2nd or
   * 3rd session, and recording it against whichever class triggered the call must not
   * mint a second outcome for the other sessions in the same week. If an operator loses
   * the link, the remedy is to resend the same token — never to mint a second one,
   * because two valid tokens for one trial would let the trial be converted twice.
   */
  async completeTrialOutcome(input: {
    classId: string;
    actorId: string;
    actorRoles?: string[];
    placementLevelId?: string;
    recommendedPlanId?: string;
    notes?: string;
    won: boolean;
    lostReason?: string;
  }) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      include: {
        students: { select: { studentId: true, enrolmentId: true } },
      },
    });
    if (!session) throw AppError.notFound('Class');
    if (session.type !== 'TRIAL') {
      throw AppError.badRequest('That class is not a trial', { type: session.type });
    }
    await this.assertMayRecordOutcome(session.teacherId, input.actorId, input.actorRoles);

    // B24 — an outcome is a record of a class that happened. Recording one for a trial that
    // has not run yet (or was cancelled) fabricates evidence about a child, and marks a
    // future class COMPLETED.
    if (session.startsAt > new Date()) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This trial has not happened yet, so it has no outcome',
        { classId: session.id, startsAt: session.startsAt.toISOString() },
      );
    }
    if (session.status === 'CANCELLED_FAMILY' || session.status === 'CANCELLED_TEACHER') {
      throw new AppError(ErrorCode.CONFLICT, `This trial was cancelled (${session.status})`, {
        classId: session.id,
      });
    }

    // Scoped to *this* class's enrolments. Matching on the student alone flipped every
    // TRIAL enrolment the child happened to hold — including courses this trial had
    // nothing to do with — to ACTIVE or CANCELLED (B24).
    //
    // A single linked enrolment is the normal case (one trial package = one enrolment,
    // reused across the week's sessions by `bookTrial`) and is what the outcome keys on.
    // Zero or several linked enrolments is the legacy/ambiguous case — predates per-class
    // enrolment links, or a class batches students across enrolments — where there is no
    // one enrolment to key on, so idempotency falls back to the old per-class check.
    const linked = Array.from(
      new Set(
        session.students
          .map((s) => s.enrolmentId)
          .filter((id): id is string => typeof id === 'string'),
      ),
    );
    const enrolmentId = linked.length === 1 ? linked[0] : null;

    const existing = enrolmentId
      ? await this.prisma.trialOutcome.findFirst({ where: { enrolmentId } })
      : await this.prisma.trialOutcome.findFirst({ where: { classId: input.classId } });
    if (existing) {
      // Idempotent by design: the follow-up team clicks "send the offer" more than once
      // (or the family's 2nd/3rd trial session of the week also gets completed) and must
      // not get a second token or a second placement level.
      return { outcome: existing, subscribeToken: existing.subscribeToken, alreadyRecorded: true };
    }

    const enrolments =
      linked.length > 0
        ? { id: { in: linked }, status: 'TRIAL' as const }
        : {
            studentId: { in: session.students.map((s) => s.studentId) },
            courseId: session.courseId,
            status: 'TRIAL' as const,
          };

    const outcome = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trialOutcome.create({
        data: {
          classId: input.classId,
          enrolmentId,
          placementLevelId: input.placementLevelId ?? null,
          recommendedPlanId: input.recommendedPlanId ?? null,
          notes: input.notes ?? null,
          subscribeToken: randomBytes(24).toString('hex'),
        },
      });

      await tx.classSession.update({
        where: { id: input.classId },
        data: { status: 'COMPLETED' },
      });

      // Losing a trial is as important to record as winning one, and the enquiry team
      // is the only thing that can act on it.
      await tx.enrolment.updateMany({
        where: enrolments,
        data: { status: input.won ? 'ACTIVE' : 'CANCELLED' },
      });

      return created;
    });

    await this.audit.record({
      actorId: input.actorId,
      action: input.won ? 'adm.trial.won' : 'adm.trial.lost',
      targetType: 'trial_outcome',
      targetId: outcome.id,
      after: {
        classId: input.classId,
        placementLevelId: outcome.placementLevelId,
        lostReason: input.lostReason ?? null,
      },
    });

    // Move the family's lead: continuing → trial done (until they pay), not continuing → lost.
    // The result is already saved; a CRM problem is logged, never surfaced as a failure.
    try {
      const family = await this.prisma.classStudent.findFirst({
        where: { classId: input.classId },
        select: { student: { select: { familyId: true } } },
      });
      if (family) {
        await leadTrialResult(this.prisma, {
          classId: input.classId,
          familyId: family.student.familyId,
          won: input.won,
          lostReason: input.lostReason ?? null,
        });
      }
    } catch (err) {
      this.logger.warn(`CRM lead not updated for trial ${input.classId}: ${(err as Error).message}`);
    }

    return { outcome, subscribeToken: outcome.subscribeToken, alreadyRecorded: false };
  }

  /**
   * Family requests a different teacher (FR-ADM-05).
   *
   * Records the request and notifies operations. It does not reassign anything: see
   * the class doc comment. The one open request per family+student rule is enforced
   * here rather than by a partial index, because the meaningful key is the *open*
   * status and PostgreSQL partial indexes over enums are brittle to maintain.
   */
  async requestTeacherChange(input: {
    familyId: string;
    studentId: string;
    reason: string;
    actorId: string;
  }) {
    await this.policy.assertGuardianInFamily(input.actorId, input.familyId);

    const student = await this.prisma.student.findUnique({
      where: { id: input.studentId },
      select: {
        id: true,
        familyId: true,
        displayName: true,
        enrolments: { select: { id: true, status: true } },
      },
    });
    if (!student || student.familyId !== input.familyId) {
      throw AppError.forbidden('That student does not belong to your family');
    }

    const enrolment = student.enrolments.find((e) => e.status === 'ACTIVE' || e.status === 'TRIAL');
    if (!enrolment) {
      throw AppError.badRequest('That student has no active enrolment to change a teacher for');
    }

    const open = await this.prisma.teacherChangeRequest.findFirst({
      where: { studentId: input.studentId, status: 'OPEN' },
    });
    if (open) {
      throw AppError.conflict(
        'CONFLICT',
        'A teacher change request is already open for this student',
        {
          requestId: open.id,
        },
      );
    }

    const request = await this.prisma.teacherChangeRequest.create({
      data: {
        familyId: input.familyId,
        studentId: input.studentId,
        enrolmentId: enrolment.id,
        reason: input.reason,
        status: 'OPEN',
      },
    });

    await this.audit.record({
      actorId: input.actorId,
      action: 'adm.teacherChange.request',
      targetType: 'teacher_change_request',
      targetId: request.id,
      after: { studentId: input.studentId, reason: input.reason },
    });

    return request;
  }

  /** Operations resolves a teacher change request (FR-ADM-05, OPS-FE-07). */
  async resolveTeacherChange(input: {
    requestId: string;
    status: 'APPROVED' | 'DECLINED' | 'CANCELLED';
    /** B10 — approving a change names the successor; without one the child has no teacher. */
    newTeacherId?: string;
    resolutionNote?: string;
    actorId: string;
  }) {
    const request = await this.prisma.teacherChangeRequest.findUnique({
      where: { id: input.requestId },
    });
    if (!request) throw AppError.notFound('Teacher change request');
    if (request.status !== 'OPEN') {
      throw AppError.conflict('CONFLICT', `Request is already ${request.status}`, {
        id: request.id,
      });
    }

    // The successor has to be a real, cleared teacher before anything is moved onto them.
    if (input.newTeacherId) {
      const successor = await this.prisma.teacherProfile.findUnique({
        where: { id: input.newTeacherId },
        select: { id: true, readyToMatch: true, hiringStatus: true },
      });
      if (!successor) throw AppError.notFound('Teacher');
      if (!successor.readyToMatch || successor.hiringStatus !== 'APPROVED') {
        throw new AppError(
          ErrorCode.VALIDATION_FAILED,
          'That teacher is not cleared to be matched (FR-TCH-02)',
          { field: 'newTeacherId' },
        );
      }
    }

    const previousTeacherId =
      (await this.prisma.enrolment.findUnique({ where: { id: request.enrolmentId }, select: { teacherId: true } }))?.teacherId ?? null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.status === 'APPROVED' && input.newTeacherId) {
        // The relationship moves first: the enrolment is what every ownership check
        // reads, so a class moved before it would briefly belong to a teacher who has no
        // claim on the child.
        await tx.enrolment.updateMany({
          where: { id: request.enrolmentId },
          data: { teacherId: input.newTeacherId },
        });

        // The weekly schedule follows too, or the next materialised classes go back to the
        // old teacher.
        await tx.recurringSchedule.updateMany({
          where: { enrolmentId: request.enrolmentId, status: { not: 'ENDED' } },
          data: { teacherId: input.newTeacherId },
        });

        // Future classes follow, or the child turns up in the old teacher's room next
        // week. Past classes are left alone: attendance, lesson cards and payroll for a
        // class that has happened belong to the teacher who taught it.
        await tx.classSession.updateMany({
          where: {
            startsAt: { gt: new Date() },
            status: 'SCHEDULED',
            students: { some: { studentId: request.studentId } },
          },
          data: { teacherId: input.newTeacherId },
        });
      }

      return tx.teacherChangeRequest.update({
        where: { id: input.requestId },
        data: {
          status: input.status,
          resolvedById: input.actorId,
          resolvedAt: new Date(),
          resolutionNote: input.resolutionNote?.trim() || null,
        },
      });
    });

    // Tier pricing: a teacher of another tier changes the price from the next period.
    if (input.status === 'APPROVED' && input.newTeacherId && this.billing) {
      await this.billing
        .repriceForTeacher(request.enrolmentId, input.newTeacherId, input.actorId)
        .catch((error: Error) =>
          this.logger.error(`Repricing after teacher change ${request.id} failed: ${error.message}`),
        );
    }

    await this.audit.record({
      actorId: input.actorId,
      action: `adm.teacherChange.${input.status}`,
      targetType: 'teacher_change_request',
      targetId: request.id,
      before: { status: request.status },
      after: { status: updated.status, newTeacherId: input.newTeacherId ?? null },
    });

    // M58 — the family, and on approval both teachers, hear the outcome.
    await this.notifyTeacherChange({
      enrolmentId: request.enrolmentId,
      outcome: input.status === 'APPROVED' ? 'approved' : input.status === 'DECLINED' ? 'declined' : 'cancelled',
      note: input.resolutionNote ?? null,
      newTeacherId: input.status === 'APPROVED' ? (input.newTeacherId ?? null) : null,
      oldTeacherId: input.status === 'APPROVED' ? previousTeacherId : null,
    }).catch((err) => this.logger.warn(`Teacher-change ${request.id} resolved but not notified: ${(err as Error).message}`));

    return updated;
  }

  /** M58 — a guardian withdraws their own request while it is still open. */
  async cancelOwnTeacherChange(requestId: string, userId: string) {
    const request = await this.prisma.teacherChangeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw AppError.notFound('Teacher change request');
    const member = await this.prisma.familyMember.findFirst({ where: { familyId: request.familyId, userId }, select: { id: true } });
    if (!member) throw AppError.forbidden('You can only withdraw your own family’s requests');
    if (request.status !== 'OPEN') {
      throw AppError.conflict('CONFLICT', `Request is already ${request.status.toLowerCase()}`, { id: request.id });
    }
    return this.prisma.teacherChangeRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', resolvedById: userId, resolvedAt: new Date(), resolutionNote: 'Withdrawn by the family' },
    });
  }

  /**
   * M60 — moves an enrolment to another teacher directly (the academy's own decision, or a
   * family asking by phone): the enrolment, its weekly schedule and future classes move;
   * past classes stay with the teacher who taught them. Any open request is closed.
   */
  async changeEnrolmentTeacher(input: { enrolmentId: string; teacherId: string; note?: string; actorId: string }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: { id: true, teacherId: true, studentId: true, student: { select: { familyId: true } } },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');
    if (enrolment.teacherId === input.teacherId) {
      throw AppError.badRequest('That is already the teacher for this enrolment');
    }
    const open = await this.prisma.teacherChangeRequest.findFirst({
      where: { enrolmentId: enrolment.id, status: 'OPEN' },
      select: { id: true },
    });
    if (open) {
      return this.resolveTeacherChange({
        requestId: open.id,
        status: 'APPROVED',
        newTeacherId: input.teacherId,
        resolutionNote: input.note,
        actorId: input.actorId,
      });
    }
    const request = await this.prisma.teacherChangeRequest.create({
      data: {
        familyId: enrolment.student.familyId,
        studentId: enrolment.studentId,
        enrolmentId: enrolment.id,
        reason: input.note?.trim() || 'Changed by the academy',
      },
    });
    return this.resolveTeacherChange({
      requestId: request.id,
      status: 'APPROVED',
      newTeacherId: input.teacherId,
      resolutionNote: input.note,
      actorId: input.actorId,
    });
  }

  private async notifyTeacherChange(input: {
    enrolmentId: string;
    outcome: 'approved' | 'declined' | 'cancelled';
    note: string | null;
    newTeacherId: string | null;
    oldTeacherId: string | null;
  }) {
    if (!this.notifications) return;
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        course: { select: { name: true } },
        student: { select: { displayName: true, family: { select: { members: { select: { userId: true } } } } } },
      },
    });
    if (!enrolment) return;
    const teachers = await this.prisma.teacherProfile.findMany({
      where: { id: { in: [input.newTeacherId, input.oldTeacherId].filter((x): x is string => Boolean(x)) } },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    const newTeacher = teachers.find((t) => t.id === input.newTeacherId);
    const outcome = input.outcome === 'approved' && newTeacher ? `approved — the new teacher is ${newTeacher.user.name}` : input.outcome;
    const data = {
      studentName: `${enrolment.student.displayName} (${enrolment.course.name})`,
      outcome,
      resolutionNote: input.note,
    };
    await this.notifications.enqueue({
      userIds: [...enrolment.student.family.members.map((m) => m.userId), ...teachers.map((t) => t.userId)],
      template: TEMPLATE.TEACHER_CHANGE_RESOLVED,
      data,
    });
  }

  /**
   * Operations queue for teacher change requests (OPS-FE-07).
   *
   * `teacher_change_request` holds only `student_id` with no relation to `student`, so
   * the child's name is resolved in a second query rather than a join. That is a
   * deliberate trade: the request table is tiny and written once, and adding a relation
   * here would put a cascade from the safeguarding-adjacent table onto the student
   * record.
   */
  async listTeacherChanges(
    status?: 'OPEN' | 'APPROVED' | 'DECLINED' | 'CANCELLED',
    subject?: { userId: string; roles: string[] },
  ) {
    // M15 — staff see the operations queue; anyone else sees only their own family's.
    // NFR-SEC-02: the row set is derived from the caller, never from a query parameter.
    const scope: Record<string, unknown> = {};
    if (subject && !subject.roles.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role))) {
      const families = await this.prisma.familyMember.findMany({
        where: { userId: subject.userId },
        select: { familyId: true },
      });
      scope.familyId = { in: families.map((f) => f.familyId) };
    }

    const requests = await this.prisma.teacherChangeRequest.findMany({
      where: { ...(status ? { status } : {}), ...scope },
      include: {
        family: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const students = await this.prisma.student.findMany({
      where: { id: { in: requests.map((r) => r.studentId) } },
      select: { id: true, displayName: true },
    });
    const names = new Map(students.map((s) => [s.id, s.displayName]));

    return requests.map((r) => ({ ...r, studentName: names.get(r.studentId) ?? null }));
  }
}
