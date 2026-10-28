import Stripe from 'stripe';

import type { AppConfigService } from '../config/app-config.service';
import { StripePaymentProvider } from './stripe-payment.provider';

const SECRET = 'whsec_test_secret';

function config(overrides: Record<string, unknown> = {}): AppConfigService {
  return {
    value: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET, ...overrides },
  } as unknown as AppConfigService;
}

/** A client whose methods are mocks, so nothing here touches the network. */
function fakeClient() {
  const client = {
    customers: { create: jest.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        create: jest.fn(async () => ({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' })),
      },
    },
    products: {
      retrieve: jest.fn(async () => {
        throw Object.assign(new Error('missing'), { code: 'resource_missing' });
      }),
      create: jest.fn(async () => ({ id: 'plan-HIFZ_MONTHLY' })),
    },
    subscriptions: {
      create: jest.fn(async () => ({
        id: 'sub_1',
        status: 'active',
        items: {
          data: [{ current_period_start: 1_760_000_000, current_period_end: 1_762_592_000 }],
        },
      })),
      update: jest.fn(async () => ({})),
      cancel: jest.fn(async () => ({})),
    },
    invoices: { pay: jest.fn(async () => ({})) },
    refunds: { create: jest.fn(async () => ({ id: 're_1' })) },
    // The real verifier, so the signature tests exercise Stripe's own code.
    webhooks: new Stripe('sk_test_x').webhooks,
  };
  return client;
}

function build(overrides: Record<string, unknown> = {}) {
  const client = fakeClient();
  const provider = new StripePaymentProvider(config(overrides), client as unknown as Stripe);
  return { provider, client };
}

function signedEvent(type: string, object: Record<string, unknown>, secret = SECRET) {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type,
    created: 1_760_000_000,
    data: { object },
  });
  const header = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret });
  return { body: Buffer.from(payload), header };
}

describe('StripePaymentProvider requests', () => {
  it('forwards the idempotency key and lowercases the currency on checkout', async () => {
    const { provider, client } = build();

    const session = await provider.createCheckout({
      familyId: 'f1',
      invoiceId: 'inv-id',
      amountMinor: 3900,
      currency: 'GBP',
      customerId: 'cus_1',
      successUrl: 'https://web.test/ok',
      cancelUrl: 'https://web.test/no',
      idempotencyKey: 'checkout-1',
      metadata: { invoiceNumber: 'INV-9', invoiceId: 'inv-id' },
    });

    expect(session).toEqual({
      provider: 'stripe',
      sessionId: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    });
    const [params, options] = client.checkout.sessions.create.mock.calls[0] as unknown as [
      Record<string, any>,
      Record<string, unknown>,
    ];
    expect(options).toEqual({ idempotencyKey: 'checkout-1' });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'gbp', unit_amount: 3900 });
    // The invoice number must reach the payment intent, or its later events cannot be matched.
    expect(params.metadata.invoiceNumber).toBe('INV-9');
    expect(params.payment_intent_data.metadata.invoiceNumber).toBe('INV-9');
  });

  it('maps plan intervals to Stripe month counts and creates the product once', async () => {
    const { provider, client } = build();

    const sub = await provider.createSubscription({
      customerId: 'cus_1',
      planCode: 'HIFZ_MONTHLY',
      amountMinor: 3900,
      currency: 'GBP',
      interval: 'quarter',
      idempotencyKey: 'sub-1',
    });

    expect(client.products.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'plan-HIFZ_MONTHLY' }),
    );
    const [params] = client.subscriptions.create.mock.calls[0] as unknown as [Record<string, any>];
    expect(params.items[0].price_data.recurring).toEqual({ interval: 'month', interval_count: 3 });
    expect(sub).toMatchObject({ provider: 'stripe', subscriptionId: 'sub_1', status: 'active' });
    expect(sub.currentPeriodEnd).toEqual(new Date(1_762_592_000 * 1000));
  });

  it('reuses a product that already exists', async () => {
    const { provider, client } = build();
    client.products.retrieve.mockResolvedValueOnce({ id: 'plan-HIFZ_MONTHLY' } as never);

    await provider.createSubscription({
      customerId: 'cus_1',
      planCode: 'HIFZ_MONTHLY',
      amountMinor: 3900,
      currency: 'GBP',
      interval: 'month',
      idempotencyKey: 'sub-2',
    });

    expect(client.products.create).not.toHaveBeenCalled();
  });

  it('pauses with void behaviour, resumes, and cancels now or at period end', async () => {
    const { provider, client } = build();

    await provider.pauseSubscription('sub_1', new Date(2_000_000_000 * 1000));
    expect(client.subscriptions.update).toHaveBeenLastCalledWith('sub_1', {
      pause_collection: { behavior: 'void', resumes_at: 2_000_000_000 },
    });

    await provider.resumeSubscription('sub_1');
    expect(client.subscriptions.update).toHaveBeenLastCalledWith('sub_1', { pause_collection: '' });

    await provider.cancelSubscription('sub_1', true);
    expect(client.subscriptions.update).toHaveBeenLastCalledWith('sub_1', {
      cancel_at_period_end: true,
    });

    await provider.cancelSubscription('sub_1', false);
    expect(client.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
  });

  it('refunds against the payment intent or the charge, with an idempotency key', async () => {
    const { provider, client } = build();

    await provider.refund({
      providerPaymentId: 'pi_1',
      amountMinor: 500,
      reason: 'duplicate',
      idempotencyKey: 'refund-1',
    });
    expect(client.refunds.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ payment_intent: 'pi_1', amount: 500 }),
      { idempotencyKey: 'refund-1' },
    );

    await provider.refund({
      providerPaymentId: 'ch_1',
      amountMinor: 500,
      reason: 'duplicate',
      idempotencyKey: 'refund-2',
    });
    expect(client.refunds.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ charge: 'ch_1' }),
      { idempotencyKey: 'refund-2' },
    );
  });

  it('retries only a Stripe invoice', async () => {
    const { provider, client } = build();

    await provider.retryInvoicePayment('in_1', 'retry-1');
    expect(client.invoices.pay).toHaveBeenCalledWith('in_1', {}, { idempotencyKey: 'retry-1' });

    await expect(provider.retryInvoicePayment('pi_1', 'retry-2')).rejects.toThrow(
      /Only a Stripe invoice/,
    );
  });
});

