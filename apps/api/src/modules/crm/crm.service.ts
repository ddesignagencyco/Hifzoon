import { Injectable, Logger } from '@nestjs/common';
import { LeadStatus, TaskStatus, TaskType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';

/** Stages a lead may move to, in the order a healthy funnel moves through them. */
const LEAD_FLOW: readonly LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.TRIAL_BOOKED,
  LeadStatus.TRIAL_DONE,
  LeadStatus.WON,
  LeadStatus.LOST,
];

/**
 * Marketing CRM and sales follow-up (FR-OPS-01, FR-OPS-02, FR-OPS-03, OPS-FE-01).
 *
 * Three behaviours here are deliberate and worth not "simplifying" later:
 *
 *   1. **Closed leads are immutable.** Once a lead is `WON` or `LOST`, its status and
 *      lost reason are frozen. Editing history is how pipeline reporting stops being
 *      trustworthy, and a lost-reason field is exactly the field someone is tempted to
 *      tidy up after the fact.
 *   2. **A lost lead requires a reason.** `LOST` without `lostReason` produces a
 *      report nobody can act on, so it is rejected rather than stored as blank.
 *   3. **Closing a lead resolves its open tasks automatically.** A `TRIAL_NOT_CONVERTED`
 *      follow-up left `OPEN` after the lead was marked lost is noise that hides real
 *      overdue work, so the close sweeps them in the same transaction.
 */
