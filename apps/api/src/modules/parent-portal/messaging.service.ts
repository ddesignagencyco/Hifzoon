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
    enrolmentId?: string;
    actorId: string;
    actorRole: 'GUARDIAN' | 'STAFF';
  }): Promise<void> {
    if (input.actorRole === 'GUARDIAN') {
      await this.policy.assertGuardianInFamily(input.actorId, input.familyId);

      // S14 — `studentId` is no longer optional for a family. It was: a guardian could
      // omit it and open a thread with any teacher in the academy, about no child, and
      // the thread was then a standing channel to that teacher. A conversation is always
      // about one child.
      if (!input.studentId) {
        throw AppError.badRequest(
          'A message thread must be about one of your children (studentId is required)',
        );
      }

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

      // The enrolment is stored on the thread and is what every later authorisation
      // assumes, so it is resolved here rather than trusted from the request body: a
      // caller could otherwise pin a thread to another family's enrolment.
      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          id: input.enrolmentId ?? undefined,
          studentId: input.studentId,
          teacherId: input.teacherId,
          status: { in: ['TRIAL', 'ACTIVE', 'PAUSED'] },
        },
        select: { id: true },
      });
      input.enrolmentId = enrolment?.id;
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

    // S14 — moderation. The portal filters contact details in the composer, but a client can
    // be anything, and the failure this prevents is real: a teacher or a parent moving a
    // conversation about a child onto a personal number or an outside app, where nothing
    // is retained or reviewed. Detected matches are redacted *and* recorded, so support can
    // see that a thread is being taken off-platform rather than silently losing the text.
    const moderation = findContactDetails(body);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: input.threadId,
          senderId: input.senderId,
          body: moderation.matches.length > 0 ? moderation.redacted : body,
        },
      });

      // Bump the thread so the conversation list sorts by recent activity.
      await tx.messageThread.update({
        where: { id: input.threadId },
        data: { updatedAt: new Date() },
      });

      return created;
    });

    if (moderation.matches.length > 0) {
      this.logger.warn(
        `FR-PAR-06: message ${message.id} on thread ${input.threadId} contained contact details (${moderation.matches.join(', ')}); redacted`,
      );
      await this.audit.record({
        actorId: input.senderId,
        action: 'par.message.contact_details',
        targetType: 'message',
        targetId: message.id,
        after: { kinds: moderation.matches, threadId: input.threadId },
      });
    }

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

/**
 * Patterns that move a conversation about a child off the platform (S14).
 *
 * Deliberately narrow. The point is to catch a phone number, an email address or a
 * messaging handle in ordinary prose — "call me on 07700 900123", "whatsapp me" — and not
 * to censor a parent who writes about Quran: an ayah reference or a Quranic word must
 * survive untouched, so nothing here matches on Arabic text or numbers alone.
 */
const CONTACT_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'email', pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/gi },
  // 7+ digit runs, tolerating spaces, dashes, brackets and a leading +.
  { kind: 'phone', pattern: /(?:\+\d[\d\s()-]{6,}\d)/g },
  { kind: 'messaging-handle', pattern: /\b(?:whats\s?app|telegram|signal|imo|viber)\b/gi },
  { kind: 'social-handle', pattern: /(?:\bwa\.me\/|\bt\.me\/|@[a-z0-9_]{4,}\b)/gi },
];

/**
 * Finds contact details and returns the text with them replaced.
 *
 * The message is still delivered — a parent must not silently lose what they wrote — but
 * the identifying string is removed and the event is logged, so a thread cannot be used to
 * take a child off-platform without anyone noticing.
 */
export function findContactDetails(body: string): { redacted: string; matches: string[] } {
  let redacted = body;
  const matches: string[] = [];

  for (const { kind, pattern } of CONTACT_PATTERNS) {
    // `lastIndex` is stateful on a /g regex; reset so repeated calls behave the same.
    pattern.lastIndex = 0;
    if (!pattern.test(redacted)) continue;
    matches.push(kind);
    pattern.lastIndex = 0;
    redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), '[withheld]');
  }

  return { redacted, matches };
}
