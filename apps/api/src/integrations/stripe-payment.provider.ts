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
  ProviderSubscriptionInput,
  RefundInput,
} from './providers';

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
    const product = await this.ensureProduct(input.planCode);
    const subscription = await this.stripe.subscriptions.create(
      {
        customer: input.customerId,
        metadata: { planCode: input.planCode },
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
   * A subscription item needs a real Stripe product rather than inline product data. One
   * product per plan code, under a deterministic id so a second call (or a second process)
   * finds the first instead of creating a duplicate.
   */
  private async ensureProduct(planCode: string): Promise<string> {
    const id = `plan-${planCode}`;
    try {
      return (await this.stripe.products.retrieve(id)).id;
    } catch (error) {
      if ((error as { code?: string }).code !== 'resource_missing') throw error;
    }
    return (await this.stripe.products.create({ id, name: planCode, metadata: { planCode } })).id;
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

  async refund(input: RefundInput): Promise<{ refundId: string }> {
    const id = input.providerPaymentId;
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
      case 'customer.subscription.updated':
        return {
          ...base,
          type: 'subscription_updated',
          providerSubscriptionId: event.data.object.id,
        };
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
          providerPaymentId:
            typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.id,
          amountMinor: charge.amount_refunded,
        };
      }
      default:
        // Signed and valid, but not one we model. The billing service matches on `type`,
        // so an unknown type is acknowledged without effect.
        return { ...base, type: 'ignored', raw: { ignored: event.type } };
    }
  }
}
