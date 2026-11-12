import { Injectable, Logger } from '@nestjs/common';
import { AssessmentResult, AssessmentType } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { hasAnyRole, PolicyService } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

/** Staff who may assess any enrolment; a teacher may assess only their own. */
const ASSESSOR_STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'EXAMINER'];

const ASSESSMENT_SELECT = {
  id: true,
  type: true,
  result: true,
  score: true,
  rubricScores: true,
  notes: true,
  takenAt: true,
  createdAt: true,
  examinerId: true,
  level: { select: { id: true, name: true, position: true, passMark: true } },
} as const;

/**
 * A level with no rubric is still assessable: it is marked as one overall score, so a
 * course that has not had its rubric written yet does not block a child from moving up.
 */
export const DEFAULT_RUBRIC: Record<string, number> = { Overall: 100 };

/** The level's `{ criterion: weight }` rubric, or the one-criterion fallback. */
export function effectiveRubric(rubric: unknown): Record<string, number> {
  if (!rubric || typeof rubric !== 'object' || Array.isArray(rubric)) return DEFAULT_RUBRIC;
  const entries = Object.entries(rubric as Record<string, unknown>).filter(
    (e): e is [string, number] => typeof e[1] === 'number' && e[1] >= 0,
  );
  return entries.length > 0 ? Object.fromEntries(entries) : DEFAULT_RUBRIC;
}

/**
 * Checks the scores against the rubric and returns the weighted 0–100 total, to one
 * decimal place. The pass decision is made on this rounded value so the number a family
 * sees and the result they are told can never disagree (69.96 shows as 70.0 and passes).
 */
export function computeAssessmentScore(
  rubric: Record<string, number>,
  scores: Record<string, unknown>,
): { score: number; scores: Record<string, number> } {
  const keys = Object.keys(rubric);
  const extra = Object.keys(scores).filter((k) => !(k in rubric));
  if (extra.length > 0) {
    throw AppError.badRequest('Scores were given for criteria that are not in this rubric', {
      extra,
    });
  }
  const clean: Record<string, number> = {};
  for (const key of keys) {
    const value = scores[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw AppError.badRequest(`Score for "${key}" must be a number from 0 to 100`);
    }
    clean[key] = value;
  }
  const totalWeight = keys.reduce((sum, k) => sum + rubric[k], 0);
  // All-zero weights would divide by zero; treat the criteria as equal instead.
  const raw =
    totalWeight > 0
      ? keys.reduce((sum, k) => sum + clean[k] * rubric[k], 0) / totalWeight
      : keys.reduce((sum, k) => sum + clean[k], 0) / keys.length;
  return { score: Math.round(raw * 10) / 10, scores: clean };
}

/**
 * Level assessments (FR-CRS-03). The teacher enters a score per rubric criterion; the
 * server weighs them, decides PASS/FAIL against the level's pass mark and, on a passed
 * LEVEL assessment, moves the enrolment to the start of the next level.
 */
