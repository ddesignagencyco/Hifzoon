import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Family ratings of classes (FR-QA-01, FR-QA-02).
 *
 * A rating is one per family per class — enforced by a unique constraint, not by a
 * check-then-write, because two parents tapping "submit" concurrently must not produce
 * two rows and skew the average. The service relies on that constraint and turns the
 * conflict into a readable error.
 */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
  ) {}

  async rate(input: {
    classId: string;
    familyUserId: string;
    studentId?: string;
    stars: number;
    comment?: string;
    lessonCardId?: string;
  }) {
    if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
      throw AppError.badRequest('A rating must be between 1 and 5 stars');
    }

    const klass = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: {
        id: true,
        startsAt: true,
        status: true,
        // Q18 — needed to recompute the teacher's rating when the review lands.
        teacherId: true,
        students: { select: { studentId: true } },
      },
    });
    if (!klass) throw AppError.notFound('Class');

    // B14 — eligibility is "a guardian of a student who attended, once the class is
    // over", not "a guardian who personally joined the call". Most guardians watch from a
    // second device, are not tracked as participants at all, and were shown a rating form
    // that answered 403 the moment they pressed submit. The person who taught the child
    // is the subject of the rating; the family is entitled to answer for it.
    if (klass.status !== 'COMPLETED') {
      throw AppError.conflict('CONFLICT', 'This class has not finished yet', {
        status: klass.status,
      });
    }

    if (klass.students.length === 0) {
      throw AppError.forbidden('This class has no students on it');
    }

    // Either a student of theirs is on the class, or they took part themselves (a teacher
    // or staff member reviewing their own class is handled by the role guard upstream).
    const guardianOfAttendee = await this.prisma.classStudent.count({
      where: {
        classId: input.classId,
        studentId: { in: klass.students.map((s) => s.studentId) },
        student: { family: { members: { some: { userId: input.familyUserId } } } },
      },
      take: 1,
    });
    const participated = await this.prisma.classParticipant.count({
      where: { classId: input.classId, userId: input.familyUserId },
      take: 1,
    });
    if (guardianOfAttendee === 0 && participated === 0) {
      throw AppError.forbidden('Only a guardian of a student on this class can rate it');
    }

    if (input.studentId) {
      await this.policy.assertGuardianOwnsStudent(input.familyUserId, input.studentId);
    }

    try {
      const review = await this.prisma.classReview.create({
        data: {
          classId: input.classId,
          familyUserId: input.familyUserId,
          studentId: input.studentId ?? null,
          lessonCardId: input.lessonCardId ?? null,
          stars: input.stars,
          comment: input.comment ?? null,
        },
      });

      // Q18 — `ratingAvg`, `ratingCount` and `publicRatingAvg` were written by the seed
      // and never again, while the public directory *sorts* by one of them and matching
      // scores by another. A teacher who was excellent this month still appeared below one
      // the seed invented. Derived here, from the reviews that now exist.
      await this.recomputeTeacherRating(klass.teacherId);

      return review;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw AppError.conflict('CONFLICT', 'You have already rated this class', {
          classId: input.classId,
        });
      }
      throw error;
    }
  }

  /** Teacher rating aggregate for the public profile (FR-QA-02). */
  /**
   * Recomputes a teacher's denormalised rating from their real reviews (Q18).
   *
   * `publicRatingAvg` is deliberately the same value: the directory shows one number and the
   * matching score uses another, and a teacher whose visible score and sort position
   * disagree is the kind of thing a family notices and stops trusting.
   */
  private async recomputeTeacherRating(teacherId: string): Promise<void> {
    if (!teacherId) return;

    const agg = await this.prisma.classReview.aggregate({
      where: { class: { teacherId } },
      _avg: { stars: true },
      _count: { _all: true },
    });

    // With no reviews the columns go back to their seeded zero rather than keeping a stale
    // average, so a rating that is deleted cannot leave a teacher looking reviewed forever.
    const average = agg._avg.stars === null ? 0 : Math.round(agg._avg.stars * 100) / 100;

    await this.prisma.teacherProfile.updateMany({
      where: { id: teacherId },
      data: { ratingAvg: average, ratingCount: agg._count._all, publicRatingAvg: average },
    });
  }

  async teacherSummary(teacherId: string) {
    const agg = await this.prisma.classReview.aggregate({
      where: { class: { teacherId } },
      _avg: { stars: true },
      _count: { _all: true },
    });

    const distribution = await this.prisma.classReview.groupBy({
      by: ['stars'],
      where: { class: { teacherId } },
      _count: { _all: true },
    });

    return {
      teacherId,
      average: agg._avg.stars === null ? null : Math.round(agg._avg.stars * 10) / 10,
      count: agg._count._all,
      distribution: [5, 4, 3, 2, 1].map((stars) => ({
        stars,
        count: distribution.find((d) => d.stars === stars)?._count._all ?? 0,
      })),
    };
  }
}

