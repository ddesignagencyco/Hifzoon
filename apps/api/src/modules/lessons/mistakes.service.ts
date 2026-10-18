import { Injectable, Logger } from '@nestjs/common';
import { MISTAKE_TYPES, MistakeSource, MistakeType } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { PolicyService, type PolicySubject } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface MarkMistakeInput {
  classId: string;
  studentId: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  type: MistakeType;
  tajweedRule?: string;
  occurredAt?: Date;
  actorUserId: string;
  actorRoles: string[];
}

/**
 * In-class mistake logging (REC-BE-01, FR-REC-01, FR-REC-02).
 *
 * A mistake is a specific position in a specific ayah, made by a specific student, in a
 * specific class. Every one of those is enforced here rather than trusted, because a
 * mistake record is the raw material for a child's long-term progress view — a position
 * recorded against the wrong ayah quietly corrupts months of revision history.
 */
@Injectable()
export class MistakesService {
  private readonly logger = new Logger(MistakesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
  ) {}

  async mark(input: MarkMistakeInput) {
    this.validatePosition(input.surah, input.ayah, input.wordIndex);

    if (!MISTAKE_TYPES.includes(input.type)) {
      throw AppError.badRequest(
        `Unknown mistake type "${input.type}". Expected one of: ${MISTAKE_TYPES.join(', ')}`,
      );
    }

    const subject: PolicySubject = { userId: input.actorUserId, roles: input.actorRoles };

    // FR-REC-01 — a teacher logs mistakes for their own students only. Staff pass via
    // the policy's remit bypass; a teacher must actually hold an enrolment.
    await this.policies.assertStudentAccess(subject, input.studentId, 'teacher');

    const isInClass = await this.prisma.classStudent.count({
      where: { classId: input.classId, studentId: input.studentId },
      take: 1,
    });
    if (isInClass === 0) {
      throw AppError.badRequest('That student is not enrolled in this class');
    }

    // Owning the student is not the same as owning the room: without this, a teacher
    // could write into a colleague's session (and corrupt their card prefill).
    await this.policies.assertClassControl(subject, input.classId);

    const mistake = await this.prisma.mistake.create({
      data: {
        studentId: input.studentId,
        classId: input.classId,
        surah: input.surah,
        ayah: input.ayah,
        wordIndex: input.wordIndex,
        type: input.type,
        tajweedRule: input.tajweedRule ?? null,
        source: MistakeSource.CLASS,
        // Teacher-recorded mistakes are true by definition; only AI flags need review.
        confirmed: true,
        occurredAt: input.occurredAt ?? new Date(),
      },
      select: {
        id: true,
        studentId: true,
        classId: true,
        surah: true,
        ayah: true,
        wordIndex: true,
        type: true,
        tajweedRule: true,
        confirmed: true,
        occurredAt: true,
      },
    });

    return mistake;
  }