@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async record(input: {
    enrolmentId: string;
    rubricScores: Record<string, unknown>;
    type?: AssessmentType;
    notes?: string;
    actorUserId: string;
    actorRoles: string[];
  }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        courseId: true,
        currentLevelId: true,
        currentLessonPosition: true,
        teacher: { select: { userId: true } },
        course: { select: { name: true } },
        student: { select: { id: true, displayName: true, familyId: true } },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');

    const subject = { userId: input.actorUserId, roles: input.actorRoles };
    if (
      !hasAnyRole(subject, ASSESSOR_STAFF_ROLES) &&
      enrolment.teacher?.userId !== input.actorUserId
    ) {
      throw AppError.forbidden('Only the teacher assigned to this enrolment can assess it');
    }
    if (!enrolment.currentLevelId) {
      throw AppError.badRequest(
        'This enrolment is not on a level yet, so there is nothing to assess',
      );
    }

    const level = await this.prisma.courseLevel.findUnique({
      where: { id: enrolment.currentLevelId },
      select: { id: true, name: true, position: true, passMark: true, rubric: true },
    });
    if (!level) throw AppError.notFound('Level');

    const { score, scores } = computeAssessmentScore(
      effectiveRubric(level.rubric),
      input.rubricScores ?? {},
    );
    const result = score >= level.passMark ? AssessmentResult.PASS : AssessmentResult.FAIL;
    const type = input.type ?? AssessmentType.LEVEL;

    // Only a passed LEVEL assessment moves the child; a milestone or ijazah is recorded
    // against the level but does not change where the lesson plan points.
    const nextLevel =
      result === AssessmentResult.PASS && type === AssessmentType.LEVEL
        ? await this.prisma.courseLevel.findFirst({
            where: { courseId: enrolment.courseId, position: { gt: level.position } },
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true },
          })
        : null;

    const assessment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.assessment.create({
        data: {
          enrolmentId: enrolment.id,
          levelId: level.id,
          type,
          examinerId: input.actorUserId,
          rubricScores: scores,
          score,
          notes: input.notes?.trim() || null,
          result,
          takenAt: new Date(),
        },
        select: ASSESSMENT_SELECT,
      });
      if (nextLevel) {
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { currentLevelId: nextLevel.id, currentLessonPosition: 1 },
        });
      }
      return created;
    });

    const passedLevel = result === AssessmentResult.PASS && type === AssessmentType.LEVEL;
    await this.audit.record({
      actorId: input.actorUserId,
      action: passedLevel ? 'crs.assessment.level-passed' : 'crs.assessment.record',
      targetType: 'enrolment',
      targetId: enrolment.id,
      before: { levelId: level.id, lessonPosition: enrolment.currentLessonPosition },
      after: {
        assessmentId: assessment.id,
        type,
        score,
        result,
        levelId: nextLevel?.id ?? level.id,
        lessonPosition: nextLevel ? 1 : enrolment.currentLessonPosition,
      },
    });

    if (passedLevel) {
      await this.tellFamily(enrolment, level.name, score, nextLevel?.name ?? null).catch((err) =>
        this.logger.warn(
          `Family not told about assessment ${assessment.id}: ${(err as Error).message}`,
        ),
      );
    }

    return {
      assessment,
      advancedTo: nextLevel,
      // A pass on the last level has nowhere to move to: the enrolment stays put and the
      // academy decides what comes next (completion, certificate, a new course).
      finalLevel: passedLevel && !nextLevel,
    };
  }

  /** History plus what the "Assess level" form needs: the current level's rubric. */
  // ── Exams assigned to an examiner (FR-CRS-03) ──────────────────────────────

  /**
   * An administrator assigns a milestone, ijazah or level exam to an examiner. The exam is
   * created PENDING at the child's current level; nothing about the enrolment changes until
   * the examiner records a result.
   */
  async assign(
    input: {
      enrolmentId: string;
      examinerId: string;
      type: AssessmentType;
      scheduledFor?: Date;
    },
    actorId: string,
  ) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        status: true,
        currentLevelId: true,
        course: { select: { name: true } },
        student: { select: { displayName: true } },
        currentLevel: { select: { name: true } },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');
    if (!enrolment.currentLevelId || !enrolment.currentLevel) {
      throw AppError.badRequest(
        'This enrolment is not on a level yet, so there is nothing to examine',
      );
    }
    if (enrolment.status !== 'ACTIVE') {
      throw AppError.conflict(
        'CONFLICT',
        `The enrolment is ${enrolment.status}; only an active one can be examined`,
      );
    }
    await this.assertExaminer(input.examinerId);
    if (input.scheduledFor && input.scheduledFor.getTime() < Date.now() - 60_000) {
      throw AppError.badRequest('The exam cannot be planned in the past', {
        field: 'scheduledFor',
      });
    }
    const open = await this.prisma.assessment.findFirst({
      where: {
        enrolmentId: input.enrolmentId,
        levelId: enrolment.currentLevelId,
        type: input.type,
        result: AssessmentResult.PENDING,
      },
      select: { id: true },
    });
    if (open) {
      throw AppError.conflict(
        'CONFLICT',
        'This exam is already assigned and waiting for a result',
        {
          assessmentId: open.id,
        },
      );
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        enrolmentId: input.enrolmentId,
        levelId: enrolment.currentLevelId,
        type: input.type,
        examinerId: input.examinerId,
        result: AssessmentResult.PENDING,
        scheduledFor: input.scheduledFor ?? null,
        assignedById: actorId,
      },
      select: ASSESSMENT_SELECT,
    });
    await this.audit.record({
      actorId,
      action: 'crs.assessment.assign',
      targetType: 'assessment',
      targetId: assessment.id,
      after: { enrolmentId: input.enrolmentId, examinerId: input.examinerId, type: input.type },
    });
    await this.notifications
      .enqueue({
        userIds: [input.examinerId],
        template: TEMPLATE.ASSESSMENT_ASSIGNED,
        data: {
          studentName: enrolment.student.displayName,
          courseName: enrolment.course.name,
          levelName: enrolment.currentLevel.name,
          examType: input.type.toLowerCase().replace('_', ' '),
          scheduledFor: input.scheduledFor?.toISOString() ?? null,
        },
      })
      .catch((error: Error) =>
        this.logger.warn(`Examiner not told about assessment ${assessment.id}: ${error.message}`),
      );
    return assessment;
  }

  /** Changes the examiner or the planned date of an exam that has not been taken. */
  async reassign(
    assessmentId: string,
    patch: { examinerId?: string; scheduledFor?: Date | null },
    actorId: string,
  ) {
    const current = await this.loadPending(assessmentId);
    if (patch.examinerId) await this.assertExaminer(patch.examinerId);
    const updated = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        ...(patch.examinerId ? { examinerId: patch.examinerId } : {}),
        ...(patch.scheduledFor !== undefined ? { scheduledFor: patch.scheduledFor } : {}),
      },
      select: ASSESSMENT_SELECT,
    });
    await this.audit.record({
      actorId,
      action: 'crs.assessment.reassign',
      targetType: 'assessment',
      targetId: assessmentId,
      before: { examinerId: current.examinerId },
      after: patch,
    });
    return updated;
  }

  /** Withdraws an exam that has not been taken. */
  async cancelAssigned(assessmentId: string, actorId: string) {
    await this.loadPending(assessmentId);
    await this.prisma.assessment.delete({ where: { id: assessmentId } });
    await this.audit.record({
      actorId,
      action: 'crs.assessment.cancel',
      targetType: 'assessment',
      targetId: assessmentId,
    });
    return { id: assessmentId, cancelled: true };
  }

  /** The examiner's own pending exams, with the rubric they will score against. */
  async assignedTo(examinerId: string) {
    const rows = await this.prisma.assessment.findMany({
      where: { examinerId, result: AssessmentResult.PENDING },
      orderBy: [{ scheduledFor: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 100,
      select: {
        id: true,
        type: true,
        scheduledFor: true,
        createdAt: true,
        level: { select: { id: true, name: true, passMark: true, rubric: true } },
        enrolment: {
          select: {
            id: true,
            course: { select: { name: true } },
            student: { select: { displayName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      assessmentId: r.id,
      type: r.type,
      scheduledFor: r.scheduledFor,
      assignedAt: r.createdAt,
      enrolmentId: r.enrolment.id,
      student: r.enrolment.student.displayName,
      course: r.enrolment.course.name,
      level: { id: r.level.id, name: r.level.name, passMark: r.level.passMark },
      // The criteria and their weights, so the form can be drawn without a second call.
      rubric: effectiveRubric(r.level.rubric),
    }));
  }

  /**
   * The assigned examiner records the result. Same scoring and pass rule as a teacher's
   * assessment; a passed LEVEL exam moves the child up only if they are still on that level.
   */
  async recordAssigned(
    assessmentId: string,
    input: { rubricScores: Record<string, unknown>; notes?: string },
    actorUserId: string,
    actorRoles: string[],
  ) {
    const exam = await this.loadPending(assessmentId);
    if (exam.examinerId !== actorUserId && !actorRoles.includes('SUPER_ADMIN')) {
      throw AppError.forbidden('This exam is assigned to another examiner');
    }
    const [level, enrolment] = await Promise.all([
      this.prisma.courseLevel.findUnique({
        where: { id: exam.levelId },
        select: { id: true, name: true, position: true, passMark: true, rubric: true },
      }),
      this.prisma.enrolment.findUnique({
        where: { id: exam.enrolmentId },
        select: {
          id: true,
          courseId: true,
          currentLevelId: true,
          course: { select: { name: true } },
          student: { select: { id: true, displayName: true, familyId: true } },
        },
      }),
    ]);
    if (!level || !enrolment) throw AppError.notFound('Exam');

    const { score, scores } = computeAssessmentScore(
      effectiveRubric(level.rubric),
      input.rubricScores ?? {},
    );
    const result = score >= level.passMark ? AssessmentResult.PASS : AssessmentResult.FAIL;
    const passedLevel =
      result === AssessmentResult.PASS && (exam.type as AssessmentType) === AssessmentType.LEVEL;
    // The child may have moved on since the exam was assigned; do not move them twice.
    const nextLevel =
      passedLevel && enrolment.currentLevelId === level.id
        ? await this.prisma.courseLevel.findFirst({
            where: { courseId: enrolment.courseId, position: { gt: level.position } },
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true },
          })
        : null;

    const assessment = await this.prisma.$transaction(async (tx) => {
      // Guards against two submissions racing: only a still-pending row is updated.
      const claimed = await tx.assessment.updateMany({
        where: { id: assessmentId, result: AssessmentResult.PENDING },
        data: {
          rubricScores: scores,
          score,
          notes: input.notes?.trim() || null,
          result,
          takenAt: new Date(),
        },
      });
      if (claimed.count !== 1) {
        throw AppError.conflict('CONFLICT', 'A result has already been recorded for this exam');
      }
      if (nextLevel) {
        await tx.enrolment.update({
          where: { id: enrolment.id },
          data: { currentLevelId: nextLevel.id, currentLessonPosition: 1 },
        });
      }
      return tx.assessment.findUniqueOrThrow({
        where: { id: assessmentId },
        select: ASSESSMENT_SELECT,
      });
    });

    await this.audit.record({
      actorId: actorUserId,
      action: 'crs.assessment.record',
      targetType: 'assessment',
      targetId: assessmentId,
      after: { type: exam.type, score, result, advancedTo: nextLevel?.id ?? null },
    });
    if (passedLevel) {
      await this.tellFamily(
        { course: enrolment.course, student: enrolment.student },
        level.name,
        score,
        nextLevel?.name ?? null,
      ).catch((err) =>
        this.logger.warn(`Family not told about exam ${assessmentId}: ${(err as Error).message}`),
      );
    }
    return { assessment, advancedTo: nextLevel, finalLevel: passedLevel && !nextLevel };
  }

  private async loadPending(assessmentId: string) {
    const exam = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        enrolmentId: true,
        levelId: true,
        type: true,
        examinerId: true,
        result: true,
      },
    });
    if (!exam) throw AppError.notFound('Exam');
    if ((exam.result as AssessmentResult) !== AssessmentResult.PENDING) {
      throw AppError.conflict('CONFLICT', 'This exam has already been taken');
    }
    return exam;
  }

  private async assertExaminer(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true, roles: { select: { role: true } } },
    });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') throw AppError.notFound('Examiner');
    if (!user.roles.some((r) => r.role === 'EXAMINER')) {
      throw AppError.badRequest('That person is not an examiner', { field: 'examinerId' });
    }
  }

  async list(input: { enrolmentId: string; actorUserId: string; actorRoles: string[] }) {
    const enrolment = await this.prisma.enrolment.findUnique({
      where: { id: input.enrolmentId },
      select: {
        id: true,
        studentId: true,
        currentLessonPosition: true,
        currentLevel: {
          select: {
            id: true,
            name: true,
            position: true,
            passMark: true,
            rubric: true,
            _count: { select: { lessonTemplates: true } },
          },
        },
      },
    });
    if (!enrolment) throw AppError.notFound('Enrolment');
    await this.policies.assertStudentAccess(
      { userId: input.actorUserId, roles: input.actorRoles },
      enrolment.studentId,
    );

    const assessments = await this.prisma.assessment.findMany({
      where: { enrolmentId: enrolment.id },
      select: ASSESSMENT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const level = enrolment.currentLevel;
    return {
      currentLevel: level
        ? {
            id: level.id,
            name: level.name,
            position: level.position,
            passMark: level.passMark,
            rubric: effectiveRubric(level.rubric),
            lessonCount: level._count.lessonTemplates,
          }
        : null,
      currentLessonPosition: enrolment.currentLessonPosition,
      assessments,
    };
  }

  private async tellFamily(
    enrolment: {
      student: { displayName: string; familyId: string };
      course: { name: string };
    },
    levelName: string,
    score: number,
    nextLevelName: string | null,
  ) {
    const guardians = await this.prisma.familyMember.findMany({
      where: { familyId: enrolment.student.familyId },
      select: { userId: true },
    });
    if (guardians.length === 0) return;
    await this.notifications.enqueue({
      userIds: guardians.map((g) => g.userId),
      template: TEMPLATE.LEVEL_PASSED,
      data: {
        studentName: enrolment.student.displayName,
        levelName,
        courseName: enrolment.course.name,
        score,
        nextStep: nextLevelName
          ? `They now move on to ${nextLevelName}.`
          : 'That was the last level of the course; the academy will be in touch about what comes next.',
      },
    });
  }
}
