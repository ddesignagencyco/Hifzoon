import { Injectable, Logger } from '@nestjs/common';
import { ErrorCode, Grade, LESSON_CARD_LOCK_HOURS, PortionKind, Role } from '@hifzoon/shared';

import { AuthenticatedUser } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import {
  hasAnyRole,
  PolicyService,
  STAFF_SCOPE_ROLES,
  type PolicySubject,
} from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClassReminderService } from '../notifications/class-reminder.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';

export interface LessonPortionInput {
  kind: PortionKind;
  fromSurah?: number;
  fromAyah?: number;
  toSurah?: number;
  toAyah?: number;
  grade?: Grade;
}

export interface SubmitLessonCardInput {
  classId: string;
  homework?: string;
  parentNote?: string;
  portions: LessonPortionInput[];
  /** Set when the teacher confirms the draft summary (FR-REC-05). */
  approveAiSummary?: boolean;
}

export interface UpdateLessonCardInput {
  homework?: string;
  parentNote?: string;
  portions?: LessonPortionInput[];
  /** Supervisor edits after the lock require a reason (FR-REC-08). */
  reason?: string;
}

/**
 * Lesson cards (REC-BE-02 … REC-BE-06, FR-REC-03, FR-REC-04, FR-REC-05, FR-REC-06,
 * FR-REC-08).
 *
 * The rule with teeth is the **48-hour lock** (FR-REC-08). A lesson card is a
 * statement to a parent about their child; once the parent has read it, the teacher
 * cannot quietly change what they read. After the lock only a supervisor may edit, and
 * every such edit is written to `lesson_edit_log` with before and after. That gives the
 * parent a defensible answer to "did someone change this after I saw it?" instead of an
 * argument.
 */
@Injectable()
export class LessonCardsService {
  private readonly logger = new Logger(LessonCardsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly reminders: ClassReminderService,
    private readonly queues: QueueService,
  ) {}

  // ── Prefill (FR-REC-04) ───────────────────────────────────────────────────

