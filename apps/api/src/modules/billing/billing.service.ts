import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { PolicyService } from '../../common/services/policy.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../integrations/providers';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { dunningLadder, paymentProviderCode } from './billing.policy';

/**
 * Billing (FR-BIL-01..07).
 *
 * Money rules that this module enforces without exception:
 *
 *   - **All amounts are integer minor units.** No floats, ever. `0.1 + 0.2 !== 0.3` is
 *     not a curiosity when it decides whether a family's invoice is 30.00 or 30.0000001.
 *     Display formatting happens at the edge and nowhere else.
 *
 *   - **The invoice is the source of truth, not the payment provider.** Provider
 *     webhooks are *accepted* (FR-BIL-04) but every state change is applied to the
 *     local invoice first and recorded. A webhook that arrives twice, or arrives for an
 *     invoice that was voided, changes nothing.
 *
 *   - **Invoice due dates are measured from issue, not from a calendar boundary.** The
 *     due window comes from `billing.invoice_due_days`, so an invoice raised late in a
 *     cycle is never immediately overdue.
 *
 * The payment provider is still a fake on this deployment (`PAYMENT_PROVIDER`), so
 * `createCheckout` returns a synthetic URL. Everything above that line — invoicing,
 * dunning, refunds, the state machine — is real and is what a real provider plugs into.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly queues: QueueService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly policies: PolicyService,
  ) {}

  /**
   * The `PaymentProviderCode` a payment row should carry, derived from the *selected*
   * adapter rather than hardcoded. Local dev runs the fake adapter (→ `OTHER`); a real
   * Stripe or PayPal deployment records the matching code, so the stored value is never
   * a lie about who processed the charge.
   *
   * Shared with `BillingProcessor` via `billing.policy.ts` — see the note there.
   */
  private get providerCode(): 'STRIPE' | 'PAYPAL' | 'OTHER' {
    return paymentProviderCode(this.payments.name);
  }

  // ── Catalogue ─────────────────────────────────────────────────────────────

  /** Public plan catalogue with prices (FR-BIL-01). */
  async listPlans(currency?: string) {
    return this.prisma.plan.findMany({
      where: { active: true },
      include: { prices: currency ? { where: { currency: currency as never } } : true },
      orderBy: { name: 'asc' },
    });
  }

  async priceFor(planId: string, currency: string) {
    const price = await this.prisma.planPrice.findUnique({
      where: { planId_currency: { planId, currency: currency as never } },
    });
    if (!price) {
      throw AppError.notFound(`Plan price in ${currency}`);
    }
    return price;
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Starts a subscription after the family's trial (FR-BIL-02).
   *
   * The provider subscription is created *before* the local row is written, so a
   * provider call that succeeds but a database failure leaves an orphan at the
   * provider rather than a local subscription that silently never bills anyone.
   */
  async subscribe(input: {
    familyId: string;
    planId: string;
    currency: string;
    actorId: string;
    trialOutcomeId?: string;
  }) {
    const [family, plan, price] = await Promise.all([
      this.prisma.family.findUnique({ where: { id: input.familyId } }),
      this.prisma.plan.findUnique({ where: { id: input.planId } }),
      this.priceFor(input.planId, input.currency),
    ]);

    if (!family) throw AppError.notFound('Family');
    if (!plan || !plan.active) throw AppError.notFound('Plan');

    // CR-10 — a guardian may only subscribe a family they belong to; taking `familyId`
    // from the body would otherwise let anyone bill any family.
    await this.policies.assertGuardianInFamily(input.actorId, input.familyId);

    const customerId = await this.ensureCustomer(
      family.id,
      family.billingName ?? 'Family',
      input.actorId,
    );

    const providerSubscription = await this.payments.createSubscription({
      customerId,
      planCode: plan.code,
      amountMinor: price.amountMinor,
      currency: input.currency,
      interval: intervalOf(plan.billingPeriod),
      idempotencyKey: `sub:${input.familyId}:${input.planId}:${input.trialOutcomeId ?? 'direct'}`,
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        familyId: input.familyId,
        planId: input.planId,
        currency: input.currency as never,
        status: 'ACTIVE',
        providerSubscriptionId: providerSubscription.subscriptionId,
        currentPeriodStart: providerSubscription.currentPeriodStart,
        currentPeriodEnd: providerSubscription.currentPeriodEnd,
      },
    });

    // Converting from a trial flips the trial enrolments to active in the same breath,
    // because a paid subscription with TRIAL enrolments means the family is paying for
    // lessons that are not scheduled.
    if (input.trialOutcomeId) {
      const outcome = await this.prisma.trialOutcome.findUnique({
        where: { id: input.trialOutcomeId },
        include: { class: { include: { students: { select: { studentId: true } } } } },
      });
      if (outcome?.classId) {
        const session = await this.prisma.classSession.findUnique({
          where: { id: outcome.classId },
          include: { students: { select: { studentId: true } } },
        });
        await this.prisma.enrolment.updateMany({
          where: {
            studentId: { in: session?.students.map((s) => s.studentId) ?? [] },
            status: 'TRIAL',
          },
          data: { status: 'ACTIVE', startedAt: new Date(), subscriptionId: subscription.id },
        });
      }
    }

    // B22 — the first invoice of the period the subscription has just started.
//
// Invoicing was only reachable from the admin endpoint, so a family that subscribed saw
// "Outstanding $0" and had nothing to pay until a member of staff noticed and invoiced
// them by hand. Every later period is billed by the renewal job; this is the one that
// happens at the moment the subscription exists.
//
// Issued after the enrolment flip rather than inside it, because the invoice is the
// family's evidence of what they are paying for, and the amount must not appear for a
// subscription whose activation then failed.
const firstInvoice = await this.invoiceSubscription(subscription.id, input.actorId);

await this.audit.record({
      actorId: input.actorId,
      action: 'bil.subscribe',
      targetType: 'subscription',
      targetId: subscription.id,
      after: {
        familyId: input.familyId,
        planId: input.planId,
        amountMinor: price.amountMinor,
        invoiceId: firstInvoice.id,
      },
    });

    return { ...subscription, firstInvoice };
  }

  private async ensureCustomer(familyId: string, name: string, actorId: string): Promise<string> {
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: {
        paymentCustomerId: true,
        members: { select: { user: { select: { email: true } }, isPrimary: true } },
      },
    });
    if (family?.paymentCustomerId) return family.paymentCustomerId;

    const email = family?.members.find((m) => m.isPrimary)?.user.email ?? 'billing@example.invalid';
    const { customerId } = await this.payments.createCustomer({ familyId, email, name });

    await this.prisma.family.update({
      where: { id: familyId },
      data: { paymentCustomerId: customerId },
    });
    await this.audit.record({
      actorId,
      action: 'bil.customer.create',
      targetType: 'family',
      targetId: familyId,
      after: { customerId },
    });

    return customerId;
  }

  /** Cancels at period end by default (FR-BIL-06) — never immediately, by surprise. */
  async cancel(subscriptionId: string, atPeriodEnd: boolean, actorId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    // CR-10 — ownership is checked before the status branch so a non-member cannot
    // learn a subscription's state from the error message.
    await this.policies.assertGuardianInFamily(actorId, subscription.familyId);
    if (subscription.status === 'CANCELLED') {
      throw AppError.conflict('CONFLICT', 'Subscription is already cancelled');
    }

    if (subscription.providerSubscriptionId) {
      await this.payments.cancelSubscription(subscription.providerSubscriptionId, atPeriodEnd);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: atPeriodEnd
        ? { cancelAtPeriodEnd: true }
        : { status: 'CANCELLED', cancelAtPeriodEnd: false },
    });

    await this.audit.record({
      actorId,
      action: 'bil.subscription.cancel',
      targetType: 'subscription',
      targetId: subscriptionId,
      before: { status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd },
      after: { status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd },
    });

    return updated;
  }

  /** Pauses a subscription (FR-BIL-07). */
  async pause(subscriptionId: string, days: number, actorId: string) {
    const maxDays = 30; // MAX_SUBSCRIPTION_PAUSE_DAYS
    if (!Number.isFinite(days) || days < 1 || days > maxDays) {
      throw AppError.badRequest(`A pause must be between 1 and ${maxDays} days`, { days });
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.policies.assertGuardianInFamily(actorId, subscription.familyId);
    if (subscription.status === 'CANCELLED') {
      throw AppError.conflict('CONFLICT', 'A cancelled subscription cannot be paused');
    }

    const until = new Date(Date.now() + days * 864e5);
    if (subscription.providerSubscriptionId) {
      await this.payments.pauseSubscription(subscription.providerSubscriptionId, until);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'PAUSED', pausedUntil: until },
    });

    await this.audit.record({
      actorId,
      action: 'bil.subscription.pause',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: { pausedUntil: until },
    });

    return updated;
  }

  async resume(subscriptionId: string, actorId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!subscription) throw AppError.notFound('Subscription');
    await this.policies.assertGuardianInFamily(actorId, subscription.familyId);
    if (subscription.status !== 'PAUSED') {
      throw AppError.conflict('CONFLICT', `Subscription is ${subscription.status}, not paused`);
    }

    if (subscription.providerSubscriptionId) {
      await this.payments.resumeSubscription(subscription.providerSubscriptionId);
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE', pausedUntil: null },
    });

    await this.audit.record({
      actorId,
      action: 'bil.subscription.resume',
      targetType: 'subscription',
      targetId: subscriptionId,
      after: { status: 'ACTIVE' },
    });

    return updated;
  }

  // ── Invoicing ────────────────────────────────────────────────────────────

  /**
   * Issues an invoice for a subscription period (FR-BIL-03).
   *
   * The invoice number is `INV-<year>-<8 hex>`, not a sequential integer. A gap in a
   * visible invoice sequence invites fraud; a random suffix with a year prefix is
   * unique, ordered well enough to file by, and cannot be guessed.
   */
  async invoiceSubscription(
    subscriptionId: string,
    actorId: string,
    options: { discountMinor?: number } = {},
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, family: true },
    });
    if (!subscription) throw AppError.notFound('Subscription');

    const price = await this.priceFor(subscription.planId, subscription.currency);
    const subtotal = price.amountMinor;

    // A discount is rejected rather than clamped. Clamping would silently turn an operator
    // typo (9,999 instead of 999) into a free month for the family, which is exactly the
    // kind of revenue error nobody notices until month end. A genuinely free invoice is
    // still expressible by passing a discount exactly equal to the subtotal.
    const discount = options.discountMinor ?? 0;
    if (discount < 0)
      throw AppError.badRequest('Discount cannot be negative', { discountMinor: discount });
    if (discount > subtotal) {
      throw AppError.badRequest('Discount cannot exceed the subtotal', {
        discountMinor: discount,
        subtotalMinor: subtotal,
      });
    }

    const total = subtotal - discount;

    const dueDays = await this.settings.getNumber('billing.invoice_due_days');
    const dueDaysSafe = Number.isFinite(dueDays) && dueDays > 0 ? Math.floor(dueDays) : 7;

    const invoice = await this.prisma.invoice.create({
      data: {
        familyId: subscription.familyId,
        subscriptionId: subscription.id,
        number: invoiceNumber(),
        currency: subscription.currency,
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
        status: 'OPEN',
        dueAt: new Date(Date.now() + dueDaysSafe * 864e5),
      },
    });

    await this.audit.record({
      actorId,
      action: 'bil.invoice.issue',
      targetType: 'invoice',
      targetId: invoice.id,
      after: {
        number: invoice.number,
        subtotalMinor: subtotal,
        discountMinor: discount,
        totalMinor: total,
      },
    });

    return invoice;
  }

  /** Starts a hosted checkout for an open invoice (FR-BIL-03). */
  async startCheckout(
    invoiceId: string,
    successUrl: string,
    cancelUrl: string,
    idempotencyKey: string,
    actorId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { family: { select: { id: true, paymentCustomerId: true } } },
    });
    if (!invoice) throw AppError.notFound('Invoice');
    // CR-10 — a guardian may only pay an invoice for their own family.
    await this.policies.assertGuardianInFamily(actorId, invoice.family.id);
    if (invoice.status === 'PAID') throw AppError.conflict('CONFLICT', 'Invoice is already paid');
    if (invoice.status === 'VOID') throw AppError.conflict('CONFLICT', 'Invoice has been voided');

    const session = await this.payments.createCheckout({
      familyId: invoice.family.id,
      invoiceId: invoice.id,
      amountMinor: invoice.totalMinor,
      currency: invoice.currency,
      customerId: invoice.family.paymentCustomerId,
      successUrl,
      cancelUrl,
      idempotencyKey,
      metadata: { invoiceNumber: invoice.number, invoiceId: invoice.id },
    });

    return session;
  }

  /**
   * Applies a payment webhook (FR-BIL-04).
   *
   * Idempotent by `providerPaymentId`, which carries a unique constraint: the same
   * webhook delivered twice updates one row instead of double-marking the invoice paid.
   * Webhooks are the only place a payment's truth enters the system, so this is also
   * where an invoice that was voided is refused — money arriving for an invoice the
   * school has written off must not silently mark it settled.
   */
  async handlePaymentEvent(event: {
    type: string;
    providerPaymentId?: string;
    providerSubscriptionId?: string;
    invoiceNumber?: string;
    amountMinor?: number;
    occurredAt: Date;
  }): Promise<{ applied: boolean; reason?: string }> {
    if (event.type === 'payment_succeeded' && event.providerPaymentId && event.invoiceNumber) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { number: event.invoiceNumber },
        include: { payments: true },
      });
      if (!invoice) return { applied: false, reason: 'unknown invoice' };

      if (invoice.status === 'VOID') {
        // Refund-or-record: the money genuinely arrived, so it is recorded as a payment
        // and the invoice stays voided. Reconciliation then shows an unmatched credit
        // for a human to refund properly.
        await this.prisma.payment.upsert({
          where: { providerPaymentId: event.providerPaymentId },
          create: {
            invoiceId: invoice.id,
            provider: this.providerCode,
            providerPaymentId: event.providerPaymentId,
            method: 'CARD',
            amountMinor: event.amountMinor ?? invoice.totalMinor,
            currency: invoice.currency,
            status: 'SUCCEEDED',
          },
          update: {},
        });
        return { applied: false, reason: 'invoice is void; payment recorded for reconciliation' };
      }

      const attempt = invoice.payments.length + 1;

      await this.prisma.payment.upsert({
        where: { providerPaymentId: event.providerPaymentId },
        create: {
          invoiceId: invoice.id,
          provider: this.providerCode,
          providerPaymentId: event.providerPaymentId,
          method: 'CARD',
          amountMinor: event.amountMinor ?? invoice.totalMinor,
          currency: invoice.currency,
          status: 'SUCCEEDED',
          attempt,
        },
        update: { status: 'SUCCEEDED', failureReason: null },
      });

      // Only mark paid when the payment actually covers the invoice. A partial payment
      // leaving the invoice OPEN is correct; marking it PAID would lose revenue.
      const totalPaid = await this.prisma.payment.aggregate({
        where: { invoiceId: invoice.id, status: 'SUCCEEDED' },
        _sum: { amountMinor: true },
      });

      const covered = (totalPaid._sum.amountMinor ?? 0) >= invoice.totalMinor;

      if (covered && invoice.status !== 'PAID') {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: event.occurredAt },
        });
        await this.prisma.subscription.updateMany({
          where: { id: invoice.subscriptionId ?? undefined, status: 'PAST_DUE' },
          data: { status: 'ACTIVE' },
        });
      }

      return { applied: true, reason: covered ? 'invoice settled' : 'partial payment recorded' };
    }

    if (event.type === 'payment_failed' && event.providerPaymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
        include: { invoice: { select: { id: true, subscriptionId: true, totalMinor: true } } },
      });
      if (!payment) return { applied: false, reason: 'unknown payment' };

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });

      await this.prisma.invoice.update({
        where: { id: payment.invoice.id },
        data: { status: 'FAILED' },
      });

      // A failed payment past the grace period puts the subscription PAST_DUE, which is
      // what triggers the dunning sequence. Access is not cut here — that is the
      // dunning worker's decision after the retries are exhausted.
      if (payment.invoice.subscriptionId) {
        await this.prisma.subscription.updateMany({
          where: { id: payment.invoice.subscriptionId, status: 'ACTIVE' },
          data: { status: 'PAST_DUE' },
        });
      }

      // Start the retry ladder here rather than waiting for the nightly sweep, so a
      // family whose card expired gets a second chance within the day instead of the
      // next morning (FR-BIL-05, DUNNING_RETRY_DAYS).
      await this.queues
        .addDelayed(QUEUE.BILLING, 'schedule-retries', { invoiceId: payment.invoice.id }, 0, {
          // A stable id collapses the duplicate jobs a redelivered webhook would
          // enqueue, so one failed payment cannot advance the retry ladder twice.
          jobId: `dunning-schedule:${payment.invoice.id}`,
        })
        .catch((error: Error) => {
          this.logger.error(
            `Could not schedule dunning for invoice ${payment.invoice.id}: ${error.message}`,
          );
        });

      return { applied: true };
    }

    if (event.type === 'subscription_cancelled' && event.providerSubscriptionId) {
      await this.prisma.subscription.updateMany({
        where: { providerSubscriptionId: event.providerSubscriptionId },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: false },
      });
      return { applied: true };
    }

    if (event.type === 'refund_created' && event.providerPaymentId && event.amountMinor) {
      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: event.providerPaymentId },
      });
      if (!payment) return { applied: false, reason: 'unknown payment' };

      // Replay-safe: providers redeliver webhooks, and `Refund` has no unique key to
      // absorb a duplicate. Once the payment is REFUNDED the event has already been
      // applied, so a second delivery is a no-op rather than a second refund row.
      if (payment.status === 'REFUNDED') {
        return { applied: false, reason: 'refund already recorded' };
      }

      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await this.prisma.refund.create({
        data: {
          paymentId: payment.id,
          amountMinor: event.amountMinor,
          reason: 'Provider refund',
          issuedById: payment.invoiceId,
        },
      });
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });
      return { applied: true };
    }

    return { applied: false, reason: `unhandled event ${event.type}` };
  }

  /**
   * Dunning sweep (FR-BIL-05): schedules retries on failed invoices.
   *
   * Retry days come from `billing.dunning_retry_days` applied to `DUNNING_RETRY_DAYS`
   * (1, 3, 7 by default). After the last attempt the subscription is cancelled, because
   * an unlimited retry schedule on a family who has declined three charges is
   * harassment, not revenue recovery.
   */
  async runDunning(actorId: string): Promise<{ retried: number; cancelled: number }> {
    const now = new Date();
    const retryDays = await dunningLadder(this.settings);
    let retried = 0;
    let cancelled = 0;

    const overdue = await this.prisma.invoice.findMany({
      where: { status: { in: ['FAILED', 'OPEN'] }, dueAt: { lt: now } },
      include: {
        payments: { orderBy: { attempt: 'desc' }, take: 1 },
        subscription: { select: { id: true, status: true, providerSubscriptionId: true } },
      },
    });

    for (const invoice of overdue) {
      const lastPayment = invoice.payments[0];
      const attempt = lastPayment?.attempt ?? 0;

      if (attempt >= retryDays.length) {
        if (invoice.subscription && invoice.subscription.status !== 'CANCELLED') {
          if (invoice.subscription.providerSubscriptionId) {
            await this.payments
              .cancelSubscription(invoice.subscription.providerSubscriptionId, false)
              .catch((error: Error) =>
                this.logger.warn(`Provider cancel failed: ${error.message}`),
              );
          }
          await this.prisma.subscription.update({
            where: { id: invoice.subscription.id },
            data: { status: 'CANCELLED' },
          });
          cancelled += 1;
        }
        continue;
      }

      const nextRetryInDays = retryDays[attempt];
      const nextRetryAt = new Date(now.getTime() + nextRetryInDays * 864e5);

      if (lastPayment?.providerPaymentId) {
        await this.payments
          .retryInvoicePayment(
            lastPayment.providerPaymentId,
            `dunning:${invoice.id}:${attempt + 1}`,
          )
          .catch((error: Error) => {
            // A provider failure must not abort the sweep for every other family.
            this.logger.warn(`Retry failed for invoice ${invoice.number}: ${error.message}`);
          });
      }

      await this.prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          provider: this.providerCode,
          providerPaymentId: `retry_${invoice.id}_${attempt + 1}_${randomUUID().slice(0, 8)}`,
          method: 'CARD',
          amountMinor: invoice.totalMinor,
          currency: invoice.currency,
          status: 'PENDING',
          attempt: attempt + 1,
          nextRetryAt,
          failureReason: 'Scheduled dunning retry',
        },
      });

      retried += 1;
    }

    await this.audit.record({
      actorId,
      action: 'bil.dunning.run',
      targetType: 'invoice',
      after: { retried, cancelled, scanned: overdue.length },
    });

    return { retried, cancelled };
  }

  /** Issues a full or partial refund (FR-BIL-06). */
  async refund(input: { paymentId: string; amountMinor: number; reason: string; actorId: string }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
      include: { invoice: true, refunds: true },
    });
    if (!payment) throw AppError.notFound('Payment');
    if (payment.status !== 'SUCCEEDED') {
      throw AppError.conflict('CONFLICT', 'Only a succeeded payment can be refunded');
    }

    const alreadyRefunded = payment.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const refundable = payment.amountMinor - alreadyRefunded;
    if (input.amountMinor <= 0 || input.amountMinor > refundable) {
      throw AppError.badRequest(`Refund must be between 1 and ${refundable} minor units`, {
        refundable,
        alreadyRefunded,
      });
    }

    const providerRefund = await this.payments.refund({
      providerPaymentId: payment.providerPaymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      idempotencyKey: `refund:${payment.id}:${alreadyRefunded + input.amountMinor}`,
    });

    const refundRow = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        issuedById: input.actorId,
      },
    });

    // Fully refunded payments flip to REFUNDED; a partial one leaves the payment
    // SUCCEEDED and the invoice untouched, because the family did still get what they
    // paid for.
    const totalRefunded = alreadyRefunded + input.amountMinor;
    if (totalRefunded >= payment.amountMinor) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'REFUNDED' },
      });
    }

    await this.audit.record({
      actorId: input.actorId,
      action: 'bil.refund',
      targetType: 'refund',
      targetId: refundRow.id,
      after: {
        providerRefundId: providerRefund.refundId,
        amountMinor: input.amountMinor,
        reason: input.reason,
      },
    });

    return refundRow;
  }

  /** Family billing view. */
  async familyBilling(userId: string) {
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });
    const familyIds = memberships.map((m) => m.familyId);
    if (familyIds.length === 0) return { subscriptions: [], invoices: [] };

    const [subscriptions, invoices] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { familyId: { in: familyIds } },
        include: { plan: { select: { code: true, name: true, classesPerWeek: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { familyId: { in: familyIds } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return { subscriptions, invoices };
  }
}

function intervalOf(period: string): 'month' | 'quarter' | 'half_year' {
  if (period === 'QUARTERLY') return 'quarter';
  if (period === 'HALF_YEARLY') return 'half_year';
  return 'month';
}

function invoiceNumber(): string {
  return `INV-${new Date().getUTCFullYear()}-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