@Injectable()
export class CrmService {
  private readonly logger = new Logger(CrmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createLead(input: {
    contactName: string;
    source?: string;
    email?: string;
    phone?: string;
    country?: string;
    childAge?: number;
    courseInterest?: string;
    notes?: string;
    ownerId?: string;
  }) {
    const lead = await this.prisma.lead.create({
      data: {
        contactName: input.contactName,
        source: input.source ?? 'website',
        email: input.email ?? null,
        phone: input.phone ?? null,
        country: input.country ?? null,
        childAge: input.childAge ?? null,
        courseInterest: input.courseInterest ?? null,
        notes: input.notes ?? null,
        ownerId: input.ownerId ?? null,
        status: LeadStatus.NEW,
      },
    });

    // A brand-new lead with nobody chasing it is a lead that is lost without anyone
    // noticing, so the first follow-up task is created with it rather than left to
    // whoever thinks to look at the pipeline.
    await this.prisma.task.create({
      data: {
        leadId: lead.id,
        type: TaskType.NO_SHOW_FOLLOWUP,
        assigneeId: input.ownerId ?? null,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        note: `First contact for ${lead.contactName}`,
      },
    });

    await this.audit.record({
      action: 'crm.lead.create',
      targetType: 'lead',
      targetId: lead.id,
      after: lead,
    });

    return lead;
  }

  /**
   * Moves a lead to a new stage, enforcing the immutability and lost-reason rules.
   *
   * Stage changes are recorded one row per change rather than by overwriting the
   * lead: "when did this become WON, and who marked it?" is the question a commission
   * or a complaint answer needs, and it cannot be reconstructed from a current state.
   */
  async updateLeadStatus(input: {
    leadId: string;
    status: LeadStatus;
    lostReason?: string;
    actorId: string;
    familyId?: string;
  }) {
    const lead = await this.prisma.lead.findUnique({ where: { id: input.leadId } });
    if (!lead) throw AppError.notFound('Lead');

    if (lead.status === LeadStatus.WON || lead.status === LeadStatus.LOST) {
      throw AppError.conflict(
        'CONFLICT',
        `Lead is already closed as ${lead.status}; closed leads are immutable`,
        { leadId: lead.id, status: lead.status },
      );
    }

    if (input.status === LeadStatus.LOST && !input.lostReason?.trim()) {
      throw AppError.badRequest('A lost lead requires a lostReason', { leadId: input.leadId });
    }

    if (!LEAD_FLOW.includes(input.status)) {
      throw AppError.badRequest(`Unsupported lead status ${input.status}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.lead.update({
        where: { id: input.leadId },
        data: {
          status: input.status,
          lostReason: input.status === LeadStatus.LOST ? input.lostReason!.trim() : null,
          familyId: input.familyId ?? lead.familyId,
        },
      });

      // Closing the lead closes its follow-up work in the same transaction, so there
      // is no window in which the pipeline shows "lost" next to an open task.
      if (input.status === LeadStatus.WON || input.status === LeadStatus.LOST) {
        await tx.task.updateMany({
          where: { leadId: input.leadId, status: TaskStatus.OPEN },
          data: { status: TaskStatus.CANCELLED },
        });
      }

      return next;
    });

    await this.audit.record({
      actorId: input.actorId,
      action: `crm.lead.status.${input.status}`,
      targetType: 'lead',
      targetId: lead.id,
      before: { status: lead.status },
      after: { status: updated.status, lostReason: updated.lostReason },
    });

    return updated;
  }

  async listLeads(filter: {
    status?: LeadStatus;
    ownerId?: string;
    source?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const where = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(filter.source ? { source: filter.source } : {}),
      ...(filter.search
        ? {
            OR: [
              { contactName: { contains: filter.search, mode: 'insensitive' as const } },
              { email: { contains: filter.search, mode: 'insensitive' as const } },
              { phone: { contains: filter.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          tasks: { where: { status: TaskStatus.OPEN }, orderBy: { dueAt: 'asc' } },
          owner: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page: filter.page, limit: filter.limit };
  }

  /**
   * Pipeline counts and conversion rates per stage (OPS-FE-02).
   *
   * Conversion is computed from the counts rather than stored as a column: a stored
   * rate is a second source of truth that disagrees with the leads the moment one is
   * edited, and nobody remembers to recompute it.
   */
  async pipelineSummary() {
    const grouped = await this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<
      LeadStatus,
      number
    >;

    const total = LEAD_FLOW.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
    const trials = (counts[LeadStatus.TRIAL_DONE] ?? 0) + (counts[LeadStatus.WON] ?? 0);
    const won = counts[LeadStatus.WON] ?? 0;

    return {
      counts: LEAD_FLOW.map((status) => ({ status, count: counts[status] ?? 0 })),
      total,
      won,
      // Two rates, not one: booking→attendance is the trial team's metric, and
      // attendance→enrolment is the closing metric. Collapsing them hides which half
      // of the funnel is actually leaking.
      trialToWonRate: trials === 0 ? null : round(won / trials),
      bookingToDoneRate:
        (counts[LeadStatus.TRIAL_BOOKED] ?? 0) === 0
          ? null
          : round((counts[LeadStatus.TRIAL_DONE] ?? 0) / (counts[LeadStatus.TRIAL_BOOKED] ?? 0)),
      openTasks: await this.prisma.task.count({ where: { status: TaskStatus.OPEN } }),
      overdueTasks: await this.prisma.task.count({
        where: { status: TaskStatus.OPEN, dueAt: { lt: new Date() } },
      }),
    };
  }

  /** Tasks due to someone (FR-OPS-03, OPS-FE-03). Overdue first, then by due date. */
  async listTasks(filter: {
    assigneeId?: string;
    status?: TaskStatus;
    overdueOnly?: boolean;
    page: number;
    limit: number;
  }) {
    const where = {
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      ...(filter.status ? { status: filter.status } : { status: TaskStatus.OPEN }),
      ...(filter.overdueOnly ? { dueAt: { lt: new Date() } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          lead: { select: { id: true, contactName: true, status: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: [{ dueAt: 'asc' }],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, page: filter.page, limit: filter.limit };
  }

  async completeTask(taskId: string, actorId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw AppError.notFound('Task');
    if (task.status !== TaskStatus.OPEN) {
      throw AppError.conflict('CONFLICT', `Task is already ${task.status}`, { taskId });
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE, completedAt: new Date() },
    });

    await this.audit.record({
      actorId,
      action: 'crm.task.complete',
      targetType: 'task',
      targetId: taskId,
      before: { status: task.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async createTask(input: {
    leadId?: string;
    type: TaskType;
    assigneeId?: string;
    dueAt: Date;
    note?: string;
  }) {
    const task = await this.prisma.task.create({
      data: {
        leadId: input.leadId ?? null,
        type: input.type,
        assigneeId: input.assigneeId ?? null,
        dueAt: input.dueAt,
        note: input.note ?? null,
      },
    });

    // Only meaningful for a lead, so this stays best-effort: a task created without
    // an actorId (a nightly sweep) is not an error, just not audited.
    if (input.assigneeId) {
      await this.audit.record({
        actorId: input.assigneeId,
        action: 'crm.task.create',
        targetType: 'task',
        targetId: task.id,
        after: task,
      });
    }

    return task;
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