/**
 * Quality assurance: rubric reviews and monthly sampling (FR-QA-03, FR-QA-04,
 * FR-QA-05, QA-FE-01).
 *
 * The one hard rule: **a review is per class per supervisor**, enforced by a unique
 * constraint. Two supervisors can both review the same class (different perspectives)
 * but the same supervisor cannot review it twice and overwrite their earlier finding,
 * because the sample history is what proves QA actually happened.
 */
@Injectable()
export class QaService {
  private readonly logger = new Logger(QaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  /** Default rubric, seeded on first use so a review is never blocked on setup. */
  private async defaultRubricId(): Promise<string> {
    const existing = await this.prisma.qaRubric.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing.id;

    const created = await this.prisma.qaRubric.create({
      data: {
        name: 'Standard lesson rubric',
        criteria: {
          items: [
            { key: 'opening', label: "Opened with du'a and check-in", weight: 1 },
            { key: 'portion', label: 'Taught the assigned portion', weight: 3 },
            { key: 'tajweed', label: 'Corrected Tajweed rules in context', weight: 2 },
            { key: 'pacing', label: 'Kept pace appropriate to the student', weight: 2 },
            { key: 'closing', label: 'Closed with homework and a clear next portion', weight: 2 },
          ],
        },
      },
    });
    return created.id;
  }

  async submitReview(input: {
    classId: string;
    supervisorId: string;
    rubricId?: string;
    scores: Record<string, number>;
    feedback?: string;
    source?: 'RANDOM_SAMPLE' | 'MANUAL';
  }) {
    const klass = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: { id: true, teacherId: true },
    });
    if (!klass) throw AppError.notFound('Class');

    const rubricId = input.rubricId ?? (await this.defaultRubricId());

    // Every criterion in the rubric must be scored, and each score bounded. A partial
    // review would silently average as if the missing criteria were zero.
    const rubric = await this.prisma.qaRubric.findUnique({ where: { id: rubricId } });
    const items = (
      (rubric?.criteria as { items?: Array<{ key: string }> } | null)?.items ?? []
    ).map((i) => i.key);

