import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';
import { AuditService } from '../audit/audit.service';

const MAX_BODY = 4000;

/**
 * Family ↔ teacher messaging (FR-PAR-06, PAR-FE-06).
 *
 * The rules exist because a message thread is a place where private information about
 * a child lives, and it is the one endpoint a parent uses most casually:
 *
 *   - **A thread is between one family and one teacher, pinned to one enrolment.**
 *     There is deliberately no group thread and no "message the school" channel:
 *     broadcasting about a child to another family is the failure this model prevents.
 *
 *   - **A teacher may not start the conversation.** Contact is one-directional by
 *     design — the family initiates, and an unsolicited teacher message is both a
 *     marketing vector and a way to message a family who never asked. Once the family
 *     has replied, the thread is open both ways.
 *
 *   - **Nothing is deleted.** Messages are retained for the retention window so that a
 *     safeguarding or billing dispute has a record; this is a messaging feature, not a
 *     support-ticket system.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Finds or creates the thread for a family-teacher-student pair.
   *
   * Keyed on the triple rather than the pair so a family with two children taught by
   * the same teacher keeps separate conversations — mixing two children's progress into
   * one thread is exactly the confidentiality bug this design avoids.
   */
  async openThread(input: {
    familyId: string;
    teacherId: string;
    studentId?: string;
    enrolmentId?: string;
    actorId: string;
    actorRole: 'GUARDIAN' | 'STAFF';
  }) {
    await this.assertActorMayMessage(input);

    const where = {
      familyId: input.familyId,
      teacherId: input.teacherId,
      studentId: input.studentId ?? null,
    };

    const existing = await this.prisma.messageThread.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    try {
      return await this.prisma.messageThread.create({
        data: {
          familyId: input.familyId,
          teacherId: input.teacherId,
          studentId: input.studentId ?? null,
          enrolmentId: input.enrolmentId ?? null,
        },
      });
    } catch (error) {
      // Two taps on "Message teacher" from a flaky connection race here. The loser's
      // insert fails on the same lookup, so re-reading returns the winner's thread
      // rather than surfacing a duplicate-thread error to the family.
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.messageThread.findFirst({
          where,
          orderBy: { createdAt: 'desc' },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async assertActorMayMessage(input: {
    familyId: string;
    teacherId: string;
    studentId?: string;
    actorId: string;
    actorRole: 'GUARDIAN' | 'STAFF';
  }): Promise<void> {
    if (input.actorRole === 'GUARDIAN') {
      await this.policy.assertGuardianInFamily(input.actorId, input.familyId);

      // A family may only open a thread about a child of theirs, and only with a
      // teacher who actually teaches that child.
      if (input.studentId) {
        await this.policy.assertGuardianOwnsStudent(input.actorId, input.studentId);
        const teaches = await this.prisma.enrolment.count({
          where: {
            studentId: input.studentId,
            teacherId: input.teacherId,
            status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
          },
          take: 1,
        });
        if (teaches === 0) {
          throw AppError.forbidden('That teacher does not teach your child');
        }
      }
      return;
    }

    const teaches = await this.prisma.teacherProfile.count({
      where: { id: input.teacherId, userId: input.actorId },
      take: 1,
    });
    if (teaches === 0) throw AppError.forbidden('You can only message families you teach');
  }

  /**
   * Posts a message.
   *
   * `actorRole` is passed explicitly rather than derived from the token, because the
   * caller must state which side they are writing as — the authorisation check depends
   * on it and deriving it silently is how a guardian ends up writing into a staff
   * channel.
   */
  async postMessage(input: {
    threadId: string;
    senderId: string;
    body: string;
    senderRole: 'GUARDIAN' | 'STAFF';
  }) {
    const body = input.body.trim();
    if (!body) throw AppError.badRequest('Message body cannot be empty');
    if (body.length > MAX_BODY) {
      throw AppError.badRequest(`Message body must be at most ${MAX_BODY} characters`, {
        length: body.length,
      });
    }

    const thread = await this.prisma.messageThread.findUnique({ where: { id: input.threadId } });
    if (!thread) throw AppError.notFound('Thread');

    if (input.senderRole === 'GUARDIAN') {
      await this.policy.assertGuardianInFamily(input.senderId, thread.familyId);
    } else {
      const owns = await this.prisma.teacherProfile.count({
        where: { id: thread.teacherId, userId: input.senderId },
        take: 1,
      });
      if (owns === 0) throw AppError.forbidden('You can only post in threads you own');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { threadId: input.threadId, senderId: input.senderId, body },
      });

      // Bump the thread so the conversation list sorts by recent activity.
      await tx.messageThread.update({
        where: { id: input.threadId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    return message;
  }

  /** Thread list for one side of the conversation. */
  async listThreads(input: { userId: string; role: 'GUARDIAN' | 'STAFF' }) {
    if (input.role === 'GUARDIAN') {
      const families = await this.prisma.familyMember.findMany({
        where: { userId: input.userId },
        select: { familyId: true },
      });
      const familyIds = families.map((f) => f.familyId);
      if (familyIds.length === 0) return [];

      return this.prisma.messageThread.findMany({
        where: { familyId: { in: familyIds } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          family: { select: { id: true, name: true } },
          teacher: { select: { photoUrl: true, user: { select: { name: true } } } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
    }

    const profile = await this.prisma.teacherProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (!profile) return [];

    const threads = await this.prisma.messageThread.findMany({
      where: { teacherId: profile.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        family: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    // `message_thread` stores `student_id` without a relation, so the child's name is
    // resolved separately rather than adding a cascade to the student record.
    const students = await this.prisma.student.findMany({
      where: {
        id: { in: threads.map((t) => t.studentId).filter((id): id is string => Boolean(id)) },
      },
      select: { id: true, displayName: true },
    });
    const names = new Map(students.map((s) => [s.id, s.displayName]));

    return threads.map((t) => ({
      ...t,
      studentName: t.studentId ? (names.get(t.studentId) ?? null) : null,
    }));
  }

  /** Full thread with messages, paginated oldest-first for reading order. */
  async getThread(input: {
    threadId: string;
    userId: string;
    role: 'GUARDIAN' | 'STAFF';
    limit?: number;
  }) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: input.threadId },
      include: {
        family: { select: { id: true, name: true } },
        teacher: { select: { photoUrl: true, user: { select: { name: true } } } },
      },
    });
    if (!thread) throw AppError.notFound('Thread');

    if (input.role === 'GUARDIAN') {
      await this.policy.assertGuardianInFamily(input.userId, thread.familyId);
    } else {
      const owns = await this.prisma.teacherProfile.count({
        where: { id: thread.teacherId, userId: input.userId },
        take: 1,
      });
      if (owns === 0) throw AppError.forbidden('You can only read threads you own');
    }

    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    const messages = await this.prisma.message.findMany({
      where: { threadId: input.threadId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, name: true } } },
    });

    // Mark as read on the other side's behalf so the unread badge updates without the
    // reader having to make a second request.
    await this.prisma.message.updateMany({
      where: { threadId: input.threadId, readAt: null, senderId: { not: input.userId } },
      data: { readAt: new Date() },
    });

    return { thread, messages: messages.reverse() };
  }
}

/** Prisma surfaces a unique-constraint failure as P2002. */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}
