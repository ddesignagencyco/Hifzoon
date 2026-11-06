import { Logger } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import Stripe from 'stripe';

import { AppError } from '../common/errors/app-error';
import type { AppConfigService } from '../config/app-config.service';
import type {
  CheckoutInput,
  CheckoutSession,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderSubscription,
  PlanChangeInput,
  ProviderInvoice,
  ProviderSubscriptionInput,
  ProviderSubscriptionState,
  RefundInput,
  SubscriptionCheckoutInput,
} from './providers';

/**
 * Stripe Adaptive Pricing: every price is set in USD and Checkout shows the family their
 * local currency, converted by Stripe; we are still charged, paid and notified in USD
 * (`amount_total`, `currency`), with what the family saw in `presentment_details`. It needs
 * the price in a settlement currency and no `currency_options` on it, which inline
 * `price_data` in USD meets. Asked for explicitly so it does not depend only on the
 * Dashboard switch (Settings → Payments → Adaptive Pricing); a session Stripe cannot
 * localise (unsupported country or payment method) simply stays in USD.
 */
const ADAPTIVE_PRICING = { adaptive_pricing: { enabled: true } } as const;

/** Months per billing interval, matching the plan model. */
const INTERVAL_MONTHS = { month: 1, quarter: 3, half_year: 6 } as const;

