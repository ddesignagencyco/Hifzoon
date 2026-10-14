import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';

export interface MonthWindow {
  year: number;
  month: number;
  from: Date;
  to: Date;
}

/**
 * Parent portal read models (FR-PAR-01..07).
 *
 * The portal's job is to answer "how is my child doing" in one screen, which means
 * aggregating across six tables that were each written by a different feature. Two
 * decisions carry most of the weight:
 *
 *   - **One query per concern, run concurrently.** A dashboard that fires fifteen
 *     sequential queries is slow in a way users describe as "the app is broken". The
 *     aggregate is `Promise.all`-ed so the page costs one round trip's latency, not
 *     fifteen.
 *
 *   - **Attended minutes come from `class_participant.minutes_present`, not from
 *     counting `class_student` rows.** A student can be enrolled in a class and never
 *     connect. Attendance is the single most contested number between a school and a
 *     parent, so it is read from the field that is actually written by the classroom
 *     socket rather than recomputed from a booking.
 */
@Injectable()
export class ParentPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  /**
   * The whole portal home screen for one student in one call (FR-PAR-01).
   *
   * Scoped to a single `studentId` and ownership-checked. A multi-child family gets one
   * card per child from the frontend calling this per student, because one aggregated
   * response for a whole family is much harder to reason about when it is wrong.
   */
  async dashboard(userId: string, studentId: string) {
    await this.policy.assertGuardianOwnsStudent(userId, studentId);
    const now = new Date();
    const window = monthWindow(now);

    const [
      student,
      profile,
      upcoming,
      attendance,
      weekTrend,
      cards,
      mistakes,
      goal,
      streak,
      badges,
    ] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          language: true,
          family: {
            select: { id: true, name: true, timeZone: true, country: true, currency: true },
          },
          enrolments: {
            where: { status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] } },
            select: {
              id: true,
              status: true,
              course: { select: { id: true, name: true, code: true } },
              teacher: {
                select: { id: true, photoUrl: true, user: { select: { id: true, name: true } } },
              },
            },
          },
        },
      }),
      this.prisma.studentPageState.aggregate({
        where: { studentId },
        _count: { _all: true },
        _sum: { mistakeCountRecent: true },
      }),
      this.prisma.classSession.findMany({
        where: {
          students: { some: { studentId } },
          startsAt: { gte: now },
          status: 'SCHEDULED',
        },
        orderBy: { startsAt: 'asc' },
        take: 10,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          type: true,
          roomToken: true,
          course: { select: { name: true } },
          teacher: { select: { photoUrl: true, user: { select: { name: true } } } },
        },
      }),
      this.attendanceSummary(studentId, window),
      this.weeklyAttendance(studentId, now),
      this.prisma.lessonCard.findMany({
        where: { studentId, sharedAt: { not: null } },
        orderBy: { sharedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          homework: true,
          parentNote: true,
          sharedAt: true,
          class: { select: { startsAt: true, course: { select: { name: true } } } },
        },
      }),
      this.mistakeBreakdown(studentId, window),
      this.prisma.hifzGoal.findFirst({
        where: { studentId, status: 'ACTIVE' },
        orderBy: { dueOn: 'asc' },
      }),
      this.prisma.streak.findUnique({ where: { studentId } }),
      this.prisma.studentBadge.findMany({
        where: { studentId },
        orderBy: { awardedAt: 'desc' },
        take: 6,
        select: {
          id: true,
          awardedAt: true,
          badge: { select: { code: true, name: true, icon: true } },
        },
      }),
    ]);

    if (!student) throw AppError.notFound('Student');

    return {
      student: {
        id: student.id,
        displayName: student.displayName,
        age: new Date().getUTCFullYear() - student.birthYear,
        language: student.language,
        family: student.family,
      },
      teachers: student.enrolments
        .filter((e) => e.teacher)
        .map((e) => ({
          enrolmentId: e.id,
          status: e.status,
          course: e.course,
          teacher: e.teacher!.user,
          teacherPhotoUrl: e.teacher!.photoUrl,
        })),
      upcomingClasses: upcoming.map((c) => ({
        id: c.id,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        type: c.type,
        courseName: c.course.name,
        teacherName: c.teacher.user.name,
        teacherPhotoUrl: c.teacher.photoUrl,
        // The room token is the credential for the classroom socket, so it is only
        // included once the class is within the early-open window (FR-CLS-01).
        roomToken: isEarlyOpen(c.startsAt, now) ? c.roomToken : null,
      })),
      attendance,
      weekTrend,
      recentLessonCards: cards,
      mistakes,
      hifzGoal: goal,
      streak,
      badges,
      memorisation: {
        pagesTracked: profile._count._all,
        openMistakes: profile._sum.mistakeCountRecent ?? 0,
      },
    };
  }

  /** Attendance for the month (FR-PAR-02). */
  async attendanceSummary(studentId: string, window: MonthWindow) {
    const [booked, present] = await Promise.all([
      this.prisma.classStudent.count({
        where: { studentId, startsAt: { gte: window.from, lt: window.to } },
      }),
      this.prisma.classParticipant.aggregate({
        where: {
          class: {
            students: { some: { studentId } },
            startsAt: { gte: window.from, lt: window.to },
          },
          studentId,
          role: 'STUDENT',
        },
        _sum: { minutesPresent: true },
        _count: { _all: true },
      }),
    ]);

    const minutes = present._sum.minutesPresent ?? 0;
    return {
      bookedClasses: booked,
      attendedClasses: present._count._all,
      // A percentage of a zero denominator is not 100%, it is unknown. Returning null
      // lets the UI say "no classes yet" instead of congratulating a family on a 100%
      // record they did not attend.
      attendanceRate: booked === 0 ? null : Math.round((present._count._all / booked) * 100),
      minutesAttended: minutes,
      window: { from: window.from, to: window.to },
    };
  }

  /** Seven-day attendance series for the dashboard chart (FR-PAR-02, PAR-FE-02). */
  async weeklyAttendance(studentId: string, now: Date) {
    const from = startOfDayUtc(addDays(now, -6));
    const rows = await this.prisma.classParticipant.findMany({
      where: {
        studentId,
        role: 'STUDENT',
        joinedAt: { gte: from },
      },
      select: { joinedAt: true, minutesPresent: true },
      orderBy: { joinedAt: 'asc' },
    });

    const buckets = new Map<string, number>();
    for (let i = 0; i < 7; i += 1) buckets.set(isoDay(addDays(from, i)), 0);
    for (const row of rows) {
      const key = isoDay(row.joinedAt);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.minutesPresent);
    }

    return [...buckets.entries()].map(([day, minutes]) => ({ day, minutes }));
  }

  /**
   * Progress chart for the parent view (FR-PAR-03, PAR-FE-03).
   *
   * Series is derived from `student_page_state`, bucketed by `last_revised_at` month, so
   * it reflects what the spaced-repetition engine actually believes about each page —
   * not a separate counter that drifts out of step with it.
   */
  async progressChart(studentId: string, months = 6) {
    const exists = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!exists) throw AppError.notFound('Student');

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - (months - 1), 1);
    since.setUTCHours(0, 0, 0, 0);

    const states = await this.prisma.studentPageState.findMany({
      where: { studentId },
      select: { state: true, lastRevisedAt: true },
    });

    const series: Array<{ month: string; solid: number; fragile: number; inProgress: number }> = [];
    for (let i = 0; i < months; i += 1) {
      const d = new Date(since);
      d.setUTCMonth(since.getUTCMonth() + i);
      series.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        solid: 0,
        fragile: 0,
        inProgress: 0,
      });
    }

    // A page is only counted in the month it was last worked on; counting it in every
    // month since would make the chart read as a steady accumulation of pages the
    // child is still revising, which is exactly the misunderstanding this chart exists
    // to prevent.
    for (const state of states) {
      if (!state.lastRevisedAt) continue;
      const index = monthIndex(state.lastRevisedAt, since);
      if (index < 0 || index >= series.length) continue;
      if (state.state === 'SOLID') series[index].solid += 1;
      if (state.state === 'FRAGILE') series[index].fragile += 1;
      if (state.state === 'IN_PROGRESS') series[index].inProgress += 1;
    }

    return { studentId, series };
  }

  /** Mistake breakdown for the parent view (FR-PAR-04). */
  async mistakeBreakdown(studentId: string, window: MonthWindow) {
    const rows = await this.prisma.mistake.findMany({
      where: { studentId, occurredAt: { gte: window.from, lt: window.to } },
      select: { type: true, occurredAt: true, dismissedAt: true, confirmed: true, source: true },
    });

    const byType = new Map<string, number>();
    for (const row of rows) byType.set(row.type, (byType.get(row.type) ?? 0) + 1);

    const dismissed = rows.filter((r) => r.dismissedAt !== null);

    return {
      total: rows.length,
      // "Resolved" means a teacher dismissed it, which is a stronger claim than "the
      // child got it right once", so that is what is counted.
      dismissed: dismissed.length,
      // A mistake dismissed in the last week is still in active rotation, so the parent
      // view reports it separately from the historical total.
      recentlyDismissed: dismissed.filter((d) => d.dismissedAt!.getTime() > Date.now() - 7 * 864e5)
        .length,
      pending: rows.length - dismissed.length,
      byType: [...byType.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  /**
   * Monthly report card (FR-PAR-05, PAR-FE-05).
   *
   * Everything here is read-only and derived. The one thing worth calling out: the
   * teacher's qualitative comments come from **shared** lesson cards only. An unshared
   * draft may contain a note the teacher never intended to send, and a monthly report is
   * exactly where it would leak.
   */
  async monthlyReportCard(userId: string, studentId: string, year: number, month: number) {
    await this.policy.assertGuardianOwnsStudent(userId, studentId);
    const window = monthWindow(new Date(Date.UTC(year, month - 1, 1)));

    const [student, attendance, mistakes, cards, goal, grades, teacherReviews] = await Promise.all([
      this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          displayName: true,
          enrolments: {
            where: { status: { in: ['ACTIVE', 'TRIAL'] } },
            select: {
              course: { select: { name: true } },
              teacher: { select: { user: { select: { name: true } } } },
            },
          },
        },
      }),
      this.attendanceSummary(studentId, window),
      this.mistakeBreakdown(studentId, window),
      this.prisma.lessonCard.findMany({
        where: { studentId, sharedAt: { gte: window.from, lt: window.to } },
        orderBy: { sharedAt: 'desc' },
        select: {
          id: true,
          homework: true,
          parentNote: true,
          sharedAt: true,
          class: { select: { startsAt: true, course: { select: { name: true } } } },
        },
      }),
      this.prisma.hifzGoal.findFirst({
        where: { studentId, status: { in: ['ACTIVE', 'ACHIEVED'] }, dueOn: { lt: window.to } },
        orderBy: { dueOn: 'desc' },
      }),
      this.prisma.assessment.findMany({
        where: {
          enrolment: { studentId },
          // `takenAt` is null until the exam actually happened; a pending assessment
          // has no date and would otherwise match every report card period.
          takenAt: { gte: window.from, lt: window.to },
        },
        orderBy: { takenAt: 'desc' },
        select: {
          id: true,
          type: true,
          result: true,
          rubricScores: true,
          takenAt: true,
          level: { select: { name: true } },
        },
      }),
      this.prisma.classReview.findMany({
        where: { studentId, class: { startsAt: { gte: window.from, lt: window.to } } },
        select: { stars: true, comment: true, createdAt: true },
      }),
    ]);

    if (!student) throw AppError.notFound('Student');

    return {
      period: { year, month },
      student: { id: student.id, displayName: student.displayName },
      courses: student.enrolments.map((e) => ({
        name: e.course.name,
        teacherName: e.teacher?.user.name ?? null,
      })),
      attendance,
      mistakes,
      lessonCards: cards,
      hifzGoal: goal,
      assessments: grades,
      // Family feedback on the classes themselves, which is a different signal from
      // teacher feedback on the child.
      familyFeedback: {
        averageStars:
          teacherReviews.length === 0
            ? null
            : Math.round(
                (teacherReviews.reduce((s, r) => s + r.stars, 0) / teacherReviews.length) * 10,
              ) / 10,
        count: teacherReviews.length,
      },
    };
  }
}

// ── helpers ────────────────────────────────────────────────────────────────

function monthWindow(reference: Date): MonthWindow {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth() + 1;
  return {
    year,
    month,
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  };
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function startOfDayUtc(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthIndex(date: Date, since: Date): number {
  return (
    (date.getUTCFullYear() - since.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - since.getUTCMonth())
  );
}

/** Mirrors the classroom's early-open rule so the token is not leaked too early. */
function isEarlyOpen(startsAt: Date, now: Date, minutes = 10): boolean {
  return startsAt.getTime() - now.getTime() <= minutes * 60_000;
}
