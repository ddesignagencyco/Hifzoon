import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SAFEGUARDING_ALERT_SLA_MINUTES } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE } from '../../queue/queue.constants';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../integrations/providers';
import { NotificationsService, TEMPLATE } from '../../modules/notifications/notifications.service';
import { SettingsService } from '../../modules/settings/settings.service';
import { dunningLadder, paymentProviderCode } from '../../modules/billing/billing.policy';
import type { JobProcessor } from './processor.interface';

/**
 * Billing background work (FR-BIL-03, FR-BIL-05).
 *
 * This processor exists because the dunning requirement is a *schedule*, not a
 * request. `BillingService.runDunning` is reachable from an admin endpoint for a manual
 * nudge, but the day 1 / 3 / 7 retry ladder only happens because this job fires.
 *
 * The ladder and the payment code are both read from `billing.policy.ts`, the same
 * helpers the API's manual sweep uses. Two copies of "which provider processed this" and
 * "how many retries" is how the nightly sweep and the admin button end up disagreeing
 * about the same invoice. After the final attempt the subscription is cancelled:
 * continuing to charge a family who has declined three times is harassment, and an
 * unbounded retry schedule is how a payment provider gets terminated.
 */
@Injectable()
export class BillingProcessor implements JobProcessor {
  readonly queue = QUEUE.BILLING;
  readonly concurrency = 2;

  private readonly logger = new Logger(BillingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'run-dunning':
        return this.runDunning();
      case 'schedule-retries':
        return this.scheduleRetries(job.data?.invoiceId as string);
      case 'expire-pauses':
        return this.expirePauses();
      case 'close-periods':
        return this.closeCompletedPeriods();
      default:
        this.logger.warn(`Unknown billing job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Schedules the next retry for one invoice, rather than retrying immediately.
   *
   * The delay is computed from the attempt number, so retry 1 lands on day 1, retry 2 on
   * day 3 and retry 3 on day 7 (see `dunningLadder`). Once the ladder is exhausted the
   * job records the terminal failure instead of scheduling another charge.
   */
  private async scheduleRetries(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        payments: { select: { attempt: true, status: true, nextRetryAt: true } },
        subscription: { select: { id: true, status: true } },
      },
    });

    if (!invoice) return { skipped: 'invoice not found' };
    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      return { skipped: `invoice is ${invoice.status}` };
    }

    // Idempotency: a redelivered `payment_failed` webhook enqueues this job again. If a
    // future retry is already scheduled, do not add another rung — otherwise a duplicate
    // delivery would advance the ladder and cancel the family early (FR-BIL-05).
    const now = Date.now();
    const alreadyScheduled = invoice.payments.some(
      (p) => p.status === 'PENDING' && p.nextRetryAt !== null && p.nextRetryAt.getTime() > now,
    );
    if (alreadyScheduled) return { skipped: 'retry already scheduled' };

    const attempts = invoice.payments.length;
    const ladder = await dunningLadder(this.settings);
    if (ladder.length === 0 || attempts >= ladder.length) {
      await this.cancelAfterDunning(invoice.id, invoice.subscription?.id ?? null);
      return { retriesExhausted: true, attempts };
    }

    const delayDays = ladder[attempts];
    // A deterministic synthetic id makes the rung upsertable, so two concurrent jobs for
    // the same invoice cannot insert a duplicate; it also makes it obvious in the
    // database that this row is a scheduled intent, not a provider charge.
    const providerPaymentId = `dunning_${invoice.id}_${attempts + 1}`;
    await this.prisma.payment.upsert({
      where: { providerPaymentId },
      create: {
        invoiceId: invoice.id,
        // From the selected adapter, never hardcoded: a scheduled rung written as
        // `STRIPE` on a PayPal deployment makes the ledger lie about who owns the debt.
        provider: paymentProviderCode(this.payments.name),
        providerPaymentId,
        method: 'CARD',
        amountMinor: invoice.totalMinor,
        currency: invoice.currency,
        status: 'PENDING',
        attempt: attempts + 1,
        nextRetryAt: new Date(Date.now() + delayDays * 86_400_000),
        failureReason: `Dunning retry ${attempts + 1} of ${ladder.length} scheduled`,
      },
      update: {},
    });

    this.logger.log(
      `Billing: scheduled dunning retry ${attempts + 1} for invoice ${invoice.number} in ${delayDays}d`,
    );
    return { scheduledInDays: delayDays, attempt: attempts + 1 };
  }

  /** Terminal step of the ladder: cancel, and tell the family plainly why. */
  private async cancelAfterDunning(invoiceId: string, subscriptionId: string | null) {
    if (subscriptionId) {
      await this.prisma.subscription.updateMany({
        where: { id: subscriptionId, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
      });
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        number: true,
        family: {
          select: {
            members: { where: { isPrimary: true }, select: { user: { select: { id: true } } } },
          },
        },
      },
    });

    // `?.` on `family` as well as `invoice`: a subscription cancelled between the two
    // reads can leave the family relation unresolvable, and a dunning job that throws
    // here would leave the ladder half-walked with no notification sent.
    const primary = invoice?.family?.members[0]?.user;
    if (primary) {
      await this.notifications
        .enqueue({
          userIds: [primary.id],
          template: TEMPLATE.PAYMENT_FAILED,
          data: { invoiceNumber: invoice?.number ?? '', reason: 'Payment retries exhausted' },
        })
        .catch((error: Error) =>
          this.logger.warn(`Could not queue payment-failed notice: ${error.message}`),
        );
    }

    this.logger.warn(`Billing: dunning exhausted for invoice ${invoiceId}; subscription cancelled`);
    return { cancelled: Boolean(subscriptionId) };
  }

  /**
   * The nightly sweep that starts the ladder for anything overdue.
   *
   * Scoped to invoices that are genuinely past due *and* not already mid-ladder, so a
   * family with an in-flight retry is not re-scheduled every night.
   */
  private async runDunning() {
    const now = new Date();
    const overdue = await this.prisma.invoice.findMany({
      where: {
        status: { in: ['OPEN', 'FAILED'] },
        dueAt: { lt: now },
      },
      select: { id: true, number: true, totalMinor: true },
      take: 500,
    });

    let started = 0;
    for (const invoice of overdue) {
      const scheduled = await this.scheduleRetries(invoice.id);
      if ('scheduledInDays' in scheduled) started += 1;
    }

    this.logger.log(
      `Billing: dunning sweep started ${started} ladder(s) across ${overdue.length} overdue invoice(s)`,
    );
    return { scanned: overdue.length, started };
  }

  /** FR-BIL-07 — a paused subscription resumes by itself when its pause elapses. */
  private async expirePauses() {
    const due = await this.prisma.subscription.findMany({
      where: { status: 'PAUSED', pausedUntil: { lte: new Date() } },
      select: { id: true },
      take: 200,
    });

    if (due.length === 0) return { resumed: 0 };

    await this.prisma.subscription.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: 'ACTIVE', pausedUntil: null },
    });

    this.logger.log(`Billing: resumed ${due.length} paused subscription(s) whose pause elapsed`);
    return { resumed: due.length };
  }

  /** Closes out class sessions whose charge window has passed, so payroll can run. */
  private async closeCompletedPeriods() {
    const cutoff = new Date(Date.now() - 7 * 86_400_000);
    const result = await this.prisma.classSession.updateMany({
      where: { endsAt: { lte: cutoff }, status: { in: ['SCHEDULED', 'LIVE'] } },
      data: { status: 'COMPLETED' },
    });

    this.logger.log(`Billing: closed ${result.count} class(es) into the billing period`);
    return { closed: result.count };
  }
}

/**
 * Safeguarding escalation (FR-QA-05, CR-08, SAFEGUARDING_ALERT_SLA_MINUTES).
 *
 * This is the timer that turns "a case was opened" into "somebody was told". Without it
 * `CasesService.open` queues an alert that nothing ever reads, and CR-08's 15-minute
 * response time is unmeasurable.
 *
 * The escalation is deliberately impersonal: it re-alerts the safeguarding lead, and
 * flags the case as breached in the SLA report. It never pages anyone with case
 * contents, because an alert channel is a much easier place to leak than the case
 * record itself.
 */
@Injectable()
export class SafeguardingProcessor implements JobProcessor {
  readonly queue = QUEUE.SAFEGUARDING;
  readonly concurrency = 4;

  private readonly logger = new Logger(SafeguardingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'escalate-case':
        return this.escalate(job.data?.caseId as string);
      case 'check-breaches':
        return this.checkBreaches();
      case 'check-sla-warnings':
        return this.warnImminently();
      default:
        this.logger.warn(`Unknown safeguarding job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /** Re-alerts the safeguarding lead that an unowned case is still open. */
  private async escalate(caseId: string) {
    const record = await this.prisma.caseRecord.findUnique({
      where: { id: caseId },
      select: { id: true, type: true, status: true, ownerId: true, dueAt: true },
    });

    if (!record) return { skipped: 'case not found' };
    if (record.status === 'CLOSED') return { skipped: 'case already closed' };

    const leads = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { in: ['SAFEGUARDING_LEAD', 'SUPER_ADMIN'] } } },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (leads.length > 0) {
      await this.notifications.enqueue({
        userIds: leads.map((l) => l.id),
        template: TEMPLATE.SAFEGUARDING_ALERT,
        data: {
          caseReference: record.id.slice(0, 8).toUpperCase(),
          caseId: record.id,
          type: record.type,
          dueAt: record.dueAt.toISOString(),
          escalation: 'unacknowledged',
        },
      });
    }

    this.logger.warn(
      `Safeguarding: case ${record.id} (${record.type}) escalated — unowned and past SLA`,
    );
    return { escalated: true, caseId: record.id };
  }