/**
 * Stripe adapter (TRD section 14, FR-BIL-01..05).
 *
 * Everything money-shaped is an integer in the currency's minor unit, which is exactly what
 * Stripe's `unit_amount` and `amount` take, so there is no conversion to get wrong (a float
 * anywhere in billing is a bug).
 *
 * Three rules shape the adapter:
 *
 * - **Idempotency keys are always forwarded.** The worker retries, and a retried charge must
 *   not become a second charge. Stripe deduplicates on this header.
 * - **The webhook is authenticated by signature, over the raw bytes.** `constructEvent` throws
 *   on a bad or stale signature; that is turned into a 400 so the endpoint never acts on a
 *   forged event.
 * - **Our invoice number travels in metadata, on both the session and the payment intent**, so
 *   the `payment_intent.*` events that arrive later can still be matched to an invoice.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';

  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string | undefined;

  /** `client` is injectable so tests never touch the network. */
  constructor(config: AppConfigService, client?: Stripe) {
    const { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: webhookSecret } = config.value;
    if (!client && !key) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'PAYMENT_PROVIDER=stripe requires STRIPE_SECRET_KEY',
      );
    }
    this.stripe = client ?? new Stripe(key as string);
    this.webhookSecret = webhookSecret;
  }

  async createCustomer(input: {
    familyId: string;
    email: string;
    name: string;
  }): Promise<{ customerId: string }> {
    const customer = await this.stripe.customers.create(
      { email: input.email, name: input.name, metadata: { familyId: input.familyId } },
      // One customer per family: a retried signup must not create a second one.
      { idempotencyKey: `customer-${input.familyId}` },
    );
    return { customerId: customer.id };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        ...(input.customerId ? { customer: input.customerId } : {}),
        client_reference_id: input.invoiceId,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product_data: {
                name: `Hifzoon invoice ${input.metadata.invoiceNumber ?? ''}`.trim(),
              },
            },
          },
        ],
        metadata: input.metadata,
        // The payment intent is what later events refer to, so it carries the same metadata.
        payment_intent_data: { metadata: input.metadata },
        ...ADAPTIVE_PRICING,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) {
      throw new AppError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        'Stripe created a checkout session without a URL',
      );
    }
    return { provider: this.name, sessionId: session.id, url: session.url };
  }

  async createSubscription(input: ProviderSubscriptionInput): Promise<ProviderSubscription> {
    const product = await this.ensureProduct(input.planCode, input.planName);
    const coupon = await this.couponFor(input);
    const subscription = await this.stripe.subscriptions.create(
      {
        customer: input.customerId,
        metadata: { planCode: input.planCode },
        ...(coupon ? { discounts: [{ coupon }] } : {}),
        items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product,
              recurring: { interval: 'month', interval_count: INTERVAL_MONTHS[input.interval] },
            },
          },
        ],
      },
      { idempotencyKey: input.idempotencyKey },
    );

    const item = subscription.items.data[0];
    return {
      provider: this.name,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: new Date(item.current_period_start * 1000),
      currentPeriodEnd: new Date(item.current_period_end * 1000),
    };
  }

  /**
   * Checkout in `subscription` mode: the family enters a card once, Stripe saves it, charges
   * the first period and then bills every period itself. Our subscription id travels as
   * `client_reference_id` and in the subscription's metadata, so every later event about
   * it can be matched without a lookup table.
   */
  async createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession> {
    const product = await this.ensureProduct(input.planCode, input.planName);
    const coupon = await this.couponFor(input);
    const metadata = { subscriptionRef: input.reference, planCode: input.planCode };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: input.customerId,
        client_reference_id: input.reference,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product,
              recurring: { interval: 'month', interval_count: INTERVAL_MONTHS[input.interval] },
            },
          },
        ],
        // The discount stays on the subscription Checkout creates, so every renewal has it.
        ...(coupon ? { discounts: [{ coupon }] } : {}),
        metadata,
        subscription_data: { metadata },
        ...ADAPTIVE_PRICING,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (!session.url) {
      throw new AppError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        'Stripe created a checkout session without a URL',
      );
    }
    return { provider: this.name, sessionId: session.id, url: session.url };
  }

  async closeCheckout(sessionId: string): Promise<'closed' | 'complete'> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'complete') return 'complete';
    if (session.status === 'open') await this.stripe.checkout.sessions.expire(sessionId);
    return 'closed';
  }

  async fetchSubscription(ref: {
    providerSubscriptionId?: string;
    checkoutSessionId?: string;
  }): Promise<ProviderSubscriptionState | null> {
    let id = ref.providerSubscriptionId;
    if (!id && ref.checkoutSessionId) {
      const session = await this.stripe.checkout.sessions.retrieve(ref.checkoutSessionId);
      id = idOf(session.subscription);
    }
    if (!id) return null;
    const sub = await this.stripe.subscriptions.retrieve(id);
    // `payments` is not returned unless expanded; it holds the payment intent we key on.
    const invoices = await this.stripe.invoices.list({
      subscription: id,
      limit: 6,
      expand: ['data.payments'],
    });
    return {
      ...subscriptionState(sub),
      providerSubscriptionId: sub.id,
      invoices: invoices.data
        .filter(
          (inv) => inv.status === 'paid' || inv.status === 'open' || inv.status === 'uncollectible',
        )
        .map((inv) => ({ ...toProviderInvoice(inv), paid: inv.status === 'paid' })),
    };
  }

  /**
   * An upgrade is swapped in now and the difference invoiced at once; a downgrade is a
   * second schedule phase that starts when the paid period ends, so the family keeps
   * what they paid for.
   */
  async changeSubscriptionPlan(
    input: PlanChangeInput,
  ): Promise<{ appliedNow: boolean; paymentPending?: boolean }> {
    const product = await this.ensureProduct(input.planCode, input.planName);
    const priceData = {
      currency: input.currency.toLowerCase(),
      unit_amount: input.amountMinor,
      product,
      recurring: { interval: 'month' as const, interval_count: INTERVAL_MONTHS[input.interval] },
    };
    const sub = await this.stripe.subscriptions.retrieve(input.providerSubscriptionId);
    const item = sub.items.data[0];

    if (input.when === 'now') {
      await this.releaseSchedule(sub);
      // Without this Stripe swaps the price even when the difference cannot be charged, and
      // the family is on the dearer plan unpaid. Pending, it applies only once paid (Stripe
      // sends the subscription update then); metadata is not allowed on a pending update.
      const updated = await this.stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price_data: priceData }],
        proration_behavior: 'always_invoice',
        payment_behavior: 'pending_if_incomplete',
      });
      if (updated.pending_update) return { appliedNow: false, paymentPending: true };
      await this.stripe.subscriptions.update(sub.id, {
        metadata: { ...sub.metadata, planCode: input.planCode },
      });
      return { appliedNow: true };
    }

    const scheduleId =
      idOf(sub.schedule) ??
      (await this.stripe.subscriptionSchedules.create({ from_subscription: sub.id })).id;
    const schedule = await this.stripe.subscriptionSchedules.retrieve(scheduleId);
    const current = schedule.phases[schedule.phases.length - 1];
    // A phase without `discounts` inherits the customer's discount, not the subscription's,
    // so the sibling or promo discount is carried across explicitly.
    const discounts = (sub.discounts ?? [])
      .map((d) => idOf(d))
      .filter((id): id is string => Boolean(id))
      .map((discount) => ({ discount }));
    await this.stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: 'release',
      phases: [
        {
          items: [{ price: idOf(item.price), quantity: 1 }],
          start_date: current.start_date,
          end_date: item.current_period_end,
          ...(discounts.length ? { discounts } : {}),
        },
        {
          items: [{ price_data: priceData, quantity: 1 }],
          proration_behavior: 'none',
          metadata: { ...sub.metadata, planCode: input.planCode },
          ...(discounts.length ? { discounts } : {}),
        },
      ],
    });
    return { appliedNow: false };
  }

  async undoCancel(providerSubscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
  }

  /** A subscription managed by a schedule refuses direct updates until it is released. */
  private async releaseSchedule(sub: Stripe.Subscription): Promise<void> {
    const scheduleId = idOf(sub.schedule);
    if (scheduleId) await this.stripe.subscriptionSchedules.release(scheduleId);
  }

  /** Stripe's customer portal: update the card, see and download receipts. */
  async createBillingPortal(customerId: string, returnUrl: string): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  /**
   * A one-use coupon for this subscription's sibling or promo discount. It is an amount, not
   * a percentage, so Stripe takes off exactly what we computed and the invoice matches our
   * locked price to the minor unit (Stripe's own percentage rounding is not ours).
   */
  private async couponFor(input: ProviderSubscriptionInput): Promise<string | undefined> {
    if (!input.discount || input.discount.amountOffMinor <= 0) return undefined;
    const coupon = await this.stripe.coupons.create(
      {
        amount_off: input.discount.amountOffMinor,
        currency: input.currency.toLowerCase(),
        duration: 'forever',
        max_redemptions: 1,
        name: input.discount.label.slice(0, 40),
      },
      { idempotencyKey: `${input.idempotencyKey}:coupon` },
    );
    return coupon.id;
  }

  /**
   * A subscription item needs a real Stripe product rather than inline product data. One
   * product per plan code, under a deterministic id so a second call (or a second process)
   * finds the first instead of creating a duplicate.
   *
   * The product's *name* is what the family reads on Checkout, receipts and the portal, so
   * it is the plan's display name; the code ("ONE_TO_ONE_1X") stays in the id and metadata.
   * A product created earlier under the bare code is renamed the next time it is used.
   */
  private async ensureProduct(planCode: string, planName?: string): Promise<string> {
    const id = `plan-${planCode}`;
    const name = planName?.trim() || planCode;
    try {
      const existing = await this.stripe.products.retrieve(id);
      if (existing.name !== name && planName?.trim()) {
        await this.stripe.products.update(id, { name });
      }
      return existing.id;
    } catch (error) {
      if ((error as { code?: string }).code !== 'resource_missing') throw error;
    }
    return (await this.stripe.products.create({ id, name, metadata: { planCode } })).id;
  }

  async pauseSubscription(subscriptionId: string, until: Date): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      // `void` skips the invoices for the paused period rather than charging for it.
      pause_collection: { behavior: 'void', resumes_at: Math.floor(until.getTime() / 1000) },
    });
  }

  async resumeSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, { pause_collection: '' });
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    if (subscriptionId.startsWith('sub_')) {
      await this.releaseSchedule(await this.stripe.subscriptions.retrieve(subscriptionId));
    }
    if (atPeriodEnd) {
      await this.stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    } else {
      await this.stripe.subscriptions.cancel(subscriptionId);
    }
  }

  async retryInvoicePayment(providerPaymentId: string, idempotencyKey: string): Promise<void> {
    // Only a Stripe invoice can be re-attempted. A one-off payment intent that failed is
    // retried by the customer through a new checkout, not by us.
    if (!providerPaymentId.startsWith('in_')) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Only a Stripe invoice can be retried; "${providerPaymentId}" is not one`,
      );
    }
    await this.stripe.invoices.pay(providerPaymentId, {}, { idempotencyKey });
  }

  /** The payment intent that paid (or tried to pay) an invoice; undefined for a zero invoice. */
  async invoicePaymentId(providerInvoiceId: string): Promise<string | undefined> {
    const invoice = await this.stripe.invoices.retrieve(providerInvoiceId, {
      expand: ['payments'],
    });
    return paymentIntentOf(invoice);
  }

  async refund(input: RefundInput): Promise<{ refundId: string }> {
    let id = input.providerPaymentId;
    // Subscription payments recorded before the payment intent was stored carry the invoice
    // id, which Stripe cannot refund; the invoice's own payment intent can be.
    if (id.startsWith('in_')) {
      const intent = await this.invoicePaymentId(id);
      if (!intent) {
        throw new AppError(
          ErrorCode.VALIDATION_FAILED,
          `Stripe invoice ${id} has no payment to refund`,
        );
      }
      id = intent;
    }
    const target = id.startsWith('ch_') ? { charge: id } : { payment_intent: id };
    const refund = await this.stripe.refunds.create(
      {
        ...target,
        amount: input.amountMinor,
        reason: 'requested_by_customer',
        metadata: { reason: input.reason },
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { refundId: refund.id };
  }

  /**
   * Verifies the signature over the raw body and maps the event onto ours.
   *
   * Events we do not act on (there are hundreds) become `ignored` upstream by returning a
   * type the billing service does not match; here they throw nothing, because Stripe must
   * get a 2xx for anything it signed or it retries for days.
   */
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentWebhookEvent {
    if (!this.webhookSecret) {
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        'STRIPE_WEBHOOK_SECRET is not set; cannot verify payment webhooks',
      );
    }
    if (!signature) throw AppError.badRequest('Missing Stripe-Signature header');

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      this.logger.warn(`Rejected a Stripe webhook: ${(error as Error).message}`);
      throw AppError.badRequest('Invalid Stripe signature');
    }

    return this.normalise(event);
  }

  private normalise(event: Stripe.Event): PaymentWebhookEvent {
    const occurredAt = new Date(event.created * 1000);
    const raw = event as unknown as Record<string, unknown>;
    const base = { eventId: event.id, occurredAt, raw };

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        return {
          ...base,
          type: 'payment_succeeded',
          providerPaymentId: intent.id,
          invoiceNumber: intent.metadata?.invoiceNumber,
          amountMinor: intent.amount_received ?? intent.amount,
        };
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        return {
          ...base,
          type: 'payment_failed',
          providerPaymentId: intent.id,
          invoiceNumber: intent.metadata?.invoiceNumber,
          amountMinor: intent.amount,
        };
      }
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        // One-off invoice payments are settled by `payment_intent.succeeded`; only the
        // subscription-mode session starts something new.
        if (session.mode !== 'subscription' || !session.client_reference_id) {
          return { ...base, type: 'ignored', raw: { ignored: `${event.type}:${session.mode}` } };
        }
        // A delayed payment method completes the session before any money has moved; the
        // billing service waits for the payment instead of starting the plan on this.
        return {
          ...base,
          type: 'subscription_checkout_completed',
          reference: session.client_reference_id,
          providerSubscriptionId: idOf(session.subscription),
          paymentStatus: session.payment_status,
        };
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = idOf(invoice.parent?.subscription_details?.subscription);
        // An invoice that does not belong to a subscription is not one we mirror.
        if (!subscriptionId || !invoice.id) {
          return { ...base, type: 'ignored', raw: { ignored: `${event.type}:no-subscription` } };
        }
        return {
          ...base,
          type: event.type === 'invoice.paid' ? 'invoice_paid' : 'invoice_failed',
          providerSubscriptionId: subscriptionId,
          reference: invoice.parent?.subscription_details?.metadata?.subscriptionRef,
          invoice: toProviderInvoice(invoice),
        };
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        return {
          ...base,
          type: 'subscription_updated',
          providerSubscriptionId: sub.id,
          reference: sub.metadata?.subscriptionRef,
          subscription: subscriptionState(sub),
        };
      }
      case 'customer.subscription.deleted':
        return {
          ...base,
          type: 'subscription_cancelled',
          providerSubscriptionId: event.data.object.id,
        };
      case 'charge.refunded': {
        const charge = event.data.object;
        return {
          ...base,
          type: 'refund_created',
          providerPaymentId: idOf(charge.payment_intent) ?? charge.id,
          // Cumulative across every refund on the charge; billing records only the difference.
          amountMinor: charge.amount_refunded,
          // Only present when the payload expands them (newer API versions do not), so the
          // cumulative total above stays the fallback.
          refunds: (charge.refunds?.data ?? []).filter(counts).map(refundOf),
        };
      }
      case 'refund.created':
      case 'refund.updated': {
        const refund = event.data.object;
        const paymentId = idOf(refund.payment_intent) ?? idOf(refund.charge);
        if (!paymentId || !counts(refund)) {
          return { ...base, type: 'ignored', raw: { ignored: `${event.type}:${refund.status}` } };
        }
        return {
          ...base,
          type: 'refund_created',
          providerPaymentId: paymentId,
          refunds: [refundOf(refund)],
        };
      }
      default:
        // Signed and valid, but not one we model. The billing service matches on `type`,
        // so an unknown type is acknowledged without effect.
        return { ...base, type: 'ignored', raw: { ignored: event.type } };
    }
  }
}

function idOf(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.id;
}

/** A failed or cancelled refund gave nothing back. */
function counts(refund: Stripe.Refund): boolean {
  return refund.status !== 'failed' && refund.status !== 'canceled';
}

function refundOf(refund: Stripe.Refund) {
  return { id: refund.id, amountMinor: refund.amount };
}

function subscriptionState(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];
  const product = idOf(item?.price?.product);
  return {
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    paused: Boolean(sub.pause_collection),
    currentPeriodStart: item ? new Date(item.current_period_start * 1000) : undefined,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : undefined,
    // Products are created as `plan-<code>` (ensureProduct), so the code comes back here.
    planCode: product?.startsWith('plan-') ? product.slice(5) : undefined,
    amountMinor: item?.price?.unit_amount ?? undefined,
  };
}

function toProviderInvoice(invoice: Stripe.Invoice): ProviderInvoice {
  const line = invoice.lines?.data?.[0];
  return {
    id: invoice.id,
    number: invoice.number ?? undefined,
    amountMinor: invoice.status === 'paid' ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    periodStart: line ? new Date(line.period.start * 1000) : undefined,
    periodEnd: line ? new Date(line.period.end * 1000) : undefined,
    hostedUrl: invoice.hosted_invoice_url ?? undefined,
    pdfUrl: invoice.invoice_pdf ?? undefined,
    // The payment row is keyed by the payment intent, because that is what `charge.refunded`
    // and a refund refer to. Webhook payloads do not include `payments`; billing then asks
    // for it through `invoicePaymentId`.
    paymentId: paymentIntentOf(invoice),
  };
}

/** The invoice's payment intent, preferring the one that paid it. */
function paymentIntentOf(invoice: Stripe.Invoice): string | undefined {
  const payments = invoice.payments?.data ?? [];
  const chosen =
    payments.find((p) => p.status === 'paid') ?? payments.find((p) => p.is_default) ?? payments[0];
  return idOf(chosen?.payment.payment_intent);
}