  /**
   * Builds an unsubmitted card from what already happened in the class: pages shown,
   * mistakes marked, attendance. The teacher should be confirming, not retyping —
   * the product requirement is under two minutes (FR-REC-04 / NFR-USE-01).
   */
  async prefill(classId: string, subject: PolicySubject) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: classId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        lastPage: true,
        mushafLayout: true,
        teacher: { select: { id: true, userId: true, user: { select: { name: true } } } },
        course: { select: { id: true, name: true } },
        students: {
          select: {
            studentId: true,
            student: { select: { id: true, displayName: true } },
          },
        },
        lessonCard: { select: { id: true, submittedAt: true, lockedAt: true } },
        mistakes: {
          select: {
            id: true,
            studentId: true,
            surah: true,
            ayah: true,
            wordIndex: true,
            type: true,
          },
          orderBy: { occurredAt: 'asc' },
        },
        participants: {
          where: { role: 'STUDENT' },
          select: { studentId: true, minutesPresent: true },
        },
      },
    });

    if (!session) throw AppError.notFound('Class');
    // Staff may prefill any class; a teacher only the class they ran.
    await this.policies.assertClassControl(subject, classId);

    if (session.lessonCard?.submittedAt) {
      throw new AppError(ErrorCode.CONFLICT, 'This lesson card has already been submitted', {
        lessonCardId: session.lessonCard.id,
        locked: Boolean(session.lessonCard.lockedAt),
      });
    }

    const primaryStudentId = session.students[0]?.studentId ?? null;

    return {
      classId,
      course: session.course,
      teacherName: session.teacher.user.name,
      classStartedAt: session.startsAt.toISOString(),
      classEndedAt: session.endsAt.toISOString(),
      mushafLayout: session.mushafLayout,
      pagesShown: session.lastPage ? { lastPage: session.lastPage } : null,
      attendance: session.participants.map((p) => ({
        studentId: p.studentId,
        minutesPresent: p.minutesPresent,
      })),
      students: session.students.map((s) => ({
        id: s.student.id,
        displayName: s.student.displayName,
        mistakes: session.mistakes.filter((m) => m.studentId === s.studentId),
      })),
      mistakes: session.mistakes,
      primaryStudentId,
      // The starting point the teacher edits, not a blank form.
      portions: defaultPortions(session.mistakes, primaryStudentId),
      readyToSubmit: session.mistakes.length >= 0,
    };
  }

  // ── Submit (FR-REC-03) ────────────────────────────────────────────────────

  async submit(input: SubmitLessonCardInput, actor: AuthenticatedUser) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: input.classId },
      select: {
        id: true,
        teacher: { select: { id: true, userId: true } },
        courseId: true,
        students: { select: { studentId: true } },
        lessonCard: { select: { id: true, submittedAt: true } },
      },
    });

    if (!session) throw AppError.notFound('Class');
    if (session.teacher.userId !== actor.id) {
      throw AppError.forbidden('Only the teacher who ran this class can submit its lesson card');
    }
    if (session.lessonCard?.submittedAt) {
      throw new AppError(ErrorCode.CONFLICT, 'This lesson card has already been submitted', {
        lessonCardId: session.lessonCard.id,
      });
    }

    const studentId = session.students[0]?.studentId;
    if (!studentId) throw AppError.badRequest('This class has no students');

    this.validatePortions(input.portions);

    const submittedAt = new Date();

    const card = await this.prisma.lessonCard.create({
      data: {
        classId: input.classId,
        // LessonCard.teacher_id references `user`, while ClassSession.teacher_id
        // references `teacher_profile`. Passing the profile id here is an FK violation.
        teacherId: session.teacher.userId,
        studentId,
        homework: input.homework ?? null,
        parentNote: input.parentNote ?? null,
        submittedAt,
        portions: {
          create: input.portions.map((portion, index) => ({
            kind: portion.kind,
            fromSurah: portion.fromSurah ?? null,
            fromAyah: portion.fromAyah ?? null,
            toSurah: portion.toSurah ?? null,
            toAyah: portion.toAyah ?? null,
            grade: portion.grade ?? null,
            position: index,
          })),
        },
      },
      select: { id: true, submittedAt: true, portions: true },
    });

    // FR-REC-06 — the family must hear within 15 minutes of the class ending.
    await this.reminders.scheduleLessonCardShare(card.id);
    await this.scheduleLock(card.id, submittedAt);

    // The mistakes belong on the card so the family's view is one document, not a
    // join across two tables. Scoped by student: without it, every child's mistakes in
    // the class would be attached to this one card and shown to this one family.
    await this.prisma.mistake.updateMany({
      where: { classId: input.classId, studentId, lessonCardId: null },
      data: { lessonCardId: card.id },
    });

    this.logger.log(`Lesson card ${card.id} submitted for class ${input.classId}`);
    return card;
  }

  // ── The 48-hour lock (FR-REC-08) ──────────────────────────────────────────

  /**
   * Queues the 48-hour lock.
   *
   * Idempotent by construction: the worker derives the lock instant from
   * `submitted_at` rather than from when the job happened to run, so a retry or a
   * replayed job cannot lock the card at the wrong moment.
   */
  private async scheduleLock(lessonCardId: string, submittedAt: Date): Promise<void> {
    const lockAt = submittedAt.getTime() + LESSON_CARD_LOCK_HOURS * 3_600_000;
    const delayMs = lockAt - Date.now();
    if (delayMs <= 0) return;

    await this.queues.addDelayed(QUEUE.LESSON_CARD, 'lock-lesson-card', { lessonCardId }, delayMs);
  }

  /** True once the card is past its 48 hour window, whether or not the job has run. */
  isLocked(card: { submittedAt: Date | null; lockedAt: Date | null }, now = new Date()): boolean {
    if (card.lockedAt) return true;
    if (!card.submittedAt) return false;
    return now.getTime() >= card.submittedAt.getTime() + LESSON_CARD_LOCK_HOURS * 3_600_000;
  }

  /**
   * Edits a card, honouring the lock.
   *
   * Below the lock the owning teacher may edit freely. At or after it, only
   * SUPERVISOR/SUPER_ADMIN may, a reason is mandatory, and the before/after is written
   * to `lesson_edit_log` in the same transaction as the change — so the log can never
   * disagree with the record.
   */
  async update(lessonCardId: string, patch: UpdateLessonCardInput, actor: AuthenticatedUser) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: {
        id: true,
        teacher: { select: { id: true } },
        studentId: true,
        submittedAt: true,
        lockedAt: true,
        homework: true,
        parentNote: true,
        portions: {
          select: {
            id: true,
            kind: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            grade: true,
            position: true,
          },
        },
      },
    });
    if (!card) throw AppError.notFound('Lesson card');

    const locked = this.isLocked(card);
    const isOwner = card.teacher.id === actor.id;
    const isSupervisor = hasAnyRole({ userId: actor.id, roles: actor.roles }, [
      Role.SUPERVISOR,
      Role.ADMIN,
      Role.SUPER_ADMIN,
    ]);

    if (locked && !isSupervisor) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        `FR-REC-08: this lesson card is locked ${LESSON_CARD_LOCK_HOURS} hours after submission; ` +
          'only a supervisor may change it, and the change is recorded',
        { lockedAt: (card.lockedAt ?? card.submittedAt)?.toISOString() ?? null },
      );
    }

    if (!locked && !isOwner && !isSupervisor) {
      throw AppError.forbidden(
        'Only the teacher who wrote this card, or a supervisor, may edit it',
      );
    }

    if (locked && isSupervisor && !isOwner && !patch.reason) {
      throw AppError.badRequest('A supervisor edit to a locked card must state a reason');
    }

    if (patch.portions) this.validatePortions(patch.portions);

    const before = {
      homework: card.homework,
      parentNote: card.parentNote,
      portions: card.portions,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (patch.portions) {
        await tx.lessonPortion.deleteMany({ where: { lessonCardId } });
        await tx.lessonPortion.createMany({
          data: patch.portions.map((portion, index) => ({
            lessonCardId,
            kind: portion.kind,
            fromSurah: portion.fromSurah ?? null,
            fromAyah: portion.fromAyah ?? null,
            toSurah: portion.toSurah ?? null,
            toAyah: portion.toAyah ?? null,
            grade: portion.grade ?? null,
            position: index,
          })),
        });
      }

      const result = await tx.lessonCard.update({
        where: { id: lessonCardId },
        data: {
          ...(patch.homework !== undefined ? { homework: patch.homework } : {}),
          ...(patch.parentNote !== undefined ? { parentNote: patch.parentNote } : {}),
        },
        select: { id: true, homework: true, parentNote: true, submittedAt: true, lockedAt: true },
      });

      if (locked) {
        await tx.lessonEditLog.create({
          data: {
            lessonCardId,
            editorId: actor.id,
            before: before as never,
            after: {
              homework: result.homework,
              parentNote: result.parentNote,
              portions: patch.portions ?? before.portions,
            } as never,
            reason: patch.reason ?? null,
          },
        });
      }

      return result;
    });

    if (locked) {
      this.logger.warn(
        `FR-REC-08: supervisor ${actor.id} edited locked lesson card ${lessonCardId} — logged`,
      );
    }

    return { ...updated, locked, loggedAsSupervisorEdit: locked };
  }

  /** FR-REC-08 — the audit trail a parent or supervisor can be shown. */
  async editLog(lessonCardId: string, actor: AuthenticatedUser) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: { id: true, teacherId: true },
    });
    if (!card) throw AppError.notFound('Lesson card');

    // The log holds full before/after snapshots (homework, parent notes, portions), so
    // it is staff or the card's own author only — not "any teacher".
    const isStaff = hasAnyRole({ userId: actor.id, roles: actor.roles }, STAFF_SCOPE_ROLES);
    if (!isStaff && card.teacherId !== actor.id) {
      throw AppError.notOwner();
    }

    return this.prisma.lessonEditLog.findMany({
      where: { lessonCardId },
      select: {
        id: true,
        before: true,
        after: true,
        reason: true,
        editedAt: true,
        editor: { select: { id: true, name: true } },
      },
      orderBy: { editedAt: 'desc' },
    });
  }

  // ── AI summary (FR-REC-05) ────────────────────────────────────────────────

  /**
   * Stores a drafted parent-facing summary and requires explicit approval before it
   * can be sent. The prompt is built from the lesson card only — never from Quran
   * text (TRD section 15).
   */
  async saveAiDraft(lessonCardId: string, draft: string, actorUserId: string) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: { id: true, teacher: { select: { id: true } }, submittedAt: true },
    });
    if (!card) throw AppError.notFound('Lesson card');
    if (card.teacher.id !== actorUserId) {
      throw AppError.forbidden('Only the class teacher may revise the summary draft');
    }

    return this.prisma.lessonCard.update({
      where: { id: lessonCardId },
      data: { aiSummaryDraft: draft },
      select: { id: true, aiSummaryDraft: true, summaryApprovedAt: true },
    });
  }

  async approveAiSummary(lessonCardId: string, actorUserId: string) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: { id: true, aiSummaryDraft: true, teacher: { select: { id: true } } },
    });
    if (!card) throw AppError.notFound('Lesson card');
    if (card.teacher.id !== actorUserId) {
      throw AppError.forbidden('Only the class teacher may approve the summary');
    }
    if (!card.aiSummaryDraft) {
      throw AppError.badRequest('There is no draft summary to approve');
    }

    const approvedAt = new Date();
    await this.prisma.lessonCard.update({
      where: { id: lessonCardId },
      data: { summaryApprovedAt: approvedAt },
    });

    // Only now may it reach the family.
    await this.scheduleLessonCardShareNow(lessonCardId);

    return { approvedAt: approvedAt.toISOString() };
  }

  /** FR-REC-05 — approval is the trigger for the written summary, not submission. */
  private async scheduleLessonCardShareNow(lessonCardId: string): Promise<void> {
    await this.queues.add(QUEUE.LESSON_CARD, 'share-lesson-card', { lessonCardId });
  }

  private async guardianIdsForLessonCard(lessonCardId: string): Promise<string[]> {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: {
        student: {
          select: {
            family: {
              select: { members: { where: { isPrimary: true }, select: { userId: true } } },
            },
          },
        },
      },
    });
    return card?.student.family.members.map((m) => m.userId) ?? [];
  }

  // ── Reads (FR-REC-06, PAR-BE-02) ──────────────────────────────────────────

  async get(lessonCardId: string, actor: AuthenticatedUser) {
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: lessonCardId },
      select: {
        id: true,
        classId: true,
        studentId: true,
        homework: true,
        parentNote: true,
        aiSummaryDraft: true,
        summaryApprovedAt: true,
        submittedAt: true,
        sharedAt: true,
        lockedAt: true,
        student: { select: { id: true, displayName: true } },
        teacher: { select: { id: true, name: true } },
        portions: {
          select: {
            id: true,
            kind: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            grade: true,
          },
          orderBy: { position: 'asc' },
        },
        mistakes: {
          select: {
            id: true,
            surah: true,
            ayah: true,
            wordIndex: true,
            type: true,
            tajweedRule: true,
          },
          orderBy: { occurredAt: 'asc' },
        },
        class: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            mushafLayout: true,
            tajweedColours: true,
            recording: { select: { id: true, storageKey: true, status: true } },
          },
        },
      },
    });

    if (!card) throw AppError.notFound('Lesson card');

    const isStaff = hasAnyRole({ userId: actor.id, roles: actor.roles }, STAFF_SCOPE_ROLES);
    const isOwningTeacher = card.teacher.id === actor.id;

    // The route carries no `@Roles`, so the caller is resolved as staff, the owning
    // teacher, the child themselves, a guardian, or an enrolled teacher — never the
    // guardian-only test that locked a student out of their own card.
    if (!isStaff && !isOwningTeacher) {
      const canRead = await this.policies.canAccessStudent(
        { userId: actor.id, roles: actor.roles },
        card.studentId,
      );
      if (!canRead) throw AppError.notOwner();
    }

    // FR-REC-05 — a draft reaches a parent only once the teacher has approved it.
    const hideDraft = !isStaff && !isOwningTeacher && !card.summaryApprovedAt;

    // S13 — the list already hid unshared cards from non-staff readers; `get()` did not,
    // so a guardian who knew (or guessed) a card id could read a draft the teacher had not
    // finished. The same rule applies here as in the list: unshared means not yours yet.
    const isFamilyReader = !isStaff && !isOwningTeacher;
    if (isFamilyReader && !card.sharedAt) {
      throw AppError.notFound('Lesson card');
    }

    // The recording is the teacher's audio of the child. It is part of the card for staff
    // and the owning teacher; a family gets a reference they can play through the portal
    // instead of the storage key, which is an internal object-store path (CR-07).
    const recording = card.class.recording;

    return {
      ...card,
      class: {
        ...card.class,
        recording:
          isFamilyReader && recording ? { id: recording.id, status: recording.status } : recording,
      },
      aiSummaryDraft: hideDraft ? null : card.aiSummaryDraft,
      locked: this.isLocked(card),
    };
  }

  async listForStudent(studentId: string, actor: AuthenticatedUser) {
    const isStaff = hasAnyRole({ userId: actor.id, roles: actor.roles }, STAFF_SCOPE_ROLES);
    if (!isStaff) {
      const canRead = await this.policies.canAccessStudent(
        { userId: actor.id, roles: actor.roles },
        studentId,
      );
      if (!canRead) throw AppError.notOwner();
    }

    return this.prisma.lessonCard.findMany({
      where: { studentId, ...(isStaff ? {} : { sharedAt: { not: null } }) },
      select: {
        id: true,
        submittedAt: true,
        sharedAt: true,
        lockedAt: true,
        homework: true,
        student: { select: { displayName: true } },
        teacher: { select: { name: true } },
        portions: {
          select: {
            kind: true,
            fromSurah: true,
            fromAyah: true,
            toSurah: true,
            toAyah: true,
            grade: true,
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });
  }

  private async teacherProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  private validatePortions(portions: LessonPortionInput[]): void {
    if (!Array.isArray(portions) || portions.length === 0) {
      throw AppError.badRequest('A lesson card needs at least one portion');
    }

    for (const portion of portions) {
      for (const [field, value] of Object.entries({
        fromSurah: portion.fromSurah,
        toSurah: portion.toSurah,
      })) {
        if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 114)) {
          throw AppError.badRequest(`${field} must be between 1 and 114`);
        }
      }
      for (const [field, value] of Object.entries({
        fromAyah: portion.fromAyah,
        toAyah: portion.toAyah,
      })) {
        if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
          throw AppError.badRequest(`${field} must be 1 or greater`);
        }
      }
    }
  }
}

/**
 * Proposes Sabaq / Sabqi / Manzil from the mistakes the teacher actually marked.
 *
 * It is a *proposal*: the teacher confirms or corrects it. Guessing at what a child
 * memorised today is a judgement call, and a wrong guess in the permanent record is
 * worse than an empty field.
 */
function defaultPortions(
  mistakes: Array<{ studentId: string; surah: number; ayah: number; type: string }>,
  primaryStudentId: string | null,
): LessonPortionInput[] {
  if (!primaryStudentId) return [];

  const positions = mistakes
    .filter((m) => m.studentId === primaryStudentId)
    .map((m) => ({ surah: m.surah, ayah: m.ayah }));

  if (positions.length === 0) return [];

  const surahs = positions.map((p) => p.surah);
  const fromSurah = Math.min(...surahs);
  const toSurah = Math.max(...surahs);
  const fromAyah = Math.min(...positions.filter((p) => p.surah === fromSurah).map((p) => p.ayah));
  const toAyah = Math.max(...positions.filter((p) => p.surah === toSurah).map((p) => p.ayah));

  return [{ kind: PortionKind.SABAQ, fromSurah, fromAyah, toSurah, toAyah, grade: Grade.GOOD }];
}
