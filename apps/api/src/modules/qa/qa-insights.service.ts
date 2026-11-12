import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { isScopedSupervisor } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface QaActor {
  userId: string;
  roles: string[];
}

export interface RubricItem {
  key: string;
  label: string;
  weight: number;
}

/** A teacher counts as on time if they joined within this many minutes of the start. */
const PUNCTUAL_WITHIN_MINUTES = 2;

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const ratio = (num: number, den: number) => (den === 0 ? null : round3(num / den));

/**
 * What a supervisor needs to *act on* QA beyond submitting a review (FR-QA-03, FR-QA-04):
 * the queue of sampled classes nobody has reviewed yet, past reviews with the teacher's
 * reply, the configurable rubric, and a scorecard built from how the teacher actually shows
 * up and teaches, not only from review scores.
 *
 * A supervisor assigned to specific teachers only ever sees those teachers' rows; an admin
 * or super admin sees everyone.
 */
@Injectable()
export class QaInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Review queue ──────────────────────────────────────────────────────────

  /** Sampled classes with no review yet, oldest first (the longest-waiting at the top). */
  async reviewQueue(
    actor: QaActor,
    filter: { period?: string; teacherId?: string; page?: number; limit?: number } = {},
  ) {
    const scope = await this.teacherScope(actor);
    if (filter.teacherId && scope && !scope.includes(filter.teacherId)) {
      throw AppError.forbidden('That teacher is not on your caseload');
    }
    const { page, limit } = paging(filter);
    const where: Prisma.QaSampleWhereInput = {
      ...(filter.period ? { period: filter.period } : {}),
      ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
      ...(scope ? { teacherId: filter.teacherId ?? { in: scope } } : {}),
      class: {
        qaReviews: { none: {} },
        // You cannot review a class you taught, so it is not in your queue.
        teacher: { userId: { not: actor.userId } },
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.qaSample.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          period: true,
          source: true,
          createdAt: true,
          teacher: { select: { id: true, user: { select: { name: true } } } },
          class: {
            select: {
              id: true,
              startsAt: true,
              type: true,
              status: true,
              course: { select: { name: true } },
              recording: { select: { status: true } },
            },
          },
        },
      }),
      this.prisma.qaSample.count({ where }),
    ]);
    return {
      items: items.map((s) => ({
        sampleId: s.id,
        period: s.period,
        source: s.source,
        sampledAt: s.createdAt,
        waitingDays: Math.floor((Date.now() - s.createdAt.getTime()) / 86_400_000),
        teacher: { id: s.teacher.id, name: s.teacher.user.name },
        class: {
          id: s.class.id,
          startsAt: s.class.startsAt,
          course: s.class.course.name,
          type: s.class.type,
          status: s.class.status,
          hasRecording: s.class.recording?.status === 'READY',
        },
      })),
      total,
      page,
      limit,
    };
  }

  // ── Past reviews and replies ──────────────────────────────────────────────

  async listReviews(
    actor: QaActor,
    filter: {
      teacherId?: string;
      replied?: boolean;
      from?: Date;
      to?: Date;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const scope = await this.teacherScope(actor);
    if (filter.teacherId && scope && !scope.includes(filter.teacherId)) {
      throw AppError.forbidden('That teacher is not on your caseload');
    }
    const { page, limit } = paging(filter);
    const where: Prisma.QaReviewWhereInput = {
      class: {
        ...(filter.teacherId ? { teacherId: filter.teacherId } : {}),
        ...(scope && !filter.teacherId ? { teacherId: { in: scope } } : {}),
      },
      ...(filter.replied === true ? { teacherReply: { not: null } } : {}),
      ...(filter.replied === false ? { teacherReply: null } : {}),
      ...(filter.from || filter.to
        ? {
            reviewedAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.qaReview.findMany({
        where,
        orderBy: { reviewedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: reviewSelect,
      }),
      this.prisma.qaReview.count({ where }),
    ]);
    return { items: rows.map(summariseReview), total, page, limit };
  }

  async getReview(actor: QaActor, id: string) {
    const review = await this.prisma.qaReview.findUnique({
      where: { id },
      select: { ...reviewSelect, rubric: { select: { id: true, name: true, criteria: true } } },
    });
    if (!review) throw AppError.notFound('Review');
    const scope = await this.teacherScope(actor);
    // Out of scope looks like not found, as everywhere else in supervision.
    if (scope && !scope.includes(review.class.teacher.id)) throw AppError.notFound('Review');

    const items = rubricItems(review.rubric.criteria);
    const scores = (review.scores ?? {}) as Record<string, number>;
    return {
      ...summariseReview(review),
      rubric: { id: review.rubric.id, name: review.rubric.name },
      criteria: items.map((i) => ({ ...i, score: scores[i.key] ?? null })),
    };
  }

  // ── Rubric ────────────────────────────────────────────────────────────────

  async listRubrics() {
    const rubrics = await this.prisma.qaRubric.findMany({
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { reviews: true } } },
    });
    return rubrics.map((r) => ({
      id: r.id,
      name: r.name,
      active: r.active,
      createdAt: r.createdAt,
      reviewCount: r._count.reviews,
      criteria: rubricItems(r.criteria),
      // A rubric that has been used is part of the record of past reviews.
      editable: r._count.reviews === 0,
    }));
  }

  async createRubric(
    input: { name: string; criteria: RubricItem[]; activate?: boolean },
    actorId: string,
  ) {
    const name = input.name.trim();
    if (name.length < 3) throw AppError.badRequest('Give the rubric a name');
    const items = validateCriteria(input.criteria);

    const rubric = await this.prisma.$transaction(async (tx) => {
      if (input.activate) await tx.qaRubric.updateMany({ data: { active: false } });
      return tx.qaRubric.create({
        data: { name, criteria: { items } as never, active: Boolean(input.activate) },
      });
    });
    await this.audit.record({
      actorId,
      action: 'qa.rubric.create',
      targetType: 'qa_rubric',
      targetId: rubric.id,
      after: { name, criteria: items.map((i) => i.key), active: rubric.active },
    });
    return { id: rubric.id, name, active: rubric.active, criteria: items };
  }

  /** Renames; criteria change only while no review has used the rubric. */
  async updateRubric(
    id: string,
    patch: { name?: string; criteria?: RubricItem[] },
    actorId: string,
  ) {
    const rubric = await this.prisma.qaRubric.findUnique({
      where: { id },
      include: { _count: { select: { reviews: true } } },
    });
    if (!rubric) throw AppError.notFound('Rubric');
    if (patch.criteria && rubric._count.reviews > 0) {
      throw AppError.conflict(
        'CONFLICT',
        `${rubric._count.reviews} review(s) already use this rubric; create a new version instead`,
        { reviews: rubric._count.reviews },
      );
    }
    const data: Prisma.QaRubricUpdateInput = {};
    if (patch.name !== undefined) {
      if (patch.name.trim().length < 3) throw AppError.badRequest('Give the rubric a name');
      data.name = patch.name.trim();
    }
    if (patch.criteria) data.criteria = { items: validateCriteria(patch.criteria) } as never;
    const updated = await this.prisma.qaRubric.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'qa.rubric.update',
      targetType: 'qa_rubric',
      targetId: id,
      after: { name: data.name, criteriaChanged: Boolean(patch.criteria) },
    });
    return { id: updated.id, name: updated.name, active: updated.active };
  }

  /** Makes this the rubric new reviews use; there is only ever one active. */
  async activateRubric(id: string, actorId: string) {
    const rubric = await this.prisma.qaRubric.findUnique({ where: { id } });
    if (!rubric) throw AppError.notFound('Rubric');
    await this.prisma.$transaction([
      this.prisma.qaRubric.updateMany({ where: { id: { not: id } }, data: { active: false } }),
      this.prisma.qaRubric.update({ where: { id }, data: { active: true } }),
    ]);
    await this.audit.record({
      actorId,
      action: 'qa.rubric.activate',
      targetType: 'qa_rubric',
      targetId: id,
    });
    return { id, active: true };
  }

  // ── Fuller scorecard ──────────────────────────────────────────────────────

  /**
   * How the teacher shows up and teaches over the window, beside the review scores:
   * attendance, punctuality, lesson-card completion, retention and progress. Every figure
   * is a ratio with its counts, so a reader can tell 1 of 1 from 40 of 40.
   */
  async teacherMetrics(actor: QaActor, teacherId: string, months = 3) {
    const scope = await this.teacherScope(actor);
    if (scope && !scope.includes(teacherId)) throw AppError.notFound('Teacher');
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { id: true, userId: true, user: { select: { name: true } } },
    });
    if (!teacher) throw AppError.notFound('Teacher');

    const until = new Date();
    const since = new Date(until);
    since.setUTCMonth(since.getUTCMonth() - months);

    const [statuses, punctual, cards, enrolments, grades] = await Promise.all([
      this.prisma.classSession.groupBy({
        by: ['status'],
        where: { teacherId, startsAt: { gte: since, lt: until } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ total: bigint; on_time: bigint; late_minutes: number | null }>>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (
                 WHERE first_join <= starts_at + (${PUNCTUAL_WITHIN_MINUTES} * interval '1 minute')
               )::bigint AS on_time,
               AVG(GREATEST(EXTRACT(EPOCH FROM (first_join - starts_at)) / 60, 0))::float8 AS late_minutes
        FROM (
          SELECT c.id, c.starts_at, MIN(p.joined_at) AS first_join
          FROM class_session c
          JOIN class_participant p ON p.class_id = c.id AND p.role = 'TEACHER'
          WHERE c.teacher_id = ${teacherId}::uuid AND c.status = 'COMPLETED'
            AND c.starts_at >= ${since} AND c.starts_at < ${until}
          GROUP BY c.id, c.starts_at
        ) x`,
      this.prisma.$queryRaw<Array<{ completed: bigint; with_card: bigint }>>`
        SELECT COUNT(*)::bigint AS completed,
               COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM lesson_card l WHERE l.class_id = c.id AND l.submitted_at IS NOT NULL
               ))::bigint AS with_card
        FROM class_session c
        WHERE c.teacher_id = ${teacherId}::uuid AND c.status = 'COMPLETED'
          AND c.starts_at >= ${since} AND c.starts_at < ${until}`,
      this.prisma.enrolment.groupBy({
        by: ['status'],
        where: {
          teacherId,
          status: { in: ['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED'] },
          createdAt: { lt: since },
        },
        _count: { _all: true },
      }),
      this.prisma.lessonPortion.groupBy({
        by: ['grade'],
        where: {
          grade: { not: null },
          lessonCard: { teacherId: teacher.userId, submittedAt: { gte: since, lt: until } },
        },
        _count: { _all: true },
      }),
    ]);

    const count = (s: string) => statuses.find((x) => x.status === s)?._count._all ?? 0;
    const completed = count('COMPLETED');
    const teacherNoShow = count('NO_SHOW_TEACHER');
    const teacherCancelled = count('CANCELLED_TEACHER');
    const reliabilityBase = completed + teacherNoShow + teacherCancelled;

    const p = punctual[0];
    const c = cards[0];
    const retained = enrolments
      .filter((e) => e.status === 'ACTIVE' || e.status === 'PAUSED')
      .reduce((s, e) => s + e._count._all, 0);
    const enrolledBefore = enrolments.reduce((s, e) => s + e._count._all, 0);
    const graded = grades.reduce((s, g) => s + g._count._all, 0);
    const good = grades
      .filter((g) => g.grade === 'EXCELLENT' || g.grade === 'GOOD')
      .reduce((s, g) => s + g._count._all, 0);

    return {
      teacherId,
      name: teacher.user.name,
      windowMonths: months,
      attendance: {
        completed,
        teacherNoShow,
        teacherCancelled,
        studentNoShow: count('NO_SHOW_STUDENT'),
        familyCancelled: count('CANCELLED_FAMILY'),
        // Only what the teacher is answerable for: a child who does not turn up is not theirs.
        rate: ratio(completed, reliabilityBase),
      },
      punctuality: {
        classes: Number(p?.total ?? 0),
        onTime: Number(p?.on_time ?? 0),
        withinMinutes: PUNCTUAL_WITHIN_MINUTES,
        averageLateMinutes: p?.late_minutes == null ? null : Math.round(p.late_minutes * 10) / 10,
        rate: ratio(Number(p?.on_time ?? 0), Number(p?.total ?? 0)),
      },
      lessonCards: {
        completedClasses: Number(c?.completed ?? 0),
        withSubmittedCard: Number(c?.with_card ?? 0),
        rate: ratio(Number(c?.with_card ?? 0), Number(c?.completed ?? 0)),
      },
      retention: {
        enrolmentsBeforeWindow: enrolledBefore,
        stillEnrolled: retained,
        rate: ratio(retained, enrolledBefore),
      },
      progress: {
        gradedPortions: graded,
        goodOrBetter: good,
        goodShare: ratio(good, graded),
      },
    };
  }

  // ── Scope ─────────────────────────────────────────────────────────────────

  /** TeacherProfile ids the actor may see, or null when they may see every teacher. */
  private async teacherScope(actor: QaActor): Promise<string[] | null> {
    if (!isScopedSupervisor(actor)) return null;
    const rows = await this.prisma.supervisorAssignment.findMany({
      where: { supervisorId: actor.userId },
      select: { teacherId: true },
    });
    return rows.map((r) => r.teacherId);
  }
}

const reviewSelect = {
  id: true,
  scores: true,
  feedback: true,
  teacherReply: true,
  reviewedAt: true,
  source: true,
  supervisor: { select: { id: true, name: true } },
  class: {
    select: {
      id: true,
      startsAt: true,
      course: { select: { name: true } },
      teacher: { select: { id: true, user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.QaReviewSelect;

type ReviewRow = Prisma.QaReviewGetPayload<{ select: typeof reviewSelect }>;

export function summariseReview(r: ReviewRow) {
  const values = Object.values((r.scores ?? {}) as Record<string, unknown>).filter(
    (v): v is number => typeof v === 'number',
  );
  return {
    id: r.id,
    reviewedAt: r.reviewedAt,
    source: r.source,
    average:
      values.length === 0
        ? null
        : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
    feedback: r.feedback,
    teacherReply: r.teacherReply,
    hasReply: r.teacherReply !== null,
    supervisor: r.supervisor,
    teacher: { id: r.class.teacher.id, name: r.class.teacher.user.name },
    class: { id: r.class.id, startsAt: r.class.startsAt, course: r.class.course.name },
  };
}

export function rubricItems(criteria: unknown): RubricItem[] {
  const items = (criteria as { items?: unknown } | null)?.items;
  return Array.isArray(items)
    ? items.filter(
        (i): i is RubricItem =>
          !!i &&
          typeof i.key === 'string' &&
          typeof i.label === 'string' &&
          typeof i.weight === 'number',
      )
    : [];
}

/** 1–20 criteria, unique snake-case keys, readable labels, weights 1–5. */
export function validateCriteria(criteria: RubricItem[]): RubricItem[] {
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 20) {
    throw AppError.badRequest('A rubric has between 1 and 20 criteria');
  }
  const seen = new Set<string>();
  return criteria.map((c) => {
    const key = String(c.key ?? '').trim();
    const label = String(c.label ?? '').trim();
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(key)) {
      throw AppError.badRequest(`Criterion key "${key}" must be lowercase letters, digits or _`);
    }
    if (seen.has(key)) throw AppError.badRequest(`Criterion key "${key}" is used twice`);
    seen.add(key);
    if (label.length < 3 || label.length > 120) {
      throw AppError.badRequest(`Criterion "${key}" needs a label of 3–120 characters`);
    }
    if (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 5) {
      throw AppError.badRequest(`Criterion "${key}" weight is a whole number from 1 to 5`);
    }
    return { key, label, weight: c.weight };
  });
}

function paging(filter: { page?: number; limit?: number }) {
  return {
    page: Math.max(filter.page ?? 1, 1),
    limit: Math.min(Math.max(filter.limit ?? 25, 1), 100),
  };
}
