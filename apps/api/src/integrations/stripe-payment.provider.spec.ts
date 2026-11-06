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
      update: jest.fn(async () => ({ id: 'plan-HIFZ_MONTHLY' })),
    },
    subscriptions: {
      retrieve: jest.fn(async () => ({ id: 'sub_1', schedule: null })),
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
    invoices: {
      pay: jest.fn(async () => ({})),
      // The invoice's charge, as `expand: ['payments']` returns it.
      retrieve: jest.fn(async () => ({
        id: 'in_1',
        payments: {
          data: [
            {
              status: 'paid',
              is_default: true,
              payment: { type: 'payment_intent', payment_intent: 'pi_from_invoice' },
            },
          ],
        },
      })),
      list: jest.fn(async () => ({ data: [] })),
    },
    refunds: { create: jest.fn(async () => ({ id: 're_1' })) },
    coupons: { create: jest.fn(async () => ({ id: 'coupon_1' })) },
    subscriptionSchedules: {
      create: jest.fn(async () => ({ id: 'sched_1' })),
      retrieve: jest.fn(async () => ({ id: 'sched_1', phases: [{ start_date: 100 }] })),
      update: jest.fn(async () => ({})),
      release: jest.fn(async () => ({})),
    },
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
    // An older invoice is still paid in its own currency; Adaptive Pricing stays on.
    expect(params.adaptive_pricing).toEqual({ enabled: true });
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

  it('names the product after the plan, not its code, so the family never reads "ONE_TO_ONE_1X"', async () => {
    const { provider, client } = build();

    await provider.createSubscriptionCheckout({
      reference: 'sub-ref',
      customerId: 'cus_1',
      planCode: 'ONE_TO_ONE_1X',
      planName: 'One-to-one, once a week',
      amountMinor: 3900,
      currency: 'GBP',
      interval: 'month',
      successUrl: 'https://web.test/ok',
      cancelUrl: 'https://web.test/no',
      idempotencyKey: 'subcheckout-1',
    });

    expect(client.products.create).toHaveBeenCalledWith({
      id: 'plan-ONE_TO_ONE_1X',
      name: 'One-to-one, once a week',
      metadata: { planCode: 'ONE_TO_ONE_1X' },
    });
  });

  it('renames a product created earlier under the bare plan code', async () => {
    const { provider, client } = build();
    client.products.retrieve.mockResolvedValueOnce({
      id: 'plan-ONE_TO_ONE_1X',
      name: 'ONE_TO_ONE_1X',
    } as never);

    await provider.createSubscription({
      customerId: 'cus_1',
      planCode: 'ONE_TO_ONE_1X',
      planName: 'One-to-one, once a week',
      amountMinor: 3900,
      currency: 'GBP',
      interval: 'month',
      idempotencyKey: 'sub-3',
    });

    expect(client.products.create).not.toHaveBeenCalled();
    expect(client.products.update).toHaveBeenCalledWith('plan-ONE_TO_ONE_1X', {
      name: 'One-to-one, once a week',
    });
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

  // Subscription payments recorded before the payment intent was stored carry the invoice
  // id, and `refunds.create({ payment_intent: 'in_…' })` is an error at Stripe.
  it('refunds a payment recorded by its invoice id through that invoice’s payment intent', async () => {
    const { provider, client } = build();

    await provider.refund({
      providerPaymentId: 'in_1',
      amountMinor: 500,
      reason: 'duplicate',
      idempotencyKey: 'refund-3',
    });

    expect(client.invoices.retrieve).toHaveBeenCalledWith('in_1', { expand: ['payments'] });
    expect(client.refunds.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ payment_intent: 'pi_from_invoice', amount: 500 }),
      { idempotencyKey: 'refund-3' },
    );
  });

  it('asks for invoice payments when reconciling, so invoices carry their payment intent', async () => {
    const { provider, client } = build();
    client.subscriptions.retrieve.mockResolvedValueOnce({
      id: 'sub_1',
      status: 'active',
      items: { data: [] },
    } as never);
    client.invoices.list.mockResolvedValueOnce({
      data: [
        {
          id: 'in_7',
          status: 'paid',
          amount_paid: 3900,
          currency: 'gbp',
          lines: { data: [] },
          payments: {
            data: [{ status: 'paid', is_default: true, payment: { payment_intent: 'pi_7' } }],
          },
        },
      ],
    } as never);

    const state = await provider.fetchSubscription({ providerSubscriptionId: 'sub_1' });

    expect(client.invoices.list).toHaveBeenCalledWith(
      expect.objectContaining({ expand: ['data.payments'] }),
    );
    expect(state?.invoices[0]).toMatchObject({ id: 'in_7', paymentId: 'pi_7', paid: true });
  });

  it('applies an upgrade only once its charge has gone through', async () => {
    const { provider, client } = build();
    client.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      schedule: null,
      metadata: {},
      items: { data: [{ id: 'si_1', price: { id: 'price_old' }, current_period_end: 1 }] },
    } as never);
    const upgrade = {
      providerSubscriptionId: 'sub_1',
      planCode: 'HIFZ_3',
      amountMinor: 9900,
      currency: 'GBP',
      interval: 'month' as const,
      when: 'now' as const,
    };

    // Card declined: Stripe keeps the old price and parks the change as a pending update.
    client.subscriptions.update.mockResolvedValueOnce({ pending_update: { expires_at: 1 } });
    await expect(provider.changeSubscriptionPlan(upgrade)).resolves.toEqual({
      appliedNow: false,
      paymentPending: true,
    });
    expect(client.subscriptions.update).toHaveBeenCalledTimes(1);
    expect(client.subscriptions.update).toHaveBeenLastCalledWith(
      'sub_1',
      expect.objectContaining({ payment_behavior: 'pending_if_incomplete' }),
    );

    client.subscriptions.update.mockClear();
    client.subscriptions.update.mockResolvedValueOnce({ pending_update: null });
    await expect(provider.changeSubscriptionPlan(upgrade)).resolves.toEqual({ appliedNow: true });
  });

  it('takes a sibling or promo discount off with a one-use amount coupon on checkout', async () => {
    const { provider, client } = build();

    await provider.createSubscriptionCheckout({
      reference: 'sub-ref',
      customerId: 'cus_1',
      planCode: 'HIFZ_MONTHLY',
      amountMinor: 10_000,
      currency: 'USD',
      interval: 'month',
      idempotencyKey: 'subcheckout:1',
      successUrl: 'https://web.test/ok',
      cancelUrl: 'https://web.test/no',
      discount: { amountOffMinor: 2_500, label: 'Promo WELCOME25' },
    });

    expect(client.coupons.create).toHaveBeenCalledWith(
      {
        amount_off: 2_500,
        currency: 'usd',
        duration: 'forever',
        max_redemptions: 1,
        name: 'Promo WELCOME25',
      },
      { idempotencyKey: 'subcheckout:1:coupon' },
    );
    const [params] = client.checkout.sessions.create.mock.calls[0] as unknown as [
      Record<string, any>,
    ];
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'usd', unit_amount: 10_000 });
    expect(params.discounts).toEqual([{ coupon: 'coupon_1' }]);
    // Priced in USD; Stripe Adaptive Pricing shows the family their local currency. No
    // `currency_options` are sent, which would switch it off for those currencies.
    expect(params.adaptive_pricing).toEqual({ enabled: true });
    expect(params.line_items[0].price_data.currency_options).toBeUndefined();
  });

  it('creates no coupon when there is no discount', async () => {
    const { provider, client } = build();

    await provider.createSubscription({
      customerId: 'cus_1',
      planCode: 'HIFZ_MONTHLY',
      amountMinor: 3900,
      currency: 'GBP',
      interval: 'month',
      idempotencyKey: 'sub-1',
    });

    expect(client.coupons.create).not.toHaveBeenCalled();
    const [params] = client.subscriptions.create.mock.calls[0] as unknown as [Record<string, any>];
    expect(params.discounts).toBeUndefined();
  });

  it('carries the subscription discount into both phases of a deferred downgrade', async () => {
    const { provider, client } = build();
    client.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      schedule: null,
      metadata: {},
      discounts: ['di_1'],
      items: { data: [{ id: 'si_1', price: { id: 'price_old' }, current_period_end: 500 }] },
    } as never);

    await provider.changeSubscriptionPlan({
      providerSubscriptionId: 'sub_1',
      planCode: 'HIFZ_1',
      amountMinor: 4900,
      currency: 'GBP',
      interval: 'month',
      when: 'period_end',
    });

    const [, params] = client.subscriptionSchedules.update.mock.calls[0] as unknown as [
      string,
      Record<string, any>,
    ];
    expect(params.phases.map((p: { discounts?: unknown }) => p.discounts)).toEqual([
      [{ discount: 'di_1' }],
      [{ discount: 'di_1' }],
    ]);
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

  // A delayed payment method (a bank debit) completes checkout with nothing paid yet.
  it('carries the checkout payment status so an unpaid checkout does not start the plan', () => {
    const { provider } = build();
    const session = {
      id: 'cs_9',
      object: 'checkout.session',
      mode: 'subscription',
      client_reference_id: 'our-sub-1',
      subscription: 'sub_9',
    };

    const unpaid = signedEvent('checkout.session.completed', {
      ...session,
      payment_status: 'unpaid',
    });
    expect(provider.parseWebhook(unpaid.body, unpaid.header)).toMatchObject({
      type: 'subscription_checkout_completed',
      reference: 'our-sub-1',
      paymentStatus: 'unpaid',
    });

    const settled = signedEvent('checkout.session.async_payment_succeeded', {
      ...session,
      payment_status: 'paid',
    });
    expect(provider.parseWebhook(settled.body, settled.header)).toMatchObject({
      type: 'subscription_checkout_completed',
      paymentStatus: 'paid',
    });
  });

  it('keys a subscription invoice by its payment intent, not the invoice id', () => {
    const { provider } = build();
    const { body, header } = signedEvent('invoice.paid', {
      id: 'in_5',
      object: 'invoice',
      status: 'paid',
      amount_paid: 3900,
      currency: 'gbp',
      lines: { data: [] },
      parent: { subscription_details: { subscription: 'sub_5', metadata: {} } },
    });

    const event = provider.parseWebhook(body, header);
    expect(event.invoice?.id).toBe('in_5');
    // Not in the webhook payload; billing resolves it through `invoicePaymentId`.
    expect(event.invoice?.paymentId).toBeUndefined();
  });

  it('carries each refund id from an expanded charge.refunded, skipping failed ones', () => {
    const { provider } = build();
    const event = signedEvent('charge.refunded', {
      id: 'ch_1',
      object: 'charge',
      payment_intent: 'pi_1',
      amount_refunded: 700,
      refunds: {
        object: 'list',
        data: [
          { id: 're_a', object: 'refund', amount: 500, status: 'succeeded' },
          { id: 're_b', object: 'refund', amount: 200, status: 'pending' },
          { id: 're_c', object: 'refund', amount: 900, status: 'failed' },
        ],
      },
    });

    expect(provider.parseWebhook(event.body, event.header)).toMatchObject({
      type: 'refund_created',
      providerPaymentId: 'pi_1',
      amountMinor: 700,
      refunds: [
        { id: 're_a', amountMinor: 500 },
        { id: 're_b', amountMinor: 200 },
      ],
    });
  });

  it('maps refund.created to one refund with its id, and ignores a failed refund', () => {
    const { provider } = build();
    const created = signedEvent('refund.created', {
      id: 're_9',
      object: 'refund',
      amount: 1_200,
      payment_intent: 'pi_9',
      charge: 'ch_9',
      status: 'succeeded',
    });
    const parsed = provider.parseWebhook(created.body, created.header);
    expect(parsed).toMatchObject({
      type: 'refund_created',
      providerPaymentId: 'pi_9',
      refunds: [{ id: 're_9', amountMinor: 1_200 }],
    });
    // No cumulative total: billing must not run the total-only fallback on it.
    expect(parsed.amountMinor).toBeUndefined();

    const failed = signedEvent('refund.updated', {
      id: 're_9',
      object: 'refund',
      amount: 1_200,
      payment_intent: 'pi_9',
      status: 'failed',
    });
    expect(provider.parseWebhook(failed.body, failed.header).type).toBe('ignored');
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