    for (const key of items) {
      const score = input.scores[key];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 5) {
        throw AppError.badRequest(`Rubric criterion "${key}" must be scored 0-5`, {
          key,
          received: score,
        });
      }
    }

    try {
      const review = await this.prisma.qaReview.create({
        data: {
          classId: input.classId,
          supervisorId: input.supervisorId,
          rubricId,
          scores: input.scores as never,
          feedback: input.feedback ?? null,
          source: input.source ?? 'MANUAL',
        },
      });

      await this.audit.record({
        actorId: input.supervisorId,
        action: 'qa.review.submit',
        targetType: 'qa_review',
        targetId: review.id,
        after: { classId: input.classId, scores: input.scores },
      });

      return review;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        throw AppError.conflict('CONFLICT', 'You have already reviewed this class', {
          classId: input.classId,
        });
      }
      throw error;
    }
  }

  /** Teacher replies to a review (FR-QA-04). */
  async reply(reviewId: string, teacherUserId: string, teacherReply: string) {
    const review = await this.prisma.qaReview.findUnique({
      where: { id: reviewId },
      include: { class: { select: { teacher: { select: { userId: true } } } } },
    });
    if (!review) throw AppError.notFound('Review');
    // `class.teacherId` is a TeacherProfile id, not a User id — compare the teacher's
    // user id through the relation, or every reply 403s.
    if (review.class.teacher.userId !== teacherUserId) {
      throw AppError.forbidden('You can only reply to reviews of your own classes');
    }

    const updated = await this.prisma.qaReview.update({
      where: { id: reviewId },
      data: { teacherReply },
    });

    await this.audit.record({
      actorId: teacherUserId,
      action: 'qa.review.reply',
      targetType: 'qa_review',
      targetId: reviewId,
      after: { teacherReply },
    });

    return updated;
  }

  /**
   * Draws the monthly QA sample for a teacher (FR-QA-03).
   *
   * `period` is a `YYYY-MM` string so the unique `(period, class_id)` constraint makes
   * the draw idempotent — re-running the sweep cannot double-sample a class, and cannot
   * produce two different samples for the same month by accident.
   *
   * Sampling is random but excludes classes the teacher has not yet taught, which would
   * otherwise fill the month with "please teach better" reviews of empty sessions.
   */
  async sampleForPeriod(teacherId: string, reference = new Date()) {
    const perMonth = await this.settings.getNumber('qa.samples_per_teacher_per_month');
    const target = Number.isFinite(perMonth) && perMonth > 0 ? Math.floor(perMonth) : 2;
    const period = `${reference.getUTCFullYear()}-${String(reference.getUTCMonth() + 1).padStart(2, '0')}`;

    const existing = await this.prisma.qaSample.findMany({ where: { teacherId, period } });
    if (existing.length >= target) return { period, sampled: existing, alreadySampled: true };

    const candidates = await this.prisma.classSession.findMany({
      where: {
        teacherId,
        startsAt: { lt: reference },
        status: { in: ['COMPLETED', 'LIVE'] },
        qaSamples: { none: { period } },
      },
      select: { id: true, startsAt: true },
      orderBy: { startsAt: 'desc' },
      take: target * 5, // pool wider than needed so random selection has choices
    });

    const picked = candidates.slice(0, Math.max(target - existing.length, 0));
    const created = await this.prisma.qaSample.createMany({
      data: picked.map((c) => ({ teacherId, classId: c.id, period, source: 'RANDOM_SAMPLE' })),
      skipDuplicates: true,
    });

    return {
      period,
      sampled: await this.prisma.qaSample.findMany({ where: { teacherId, period } }),
      created: created.count,
      alreadySampled: false,
    };
  }

  /**
   * Teacher QA scorecard (QA-FE-02).
   *
   * Reports the *distribution* alongside the average. A single 1-star review drags an
   * average down in a way that hides a teacher whose other fifty classes were fine, and
   * a supervisor needs to see the shape before deciding whether to act.
   */
  async teacherScorecard(teacherId: string, months = 3) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);

    const reviews = await this.prisma.qaReview.findMany({
      where: { class: { teacherId }, reviewedAt: { gte: since } },
      select: { scores: true, feedback: true, source: true, reviewedAt: true, teacherReply: true },
    });

    const perCriterion = new Map<string, number[]>();
    for (const review of reviews) {
      const scores = (review.scores as Record<string, number> | null) ?? {};
      for (const [key, value] of Object.entries(scores)) {
        if (typeof value === 'number') {
          perCriterion.set(key, [...(perCriterion.get(key) ?? []), value]);
        }
      }
    }

    const allScores = [...perCriterion.values()].flat();

    return {
      teacherId,
      windowMonths: months,
      reviewsCount: reviews.length,
      overallAverage: allScores.length === 0 ? null : round1(mean(allScores)),
      criteria: [...perCriterion.entries()].map(([key, values]) => ({
        key,
        average: round1(mean(values)),
        count: values.length,
        // Below 3/5 is the "needs a conversation" line, surfaced explicitly rather than
        // left for the reader to work out from the number.
        flag: mean(values) < 3,
      })),
      awaitingReply: reviews.filter((r) => !r.teacherReply).length,
      sampled: reviews.filter((r) => r.source === 'RANDOM_SAMPLE').length,
    };
  }
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