describe('StripePaymentProvider.parseWebhook', () => {
  it('accepts a correctly signed payment_intent.succeeded and keeps the invoice number', () => {
    const { provider } = build();
    const { body, header } = signedEvent('payment_intent.succeeded', {
      id: 'pi_1',
      object: 'payment_intent',
      amount: 3900,
      amount_received: 3900,
      metadata: { invoiceNumber: 'INV-9' },
    });

    expect(provider.parseWebhook(body, header)).toMatchObject({
      eventId: 'evt_1',
      type: 'payment_succeeded',
      providerPaymentId: 'pi_1',
      invoiceNumber: 'INV-9',
      amountMinor: 3900,
    });
  });

  it('maps a failed payment, a cancelled subscription and a refund', () => {
    const { provider } = build();

    const failed = signedEvent('payment_intent.payment_failed', {
      id: 'pi_2',
      object: 'payment_intent',
      amount: 3900,
      metadata: { invoiceNumber: 'INV-10' },
    });
    expect(provider.parseWebhook(failed.body, failed.header)).toMatchObject({
      type: 'payment_failed',
      providerPaymentId: 'pi_2',
      invoiceNumber: 'INV-10',
    });

    const cancelled = signedEvent('customer.subscription.deleted', {
      id: 'sub_9',
      object: 'subscription',
    });
    expect(provider.parseWebhook(cancelled.body, cancelled.header)).toMatchObject({
      type: 'subscription_cancelled',
      providerSubscriptionId: 'sub_9',
    });

    const refunded = signedEvent('charge.refunded', {
      id: 'ch_1',
      object: 'charge',
      payment_intent: 'pi_1',
      amount_refunded: 500,
    });
    expect(provider.parseWebhook(refunded.body, refunded.header)).toMatchObject({
      type: 'refund_created',
      providerPaymentId: 'pi_1',
      amountMinor: 500,
    });
  });

  it('acknowledges an event type it does not model, without effect', () => {
    const { provider } = build();
    const { body, header } = signedEvent('customer.created', { id: 'cus_1', object: 'customer' });

    expect(provider.parseWebhook(body, header).type).toBe('ignored');
  });

  it('rejects a signature made with the wrong secret', () => {
    const { provider } = build();
    const { body, header } = signedEvent(
      'payment_intent.succeeded',
      { id: 'pi_1', object: 'payment_intent', amount: 1, metadata: {} },
      'whsec_someone_else',
    );

    expect(() => provider.parseWebhook(body, header)).toThrow(/Invalid Stripe signature/);
  });

  it('rejects a body that was altered after signing', () => {
    const { provider } = build();
    const { body, header } = signedEvent('payment_intent.succeeded', {
      id: 'pi_1',
      object: 'payment_intent',
      amount: 100,
      metadata: {},
    });
    const tampered = Buffer.from(body.toString().replace('"amount":100', '"amount":999999'));

    expect(() => provider.parseWebhook(tampered, header)).toThrow(/Invalid Stripe signature/);
  });

  it('rejects a missing signature header', () => {
    const { provider } = build();
    expect(() => provider.parseWebhook(Buffer.from('{}'), undefined)).toThrow(
      /Missing Stripe-Signature/,
    );
  });

  it('refuses to verify anything without a webhook secret', () => {
    const { provider } = build({ STRIPE_WEBHOOK_SECRET: undefined });
    expect(() => provider.parseWebhook(Buffer.from('{}'), 't=1,v1=x')).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });
});

describe('StripePaymentProvider construction', () => {
  it('refuses to start without a secret key', () => {
    expect(() => new StripePaymentProvider(config({ STRIPE_SECRET_KEY: undefined }))).toThrow(
      /STRIPE_SECRET_KEY/,
    );
  });
});
