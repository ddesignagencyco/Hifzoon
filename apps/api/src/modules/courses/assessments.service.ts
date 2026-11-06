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
