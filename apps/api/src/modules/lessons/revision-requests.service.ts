import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma, RevisionRequestReason, RevisionRequestStatus } from '@prisma/client';
import { ErrorCode, Role } from '@hifzoon/shared';

import { AuthenticatedUser } from '../../common/decorators';
import { AppError } from '../../common/errors/app-error';
import {
  hasAnyRole,
  isScopedSupervisor,
  PolicyService,
} from '../../common/services/policy.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { MessagingService } from '../parent-portal/messaging.service';

export const REVISION_MESSAGE_MAX = 1000;

/** Staff who see and answer every family's requests. */
const RESPONDER_STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR'];

export const REVISION_REASON_LABELS: Record<RevisionRequestReason, string> = {
  REVISIT_PORTION: 'Revisit a portion',
  MISTAKE_QUESTION: 'Question about a mistake',
  EXTRA_CLASS: 'Request a makeup/extra class',
  OTHER: 'Other',
};

/**
 * Whose requests a list returns. Explicit rather than inferred from roles: every account
 * holds GUARDIAN (FR-AUTH-02), so a teacher who is also a parent would otherwise get their
 * own family's requests mixed into their teaching queue.
 */
export type RevisionScope = 'family' | 'teacher' | 'all';

const REQUEST_SELECT = {
  id: true,
  lessonCardId: true,
  studentId: true,
  familyId: true,
  reason: true,
  message: true,
  status: true,
  response: true,
  respondedAt: true,
  closedAt: true,
  threadId: true,
  createdAt: true,
  requestedBy: { select: { id: true, name: true } },
  respondedBy: { select: { id: true, name: true } },
  student: { select: { id: true, displayName: true } },
  lessonCard: {
    select: {
      id: true,
      teacher: { select: { id: true, name: true } },
      class: { select: { startsAt: true } },
    },
  },
} satisfies Prisma.RevisionRequestSelect;

/**
 * Family follow-ups on a shared lesson card. A guardian raises one, the card's teacher
 * (or a supervisor) answers it, and the guardian closes it once they are satisfied.
 */
@Injectable()
export class RevisionRequestsService {
  private readonly logger = new Logger(RevisionRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly config?: AppConfigService,
    @Optional() private readonly messaging?: MessagingService,
  ) {}

  async create(input: {
    lessonCardId: string;
    reason: RevisionRequestReason;
    message: string;
    actor: AuthenticatedUser;
  }) {
    const message = input.message.trim();
    if (!message || message.length > REVISION_MESSAGE_MAX) {
      throw AppError.badRequest(`The message must be 1 to ${REVISION_MESSAGE_MAX} characters`);
    }
    const card = await this.prisma.lessonCard.findUnique({
      where: { id: input.lessonCardId },
      select: {
        id: true,
        studentId: true,
        sharedAt: true,
        teacherId: true,
        class: { select: { startsAt: true } },
        student: { select: { displayName: true, familyId: true } },
      },
    });
    if (!card) throw AppError.notFound('Lesson card');
    await this.policies.assertGuardianOwnsStudent(input.actor.id, card.studentId);
    // The family has not seen an unshared card, so it cannot be asking about one; answering
    // "not found" matches what reading it returns and does not confirm the card exists.
    if (!card.sharedAt) throw AppError.notFound('Lesson card');

    const threadId = await this.threadFor({
      familyId: card.student.familyId,
      teacherUserId: card.teacherId,
      studentId: card.studentId,
      actorId: input.actor.id,
    });

    const created = await this.prisma.revisionRequest.create({
      data: {
        lessonCardId: card.id,
        studentId: card.studentId,
        familyId: card.student.familyId,
        requestedById: input.actor.id,
        reason: input.reason,
        message,
        threadId,
      },
      select: REQUEST_SELECT,
    });

    // The request is posted into the family's conversation with the teacher, so the family
    // has one place to talk; the new-message notification then tells the teacher. Without a
    // thread (no teacher profile, no enrolment) the dedicated notification is the fallback.
    if (threadId && this.messaging) {
      try {
        await this.messaging.postMessage({
          threadId,
          senderId: input.actor.id,
          senderRole: 'GUARDIAN',
          body:
            `Revision request — ${REVISION_REASON_LABELS[input.reason]} — lesson card ` +
            `${card.class.startsAt.toISOString().slice(0, 10)}: ${message}`,
        });
        return created;
      } catch (err) {
        this.logger.warn(
          `Revision request ${created.id} not posted to thread ${threadId}: ${(err as Error).message}`,
        );
      }
    }

    await this.notifications
      .enqueue({
        userIds: [card.teacherId],
        template: TEMPLATE.REVISION_REQUESTED,
        data: {
          studentName: card.student.displayName,
          guardianName: created.requestedBy.name,
          lessonDate: card.class.startsAt.toISOString().slice(0, 10),
          reasonLabel: REVISION_REASON_LABELS[input.reason],
          message,
          url: `${this.webUrl()}/teacher/revision-requests`,
        },
      })
      .catch((err) =>
        this.logger.warn(
          `Teacher not told about revision request ${created.id}: ${(err as Error).message}`,
        ),
      );

    return created;
  }