  /**
   * Reports every open case past its due date.
   *
   * This only reports; it does not transition the case. Status changes on a
   * safeguarding record are a human decision, and a job silently moving a case to
   * "escalated" would put a machine between a child and the person responsible.
   */
  private async checkBreaches() {
    const breached = await this.prisma.caseRecord.findMany({
      where: { status: { not: 'CLOSED' }, dueAt: { lt: new Date() } },
      select: { id: true, type: true, status: true, ownerId: true, dueAt: true },
      take: 200,
    });

    if (breached.length > 0) {
      this.logger.error(`Safeguarding: ${breached.length} case(s) past their SLA response time`);
    }

    return {
      breached: breached.length,
      cases: breached.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        owned: c.ownerId !== null,
        minutesOverdue: Math.round((Date.now() - c.dueAt.getTime()) / 60_000),
      })),
    };
  }

  /** Early warning while there is still time to act (CR-08). */
  private async warnImminently() {
    const soon = new Date(Date.now() + SAFEGUARDING_ALERT_SLA_MINUTES * 60_000);
    const atRisk = await this.prisma.caseRecord.count({
      where: { status: { not: 'CLOSED' }, ownerId: null, dueAt: { gte: new Date(), lte: soon } },
    });

    if (atRisk > 0) {
      this.logger.warn(
        `Safeguarding: ${atRisk} case(s) due within ${SAFEGUARDING_ALERT_SLA_MINUTES} minutes and still unassigned`,
      );
    }
    return { atRisk };
  }
}
