import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AppError } from '../../common/errors/app-error';
import { isScopedSupervisor } from '../../common/services/policy.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface MessageViewer {
  userId: string;
  roles: string[];
}

/**
 * Read-only access to guardian ↔ teacher conversations for quality oversight (FR-PAR-07).
 *
 * Three rules keep this from becoming a way to browse families' private messages:
 *   - **Scope.** A supervisor sees only threads of the teachers assigned to them.
 *   - **Read-only.** There is no way to post here, and reading does not mark anything read,
 *     so the family and teacher never see a change in their own unread counts.
 *   - **Traceable.** Opening a conversation writes an audit entry naming the supervisor and
 *     the thread (the message text is not copied into the log). Listing does not.
 */
@Injectable()
export class SupervisorMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listThreads(
    viewer: MessageViewer,
    filter: { teacherId?: string; q?: string; page?: number; limit?: number } = {},
  ) {
    const scope = await this.teacherScope(viewer);
    if (filter.teacherId && scope && !scope.includes(filter.teacherId)) {
      throw AppError.forbidden('That teacher is not on your caseload');
    }
    const q = filter.q?.trim();
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
    const where: Prisma.MessageThreadWhereInput = {
      ...(filter.teacherId
        ? { teacherId: filter.teacherId }
        : scope
          ? { teacherId: { in: scope } }
          : {}),
      ...(q
        ? {
            OR: [
              { family: { name: { contains: q, mode: 'insensitive' } } },
              { teacher: { user: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [threads, total] = await this.prisma.$transaction([
      this.prisma.messageThread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          family: { select: { id: true, name: true } },
          teacher: { select: { id: true, user: { select: { name: true } } } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, senderId: true },
          },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.messageThread.count({ where }),
    ]);
    // Only the time and count of the last message: the text is read by opening the thread,
    // which is the audited step.
    return {
      items: threads.map((t) => ({
        id: t.id,
        family: t.family,
        teacher: { id: t.teacher.id, name: t.teacher.user.name },
        studentId: t.studentId,
        messageCount: t._count.messages,
        lastMessageAt: t.messages[0]?.createdAt ?? null,
        updatedAt: t.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async getThread(viewer: MessageViewer, threadId: string, limit = 200) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        family: { select: { id: true, name: true } },
        teacher: { select: { id: true, userId: true, user: { select: { name: true } } } },
      },
    });
    if (!thread) throw AppError.notFound('Thread');
    const scope = await this.teacherScope(viewer);
    // Out of scope reads as not found, like everything else a supervisor cannot see.
    if (scope && !scope.includes(thread.teacherId)) throw AppError.notFound('Thread');

    const messages = await this.prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: { select: { name: true } },
      },
    });

    await this.audit.record({
      actorId: viewer.userId,
      action: 'par.messages.supervisorView',
      targetType: 'message_thread',
      targetId: threadId,
      after: { familyId: thread.familyId, teacherId: thread.teacherId, messages: messages.length },
    });

    return {
      thread: {
        id: thread.id,
        family: thread.family,
        teacher: { id: thread.teacher.id, name: thread.teacher.user.name },
        studentId: thread.studentId,
      },
      readOnly: true as const,
      messages: messages.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        sentAt: m.createdAt,
        from: m.senderId === thread.teacher.userId ? ('TEACHER' as const) : ('GUARDIAN' as const),
        senderName: m.sender.name,
      })),
    };
  }

  /** TeacherProfile ids the viewer may read, or null when they may read every teacher's. */
  private async teacherScope(viewer: MessageViewer): Promise<string[] | null> {
    if (!isScopedSupervisor(viewer)) return null;
    const rows = await this.prisma.supervisorAssignment.findMany({
      where: { supervisorId: viewer.userId },
      select: { teacherId: true },
    });
    return rows.map((r) => r.teacherId);
  }
}