  async list(input: {
    actor: AuthenticatedUser;
    scope: RevisionScope;
    lessonCardId?: string;
    status?: RevisionRequestStatus;
  }) {
    return this.prisma.revisionRequest.findMany({
      where: await this.scopeWhere(input),
      select: REQUEST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async count(input: {
    actor: AuthenticatedUser;
    scope: RevisionScope;
    status?: RevisionRequestStatus;
  }) {
    return {
      count: await this.prisma.revisionRequest.count({ where: await this.scopeWhere(input) }),
    };
  }

  async respond(input: { id: string; response: string; actor: AuthenticatedUser }) {
    const response = input.response.trim();
    if (!response || response.length > 2000) {
      throw AppError.badRequest('The reply must be 1 to 2000 characters');
    }
    const request = await this.prisma.revisionRequest.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        status: true,
        response: true,
        familyId: true,
        lessonCardId: true,
        threadId: true,
        student: { select: { displayName: true } },
        lessonCard: { select: { teacherId: true } },
      },
    });
    if (!request) throw AppError.notFound('Revision request');
    const isStaff = hasAnyRole(
      { userId: input.actor.id, roles: input.actor.roles },
      RESPONDER_STAFF_ROLES,
    );
    if (!isStaff && request.lessonCard.teacherId !== input.actor.id) {
      throw AppError.notOwner();
    }
    // A supervisor answers only for the teachers they are assigned to; out of scope reads as missing.
    if (
      isScopedSupervisor({ userId: input.actor.id, roles: input.actor.roles }) &&
      request.lessonCard.teacherId !== input.actor.id &&
      !(await this.policies.supervisesTeacherUser(input.actor.id, request.lessonCard.teacherId))
    ) {
      throw AppError.notFound('Revision request');
    }
    if (request.status === RevisionRequestStatus.CLOSED) {
      throw AppError.conflict(ErrorCode.CONFLICT, 'The family has already closed this request');
    }

    // The card's teacher answers in the conversation too, so both reply paths end in the
    // same state. A supervisor is not a party to the thread and answers on the request only.
    let postedToThread = false;
    if (request.threadId && this.messaging && request.lessonCard.teacherId === input.actor.id) {
      try {
        await this.messaging.postMessage({
          threadId: request.threadId,
          senderId: input.actor.id,
          senderRole: 'STAFF',
          body: response,
        });
        postedToThread = true;
      } catch (err) {
        this.logger.warn(
          `Reply to ${request.id} not posted to thread ${request.threadId}: ${(err as Error).message}`,
        );
      }
    }

    const updated = await this.prisma.revisionRequest.update({
      where: { id: request.id },
      data: {
        status: RevisionRequestStatus.ANSWERED,
        response,
        respondedById: input.actor.id,
        respondedAt: new Date(),
      },
      select: REQUEST_SELECT,
    });

    await this.audit.record({
      actorId: input.actor.id,
      action: 'rec.revision-request.respond',
      targetType: 'revision_request',
      targetId: request.id,
      before: { status: request.status, response: request.response },
      after: { status: updated.status, response: updated.response },
    });

    // The message already notified the family; one notification per event.
    if (postedToThread) return updated;

    try {
      const guardians = await this.prisma.familyMember.findMany({
        where: { familyId: request.familyId },
        select: { userId: true },
      });
      if (guardians.length > 0) {
        await this.notifications.enqueue({
          userIds: guardians.map((g) => g.userId),
          template: TEMPLATE.REVISION_ANSWERED,
          data: {
            studentName: request.student.displayName,
            responderName: updated.respondedBy?.name ?? 'The academy',
            response,
            url: `${this.webUrl()}/parent/lesson-cards/${request.lessonCardId}`,
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Family not told about the reply to ${request.id}: ${(err as Error).message}`,
      );
    }

    return updated;
  }

  async close(input: { id: string; actor: AuthenticatedUser }) {
    const request = await this.prisma.revisionRequest.findUnique({
      where: { id: input.id },
      select: { id: true, familyId: true, status: true },
    });
    if (!request) throw AppError.notFound('Revision request');
    await this.policies.assertGuardianInFamily(input.actor.id, request.familyId);
    if (request.status === RevisionRequestStatus.CLOSED) {
      return this.prisma.revisionRequest.findUniqueOrThrow({
        where: { id: request.id },
        select: REQUEST_SELECT,
      });
    }
    return this.prisma.revisionRequest.update({
      where: { id: request.id },
      data: { status: RevisionRequestStatus.CLOSED, closedAt: new Date() },
      select: REQUEST_SELECT,
    });
  }

  /**
   * The family-teacher-child thread a request is posted into, opened under the normal
   * messaging rules. If those refuse (the enrolment has ended) an existing thread is reused;
   * otherwise the request stands on its own.
   */
  private async threadFor(input: {
    familyId: string;
    teacherUserId: string;
    studentId: string;
    actorId: string;
  }): Promise<string | null> {
    if (!this.messaging) return null;
    try {
      const profile = await this.prisma.teacherProfile.findUnique({
        where: { userId: input.teacherUserId },
        select: { id: true },
      });
      if (!profile) return null;
      try {
        const thread = await this.messaging.openThread({
          familyId: input.familyId,
          teacherId: profile.id,
          studentId: input.studentId,
          actorId: input.actorId,
          actorRole: 'GUARDIAN',
        });
        return thread.id;
      } catch {
        const existing = await this.prisma.messageThread.findFirst({
          where: { familyId: input.familyId, teacherId: profile.id, studentId: input.studentId },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        return existing?.id ?? null;
      }
    } catch (err) {
      this.logger.warn(`No message thread for a revision request: ${(err as Error).message}`);
      return null;
    }
  }

  /** The row set comes from the caller's identity; the filters only narrow it. */
  private async scopeWhere(input: {
    actor: AuthenticatedUser;
    scope: RevisionScope;
    lessonCardId?: string;
    status?: RevisionRequestStatus;
  }): Promise<Prisma.RevisionRequestWhereInput> {
    const subject = { userId: input.actor.id, roles: input.actor.roles };
    let scope: Prisma.RevisionRequestWhereInput;
    if (input.scope === 'all') {
      if (!hasAnyRole(subject, RESPONDER_STAFF_ROLES)) {
        throw AppError.forbidden('Only supervisors and admins can see every request');
      }
      // A supervisor assigned to specific teachers sees only requests on those teachers' cards.
      // (A card's teacher is a user id, so the assignments are mapped to user ids.)
      scope = isScopedSupervisor(subject)
        ? {
            lessonCard: {
              teacherId: {
                in: (
                  await this.prisma.supervisorAssignment.findMany({
                    where: { supervisorId: subject.userId },
                    select: { teacher: { select: { userId: true } } },
                  })
                ).map((a) => a.teacher.userId),
              },
            },
          }
        : {};
    } else if (input.scope === 'teacher') {
      if (!subject.roles.includes(Role.TEACHER)) {
        throw AppError.forbidden('Only teachers have a revision request queue');
      }
      scope = { lessonCard: { teacherId: subject.userId } };
    } else {
      scope = { family: { members: { some: { userId: subject.userId } } } };
    }
    return {
      AND: [
        scope,
        ...(input.lessonCardId ? [{ lessonCardId: input.lessonCardId }] : []),
        ...(input.status ? [{ status: input.status }] : []),
      ],
    };
  }

  private webUrl(): string {
    return (this.config?.value.APP_WEB_URL ?? '').replace(/\/$/, '');
  }
}