  /**
   * FR-REC-02 — the mistake history for one student, newest first.
   *
   * The route has no `@Roles`, so every signed-in role can reach it: the service must
   * therefore decide per *caller*, not per role (guardian, teacher, the child reading
   * their own history, staff).
   */
  async listForStudent(
    studentId: string,
    subject: PolicySubject,
    filters: { from?: Date; to?: Date; type?: MistakeType; limit?: number } = {},
  ) {
    if (!(await this.policies.canAccessStudent(subject, studentId))) {
      throw AppError.notOwner();
    }

    return this.prisma.mistake.findMany({
      where: {
        studentId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        surah: true,
        ayah: true,
        wordIndex: true,
        type: true,
        tajweedRule: true,
        source: true,
        confirmed: true,
        dismissedAt: true,
        occurredAt: true,
        lessonCardId: true,
        classId: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: filters.limit ?? 100,
    });
  }

  /**
   * FR-REC-04 — mistakes marked during one class, used to prefill the lesson card.
   * `classId` comes from the URL, so it is checked against the session's teacher
   * rather than trusted: the response carries `studentId` for every child in the room.
   */
  async listForClass(classId: string, subject: PolicySubject) {
    await this.policies.assertClassControl(subject, classId);

    return this.prisma.mistake.findMany({
      where: { classId },
      select: {
        id: true,
        studentId: true,
        surah: true,
        ayah: true,
        wordIndex: true,
        type: true,
        tajweedRule: true,
        occurredAt: true,
        // M18 — the same three fields the per-student list already returns. Without them a
        // reviewer of this class's mistakes could not tell a teacher's own mark from an
        // AI flag, whether it was confirmed, or that it had been dismissed as a false
        // positive — which is the difference between "recorded" and "believed".
        source: true,
        confirmed: true,
        dismissedAt: true,
      },
      orderBy: { occurredAt: 'asc' },
      take: 500,
    });
  }

  /**
   * Dismisses an AI-flagged mistake. The row is kept rather than deleted (FR-AIC-07):
   * the AI's false-positive rate is a product metric, and deleting the evidence would
   * make it unmeasurable.
   */
  async dismiss(mistakeId: string, subject: PolicySubject, reason?: string) {
    const mistake = await this.prisma.mistake.findUnique({
      where: { id: mistakeId },
      select: { id: true, source: true, studentId: true, dismissedAt: true },
    });
    if (!mistake) throw AppError.notFound('Mistake');

    // Ownership runs before the idempotent short-circuit: returning
    // `{alreadyDismissed: true}` to an unauthenticated reader would tell them both that
    // the row exists and that it was dismissed, for someone else's child.
    await this.policies.assertStudentAccess(subject, mistake.studentId, 'teacher');
    if (mistake.dismissedAt) return { alreadyDismissed: true };

    await this.prisma.mistake.update({
      where: { id: mistakeId },
      data: { dismissedAt: new Date(), confirmed: false, confirmedById: subject.userId },
    });

    this.logger.log(
      `Mistake ${mistakeId} dismissed by ${subject.userId}: ${reason ?? 'no reason given'}`,
    );
    return { dismissed: true };
  }

  async confirm(mistakeId: string, subject: PolicySubject) {
    const mistake = await this.prisma.mistake.findUnique({
      where: { id: mistakeId },
      select: { id: true, studentId: true, confirmed: true },
    });
    if (!mistake) throw AppError.notFound('Mistake');

    await this.policies.assertStudentAccess(subject, mistake.studentId, 'teacher');

    return this.prisma.mistake.update({
      where: { id: mistakeId },
      data: { confirmed: true, dismissedAt: null, confirmedById: subject.userId },
      select: { id: true, confirmed: true, dismissedAt: true },
    });
  }

  /**
   * Positions that keep coming back for a student. FR-TCH-04 feeds this into the
   * pre-class brief so the teacher knows where to spend the lesson.
   */
  async recurringFor(students: string[], since: Date) {
    if (students.length === 0) return [];

    const grouped = await this.prisma.mistake.groupBy({
      by: ['studentId', 'surah', 'ayah', 'type'],
      where: { studentId: { in: students }, occurredAt: { gte: since }, dismissedAt: null },
      _count: { _all: true },
      orderBy: { _count: { surah: 'desc' } },
      take: 100,
    });

    return grouped.map((row) => ({
      studentId: row.studentId,
      surah: row.surah,
      ayah: row.ayah,
      type: row.type,
      occurrences: row._count._all,
    }));
  }

  private validatePosition(surah: number, ayah: number, wordIndex: number): void {
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
      throw AppError.badRequest('FR-REC-01: surah must be between 1 and 114');
    }
    if (!Number.isInteger(ayah) || ayah < 1) {
      throw AppError.badRequest('FR-REC-01: ayah must be 1 or greater');
    }
    if (!Number.isInteger(wordIndex) || wordIndex < 0) {
      throw AppError.badRequest('FR-REC-01: wordIndex must be zero or greater');
    }
  }
}
