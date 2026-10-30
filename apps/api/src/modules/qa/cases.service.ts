import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';

/**
 * Complaints and safeguarding cases (FR-QA-05, SAF-FE-01).
 *
 * This is the most sensitive module in the system, and the design follows from that:
 *
 *   1. **Minimal disclosure.** Only `SAFEGUARDING_LEAD`, `SUPERVISOR` and `SUPER_ADMIN`
 *      may read a safeguarding case at all. `ADMIN` is excluded on purpose — routine
 *      admin does not need access to allegations about a named teacher or child, and
 *      "we can always add a role later" is how that access leaks.
 *
 *   2. **Every read is an audit row.** Opening a case is itself an access event. The
 *      interceptor already records the read; this service additionally records case
 *      *access* specifically so a regulator can produce the list of who looked.
 *
 *   3. **`alertedAt` is set once, at creation, and never cleared.** The SLA
 *      (`SAFEGUARDING_ALERT_SLA_MINUTES`) is measured from that instant. Reopening a
 *      case must not reset the clock and quietly buy a team more time.
 *
 *   4. **Notes are append-only.** There is no edit and no delete on `case_note`. A
 *      safeguarding record that can be edited after the fact is not evidence.
 */
export type CaseSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export const CASE_SEVERITIES: CaseSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CASE_FLOW = ['OPEN', 'INVESTIGATING', 'ACTIONED', 'CLOSED'];

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly queues: QueueService,
  ) {}

  /**
   * Opens a case (FR-QA-05).
   *
   * `dueAt` is derived from the SLA rather than supplied, so nobody can open a case
   * that is already overdue on arrival — which is the easiest way for an SLA to become
   * meaningless.
   */
  async open(input: {
    type: 'COMPLAINT' | 'SAFEGUARDING';
    summary: string;
    openedById: string;
    subjectUserId?: string;
    classId?: string;
    ownerId?: string;
    slaMinutes?: number;
    severity?: CaseSeverity;
  }) {
    const sla = input.slaMinutes ?? 15; // SAFEGUARDING_ALERT_SLA_MINUTES
    if (!Number.isFinite(sla) || sla <= 0 || sla > 60 * 24 * 7) {
      throw AppError.badRequest('SLA must be between 1 minute and 1 week');
    }

    const now = new Date();
    const caseRecord = await this.prisma.caseRecord.create({
      data: {
        type: input.type,
        status: 'OPEN',
        openedById: input.openedById,
        subjectUserId: input.subjectUserId ?? null,
        classId: input.classId ?? null,
        ownerId: input.ownerId ?? null,
        summary: input.summary,
        severity: input.severity ?? (input.type === 'SAFEGUARDING' ? 'HIGH' : 'MEDIUM'),
        dueAt: new Date(now.getTime() + sla * 60_000),
        // Stamped at creation and immutable afterwards, so the SLA is always measured
        // against when this was first raised.
        alertedAt: now,
      },
    });

    await this.audit.record({
      actorId: input.openedById,
      action: `qa.case.open.${input.type}`,
      targetType: 'case_record',
      targetId: caseRecord.id,
      after: { type: input.type, classId: input.classId, subjectUserId: input.subjectUserId },
    });

    // The safeguarding lead is paged, not emailed-and-forgotten. Failure to notify is
    // logged loudly and surfaced in the SLA report rather than swallowed.
    try {
      await this.notifications.enqueue({
        userIds: await this.safeguardingLeadIds(),
        template: TEMPLATE.SAFEGUARDING_ALERT,
        data: {
          caseReference: caseRecord.id.slice(0, 8).toUpperCase(),
          caseId: caseRecord.id,
          type: input.type,
          dueAt: caseRecord.dueAt.toISOString(),
        },
      });

      // CR-08: the escalation that actually enforces the 15-minute response. Without
      // this delayed job the alert is a one-shot notification that nobody is obliged to
      // act on, and the SLA is unenforceable.
      await this.queues.addDelayed(
        QUEUE.SAFEGUARDING,
        'escalate-case',
        { caseId: caseRecord.id },
        sla * 60_000,
        { attempts: 3 },
      );
    } catch (error) {
      this.logger.error(
        `Case ${caseRecord.id} opened but the safeguarding alert could not be queued: ${(error as Error).message}`,
      );
    }

    return caseRecord;
  }

  /**
   * A concern raised by someone who is not staff (M56, FR-QA-05, CR-08).
   *
   * The published child-safety policy promises a report button in every class, chat and
   * profile, but only staff could open a case. This is the reporter's side of that
   * promise. What the reporter gets back is deliberately small — a reference and a
   * timestamp — because the case itself holds allegations and notes the reporter must
   * not be able to read or alter.
   *
   * A `classId` is accepted only when the reporter is actually part of that class, so
   * the field cannot be used to probe for classes or to attach a report to someone
   * else's lesson.
   */
  async report(input: {
    reporterId: string;
    type: 'COMPLAINT' | 'SAFEGUARDING';
    description: string;
    classId?: string;
    threadId?: string;
    subjectUserId?: string;
  }): Promise<{ reference: string; receivedAt: Date }> {
    if (input.classId) {
      const involved = await this.prisma.classSession.count({
        where: {
          id: input.classId,
          OR: [
            { teacher: { userId: input.reporterId } },
            {
              students: {
                some: {
                  student: {
                    OR: [
                      { userId: input.reporterId },
                      { family: { members: { some: { userId: input.reporterId } } } },
                    ],
                  },
                },
              },
            },
          ],
        },
      });
      if (involved === 0) throw AppError.forbidden('You are not part of that class');
    }

    // The thread has no column of its own, so it travels in the summary where the lead
    // reads it.
    const summary = input.threadId
      ? `${input.description}

[Raised from message thread ${input.threadId}]`
      : input.description;

    const record = await this.open({
      type: input.type,
      summary,
      openedById: input.reporterId,
      subjectUserId: input.subjectUserId,
      classId: input.classId,
      // A safeguarding concern keeps the 15-minute alert SLA (CR-08); a complaint is
      // answered within a day.
      slaMinutes: input.type === 'SAFEGUARDING' ? 15 : 24 * 60,
    });

    return { reference: record.id.slice(0, 8).toUpperCase(), receivedAt: record.createdAt };
  }

  /** The reporter's own reports: status only, never the notes or the owner. */
  async mine(userId: string) {
    const rows = await this.prisma.caseRecord.findMany({
      where: { openedById: userId },
      select: { id: true, type: true, status: true, createdAt: true, closedAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({
      reference: r.id.slice(0, 8).toUpperCase(),
      type: r.type,
      status: r.status,
      receivedAt: r.createdAt,
      closedAt: r.closedAt,
    }));
  }

  private async safeguardingLeadIds(): Promise<string[]> {
    const leads = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { in: ['SAFEGUARDING_LEAD', 'SUPER_ADMIN'] } } },
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    return leads.map((l) => l.id);
  }

  /** Adds a note. Append-only by design — see the class comment. */
  async addNote(caseId: string, authorId: string, note: string) {
    const exists = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!exists) throw AppError.notFound('Case');

    const created = await this.prisma.caseNote.create({
      data: { caseId, authorId, note },
    });

    await this.audit.record({
      actorId: authorId,
      action: 'qa.case.note',
      targetType: 'case_record',
      targetId: caseId,
      after: { noteId: created.id },
    });

    return created;
  }

  /** Reads a case, recording the access. */
  async read(caseId: string, readerId: string) {
    const record = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: {
        notes: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true } } },
        },
        owner: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        class: { select: { id: true, startsAt: true, course: { select: { name: true } } } },
      },
    });
    if (!record) throw AppError.notFound('Case');

    // "Who looked at a safeguarding allegation" is a required answer, so reading is
    // recorded as its own audit action rather than being lost in a generic HTTP log.
    await this.audit.record({
      actorId: readerId,
      action: 'qa.case.read',
      targetType: 'case_record',
      targetId: caseId,
    });

    const now = Date.now();
    return {
      ...record,
      sla: {
        dueAt: record.dueAt,
        breached: record.status !== 'CLOSED' && now > record.dueAt.getTime(),
        minutesRemaining: Math.round((record.dueAt.getTime() - now) / 60000),
      },
    };
  }

  async list(filter: {
    type?: 'COMPLAINT' | 'SAFEGUARDING';
    status?: string;
    overdueOnly?: boolean;
  }) {
    const where = {
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status as never } : {}),
      ...(filter.overdueOnly
        ? { dueAt: { lt: new Date() }, status: { not: 'CLOSED' as const } }
        : {}),
    };

    return this.prisma.caseRecord.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        _count: { select: { notes: true } },
      },
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { dueAt: 'asc' }],
      take: 100,
    });
  }

  /**
   * Advances the case status.
   *
   * Closing requires at least one note, so a case cannot be closed with no record of
   * what was done — the most common way a real incident quietly disappears.
   */
  async transition(
    caseId: string,
    status: 'INVESTIGATING' | 'ACTIONED' | 'CLOSED',
    actorId: string,
  ) {
    const record = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      include: { _count: { select: { notes: true } } },
    });
    if (!record) throw AppError.notFound('Case');
    if (record.status === 'CLOSED') {
      throw AppError.conflict('CONFLICT', 'Case is already closed', { caseId });
    }

    // M28 — a case only moves forward. Reopening an actioned case as "investigating"
    // rewrote the timeline the SLA report is built from.
    if (CASE_FLOW.indexOf(status) <= CASE_FLOW.indexOf(record.status)) {
      throw AppError.conflict('CONFLICT', `A ${record.status.toLowerCase()} case cannot go back to ${status.toLowerCase()}`, {
        caseId,
        from: record.status,
        to: status,
      });
    }

    if (status === 'CLOSED' && record._count.notes === 0) {
      throw AppError.badRequest('A case cannot be closed without at least one note');
    }

    const updated = await this.prisma.caseRecord.update({
      where: { id: caseId },
      data: { status, ...(status === 'CLOSED' ? { closedAt: new Date() } : {}) },
    });

    await this.audit.record({
      actorId,
      action: `qa.case.${status}`,
      targetType: 'case_record',
      targetId: caseId,
      before: { status: record.status },
      after: { status: updated.status },
    });

    return updated;
  }

  /** M28 — change how serious a case is (audited). */
  async setSeverity(caseId: string, severity: CaseSeverity, actorId: string) {
    const record = await this.prisma.caseRecord.findUnique({ where: { id: caseId }, select: { severity: true, status: true } });
    if (!record) throw AppError.notFound('Case');
    if (record.status === 'CLOSED') throw AppError.conflict('CONFLICT', 'Case is already closed', { caseId });
    const updated = await this.prisma.caseRecord.update({ where: { id: caseId }, data: { severity } });
    await this.audit.record({
      actorId,
      action: 'qa.case.severity',
      targetType: 'case_record',
      targetId: caseId,
      before: { severity: record.severity },
      after: { severity },
    });
    return updated;
  }

  /** Assigns an owner. */
  async assign(caseId: string, ownerId: string, actorId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw AppError.notFound('Owner');

    const updated = await this.prisma.caseRecord.update({
      where: { id: caseId },
      data: { ownerId },
    });

    await this.audit.record({
      actorId,
      action: 'qa.case.assign',
      targetType: 'case_record',
      targetId: caseId,
      after: { ownerId },
    });

    return updated;
  }

  /** SLA report for the safeguarding lead (SAF-FE-02). */
  async slaReport() {
    const open = await this.prisma.caseRecord.findMany({
      where: { status: { not: 'CLOSED' } },
      select: { id: true, type: true, status: true, dueAt: true, alertedAt: true },
      orderBy: { dueAt: 'asc' },
    });

    const now = Date.now();
    const breached = open.filter((c) => c.dueAt.getTime() < now);

    return {
      open: open.length,
      breached: breached.length,
      // Breached cases are listed with how far past due they are, because "3 overdue"
      // without the margin does not tell a safeguarding lead which one to take first.
      breachedDetail: breached.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        minutesOverdue: Math.round((now - c.dueAt.getTime()) / 60000),
      })),
      openDetail: open
        .filter((c) => c.dueAt.getTime() >= now)
        .map((c) => ({
          id: c.id,
          type: c.type,
          minutesRemaining: Math.round((c.dueAt.getTime() - now) / 60000),
        })),
    };
  }
}
