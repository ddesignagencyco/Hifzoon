import { Injectable, Logger, Optional } from '@nestjs/common';
import { LeadStatus, TaskStatus, TaskType } from '@prisma/client';

import { pickLeadOwner } from './trial-lead';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { NotificationsService, TEMPLATE } from '../notifications/notifications.service';

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
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async createLead(input: {
    contactName: string;
    source?: string;
    email?: string;
    phone?: string;
    country?: string;
    region?: string;
    city?: string;
    postcode?: string;
    lat?: number;
    lng?: number;
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
        region: input.region ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
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
        type: TaskType.OTHER,
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
   * A family's enquiry from the public site. An open lead with the same email gets a note
   * and a fresh follow-up task instead of a duplicate; otherwise a NEW lead is created, with
   * its first follow-up task, exactly as if the office had typed it in.
   */
  async createEnquiry(input: {
    contactName: string;
    email: string;
    phone?: string;
    country?: string;
    city?: string;
    courseInterest?: string;
    timeZone?: string;
    childAge?: number;
    message?: string;
  }) {
    const note = [
      'Call-back request from the website: no open trial time suited them.',
      input.courseInterest ? `Course: ${input.courseInterest}.` : null,
      input.timeZone ? `Time zone: ${input.timeZone}.` : null,
      input.message ? `Message: ${input.message}` : null,
    ]
      .filter(Boolean)
      .join(' ');

    const open = await this.prisma.lead.findFirst({
      where: {
        email: { equals: input.email, mode: 'insensitive' },
        status: { in: [LeadStatus.NEW, LeadStatus.TRIAL_BOOKED, LeadStatus.TRIAL_DONE] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (open) {
      // A lead nobody owns gets an owner now: an unassigned follow-up is one nobody sees.
      const ownerId = open.ownerId ?? (await pickLeadOwner(this.prisma));
      await this.prisma.lead.update({
        where: { id: open.id },
        data: { notes: [open.notes, note].filter(Boolean).join('\n'), ownerId },
      });
      await this.prisma.task.create({
        data: {
          leadId: open.id,
          type: TaskType.OTHER,
          assigneeId: ownerId,
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          note: `Call back ${open.contactName}: asked again from the website`,
        },
      });
      await this.tellOwner(ownerId, open.contactName, input);
      return open;
    }
    const ownerId = (await pickLeadOwner(this.prisma)) ?? undefined;
    await this.tellOwner(ownerId ?? null, input.contactName, input);
    return this.createLead({
      ownerId,
      contactName: input.contactName,
      // Every lead from the public site counts as one source; the note says which form.
      source: 'website',
      email: input.email,
      phone: input.phone,
      country: input.country,
      city: input.city,
      courseInterest: input.courseInterest,
      childAge: input.childAge,
      notes: note,
    });
  }

  /** The lead's owner hears about a call-back request at once, not when they next open the CRM. */
  private async tellOwner(
    ownerId: string | null,
    contactName: string,
    input: { email: string; phone?: string; courseInterest?: string },
  ) {
    if (!ownerId || !this.notifications) return;
    await this.notifications
      .enqueue({
        userIds: [ownerId],
        template: TEMPLATE.CRM_CALLBACK_REQUESTED,
        data: {
          contactName,
          contact: input.phone ? `${input.email}, ${input.phone}` : input.email,
          course: input.courseInterest ?? 'not given',
        },
      })
      .catch((error: Error) =>
        this.logger.warn(`Call-back request not notified: ${error.message}`),
      );
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

  /** One lead with everything the detail page shows: contact, family, trial, tasks, history. */
  async getLead(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contactUser: { select: { id: true, name: true, email: true, phone: true } },
        family: {
          select: {
            id: true,
            name: true,
            country: true,
            timeZone: true,
            students: {
              where: { deletedAt: null },
              select: { id: true, displayName: true, birthYear: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        tasks: {
          orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
          include: { assignee: { select: { id: true, name: true } } },
        },
      },
    });
    if (!lead) throw AppError.notFound('Lead');
    const [trial, history] = await Promise.all([
      lead.trialClassId
        ? this.prisma.classSession.findUnique({
            where: { id: lead.trialClassId },
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              course: { select: { code: true, name: true } },
              teacher: { select: { user: { select: { name: true } } } },
            },
          })
        : null,
      this.prisma.auditLog.findMany({
        where: { targetType: 'lead', targetId: id },
        orderBy: { at: 'asc' },
        select: {
          id: true,
          action: true,
          at: true,
          before: true,
          after: true,
          actor: { select: { name: true } },
        },
      }),
    ]);
    return { ...lead, trial, history };
  }

  /** Contact, location, interest, owner and notes; the stage moves only through its own route. */
  async updateLead(
    id: string,
    input: Partial<{
      contactName: string;
      email: string | null;
      phone: string | null;
      country: string | null;
      region: string | null;
      city: string | null;
      postcode: string | null;
      courseInterest: string | null;
      childAge: number | null;
      notes: string | null;
      ownerId: string | null;
    }>,
    actorId: string,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw AppError.notFound('Lead');
    // Only what actually changed is written and audited; a form sends every field.
    const changed = (Object.keys(input) as Array<keyof typeof input>).filter(
      (k) => input[k] !== undefined && input[k] !== lead[k],
    );
    if (changed.length === 0) return lead;
    const data = Object.fromEntries(changed.map((k) => [k, input[k]]));
    const updated = await this.prisma.lead.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'crm.lead.update',
      targetType: 'lead',
      targetId: id,
      before: Object.fromEntries(changed.map((k) => [k, lead[k]])),
      after: Object.fromEntries(changed.map((k) => [k, updated[k]])),
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
        // Latest activity first: a family asking again must come back to the top.
        orderBy: { updatedAt: 'desc' },
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
    const won = counts[LeadStatus.WON] ?? 0;

    // A lead can be won (or lost) without ever sitting at TRIAL_DONE, so "done + won" is not
    // the number of trials held and dividing by it let the rate pass 100%. `trialClassId` is
    // what says a lead really had a trial, so the rates are built from that.
    const [wonAfterTrial, lostAfterTrial] = await Promise.all([
      this.prisma.lead.count({ where: { status: LeadStatus.WON, trialClassId: { not: null } } }),
      this.prisma.lead.count({ where: { status: LeadStatus.LOST, trialClassId: { not: null } } }),
    ]);
    const trialsHeld = (counts[LeadStatus.TRIAL_DONE] ?? 0) + wonAfterTrial;
    const everBooked = (counts[LeadStatus.TRIAL_BOOKED] ?? 0) + trialsHeld + lostAfterTrial;

    return {
      counts: LEAD_FLOW.map((status) => ({ status, count: counts[status] ?? 0 })),
      total,
      won,
      // Two rates, not one: booking→attendance is the trial team's metric, and
      // attendance→enrolment is the closing metric. Collapsing them hides which half
      // of the funnel is actually leaking. Both are fractions of a superset, so ≤ 1.
      trialToWonRate: trialsHeld === 0 ? null : round(wonAfterTrial / trialsHeld),
      bookingToDoneRate: everBooked === 0 ? null : round(trialsHeld / everBooked),
      openTasks: await this.prisma.task.count({ where: { status: TaskStatus.OPEN } }),
      overdueTasks: await this.prisma.task.count({
        where: { status: TaskStatus.OPEN, dueAt: { lt: new Date() } },
      }),
    };
  }

  /**
   * Lead counts by area (M-GEO-01) — marketing's view of which countries/regions
   * enquiries are coming from, so spend can follow where leads actually are.
   */
  async leadsByArea(filter: { country?: string }) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['country', 'region', 'city'],
      where: filter.country ? { country: filter.country } : undefined,
      _count: { _all: true },
    });

    return grouped
      .map((g) => ({ country: g.country, region: g.region, city: g.city, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
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
      // No status means every task, done and cancelled included; callers wanting the work
      // still to do ask for OPEN.
      ...(filter.status ? { status: filter.status } : {}),
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
