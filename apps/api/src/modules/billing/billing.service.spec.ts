import { DUNNING_RETRY_DAYS } from '@hifzoon/shared';

import { AppError } from '../../common/errors/app-error';
import { BillingService } from './billing.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QueueService } from '../../queue/queue.service';
import type { AuditService } from '../audit/audit.service';
import type { SettingsService } from '../settings/settings.service';
import type { PaymentProvider } from '../../integrations/providers';
import type { PolicyService } from '../../common/services/policy.service';

/**
 * Billing tests.
 *
 * The cases chosen here are the ones where being wrong costs a family money or costs
 * the platform money: partial payments, duplicate webhooks, refunds exceeding the
 * charge, dunning running off the end of the ladder, and a money-bearing event arriving
 * for a voided invoice.
 */
function buildHarness(overrides: { invoice?: Record<string, unknown> } = {}) {
  const state = {
    invoice: {
      id: 'inv-1',
      familyId: 'fam-1',
      family: { id: 'fam-1', paymentCustomerId: 'cus_1' },
      subscriptionId: 'sub-1',
      number: 'INV-2026-ABCD1234',
      currency: 'GBP',
      subtotalMinor: 10_000,
      discountMinor: 0,
      totalMinor: 10_000,
      status: 'OPEN',
      payments: [] as Array<{ providerPaymentId: string; attempt: number; amountMinor: number }>,
      ...overrides.invoice,
    },
    createdPayments: [] as Array<Record<string, unknown>>,
    subscriptionUpdates: [] as Array<Record<string, unknown>>,
    providerCalls: [] as string[],
  };

  const prisma = {
    invoice: {
      findUnique: jest.fn(async (args: { where: { id?: string; number?: string } }) => {
        if (args.where.number)
          return state.invoice.number === args.where.number ? { ...state.invoice } : null;
        return { ...state.invoice };
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.invoice = { ...state.invoice, ...data };
        return state.invoice;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.invoice, data);
        return state.invoice;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
      count: jest.fn(async () => 0),
    },
    payment: {
      upsert: jest.fn(
        async ({
          create,
          update,
        }: {
          create: Record<string, unknown>;
          update?: Record<string, unknown>;
        }) => {
          // Idempotent by `providerPaymentId`, mirroring the real unique constraint, so a
          // replayed webhook updates the existing row instead of inserting a second one.
          const existing = state.createdPayments.find(
            (p) => p.providerPaymentId === create.providerPaymentId,
          );
          if (existing) {
            Object.assign(existing, update ?? {});
            return existing;
          }
          state.createdPayments.push(create);
          state.invoice.payments.push({
            providerPaymentId: String(create.providerPaymentId),
            attempt: Number(create.attempt ?? 1),
            amountMinor: Number(create.amountMinor ?? 0),
          });
          return create;
        },
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.createdPayments.push(data);
        return data;
      }),
      // Sums what has actually been recorded, so a partial payment genuinely reads as
      // partial rather than being masked by a stubbed constant.
      aggregate: jest.fn(async () => ({
        _sum: {
          amountMinor: state.createdPayments
            .filter((p) => p.status === 'SUCCEEDED')
            .reduce((sum, p) => sum + Number(p.amountMinor ?? 0), 0),
        },
      })),
    },
    refund: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ref-1',
        ...data,
      })),
    },
    subscription: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.subscriptionUpdates.push(data);
        return { id: 'sub-1', ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => ({
        id: 'sub-1',
        planId: 'plan-1',
        familyId: 'fam-1',
        currency: 'GBP',
        status: 'ACTIVE',
        providerSubscriptionId: 'ps_1',
        cancelAtPeriodEnd: false,
        pausedUntil: null,
        plan: { billingPeriod: 'MONTHLY' },
        family: { id: 'fam-1', billingName: 'Family' },
      })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sub-2',
        ...data,
      })),
    },
    plan: {
      findUnique: jest.fn(async () => ({
        id: 'plan-1',
        code: 'HIFZ-1',
        active: true,
        billingPeriod: 'MONTHLY',
      })),
    },
    planPrice: {
      findUnique: jest.fn(async () => ({ planId: 'plan-1', currency: 'GBP', amountMinor: 10_000 })),
    },
    family: {
      findUnique: jest.fn(async () => ({
        id: 'fam-1',
        paymentCustomerId: 'cus_1',
        billingName: 'Family',
        members: [{ isPrimary: true, user: { email: 'a@b.test' } }],
      })),
      update: jest.fn(async () => ({ id: 'fam-1' })),
    },
    $transaction: jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work(prisma)),
    $executeRaw: jest.fn(),
  } as unknown as PrismaService;

  const payments = {
    name: 'fake',
    createCustomer: jest.fn(async () => ({ customerId: 'cus_1' })),
    createCheckout: jest.fn(async () => ({
      provider: 'fake',
      sessionId: 'cs_1',
      url: 'https://pay.test/cs_1',
    })),
    createSubscription: jest.fn(async () => ({
      provider: 'fake',
      subscriptionId: 'ps_1',
      status: 'active',
      currentPeriodStart: new Date('2026-04-01'),
      currentPeriodEnd: new Date('2026-05-01'),
    })),
    pauseSubscription: jest.fn(async () => {
      state.providerCalls.push('pause');
    }),
    resumeSubscription: jest.fn(async () => {
      state.providerCalls.push('resume');
    }),
    cancelSubscription: jest.fn(async () => {
      state.providerCalls.push('cancel');
    }),
    retryInvoicePayment: jest.fn(async () => {
      state.providerCalls.push('retry');
    }),
    refund: jest.fn(async () => ({ refundId: 're_1' })),
    parseWebhook: jest.fn(),
  } as unknown as PaymentProvider;

  const queues = {
    add: jest.fn(async () => ({})),
    addDelayed: jest.fn(async () => ({})),
  } as unknown as QueueService;

  const service = new BillingService(
    prisma,
    { record: jest.fn() } as unknown as AuditService,
    {
      getNumber: jest.fn(async () => 7),
      getBoolean: jest.fn(async () => true),
    } as unknown as SettingsService,
    // Returns a real promise: the service chains `.catch()` onto the enqueue, so a
    // bare `jest.fn()` returning undefined would crash rather than assert.
    queues,
    payments,
    // Ownership policies are stubbed to pass here; the policy itself is covered by its
    // own tests, and these cases are about the money rules that run after the gate.
    { assertGuardianInFamily: jest.fn(async () => undefined) } as unknown as PolicyService,
  );

  return { service, state, prisma, payments, queues };
}

describe('BillingService', () => {
  describe('invoicing', () => {
    it('issues an invoice with a unique, non-sequential number', async () => {
      const { service } = buildHarness();

      const first = await service.invoiceSubscription('sub-1', 'actor-1');
      const second = await service.invoiceSubscription('sub-1', 'actor-1');

      expect(first.number).toMatch(/^INV-\d{4}-[0-9A-F]{8}$/);
      // A guessable sequential invoice number is an invitation to forge one.
      expect(first.number).not.toBe(second.number);
    });

    it('never lets a discount exceed the subtotal', async () => {
      const { service } = buildHarness();

      await expect(
        service.invoiceSubscription('sub-1', 'actor-1', { discountMinor: 99_999 }),
      ).rejects.toBeInstanceOf(AppError);
    });

    it('refuses to start checkout for a paid or voided invoice', async () => {
      const paid = buildHarness({ invoice: { status: 'PAID' } });
      await expect(
        paid.service.startCheckout('inv-1', 'https://ok.test', 'https://no.test', 'k1', 'actor-1'),
      ).rejects.toThrow(/already paid/i);

      const voided = buildHarness({ invoice: { status: 'VOID' } });
      await expect(
        voided.service.startCheckout('inv-1', 'https://ok.test', 'https://no.test', 'k1', 'actor-1'),
      ).rejects.toThrow(/voided/i);
    });
  });

  describe('payment webhooks', () => {
    it('marks an invoice paid when a payment covers it in full', async () => {
      const { service, state } = buildHarness();

      const result = await service.handlePaymentEvent({
        type: 'payment_succeeded',
        providerPaymentId: 'pay_1',
        invoiceNumber: state.invoice.number,
        amountMinor: 10_000,
        occurredAt: new Date(),
      });

      expect(result.applied).toBe(true);
      expect(state.invoice.status).toBe('PAID');
    });

    it('leaves the invoice open on a partial payment instead of losing revenue', async () => {
      const { service, state } = buildHarness({ invoice: { totalMinor: 10_000 } });
      (state.invoice as { totalMinor: number }).totalMinor = 20_000;

      const result = await service.handlePaymentEvent({
        type: 'payment_succeeded',
        providerPaymentId: 'pay_partial',
        invoiceNumber: state.invoice.number,
        amountMinor: 5_000,
        occurredAt: new Date(),
      });

      expect(result.applied).toBe(true);
      expect(result.reason).toMatch(/partial/i);
      expect(state.invoice.status).toBe('OPEN');
    });

    it('records but does not settle a payment that arrives for a voided invoice', async () => {
      const { service, state } = buildHarness({ invoice: { status: 'VOID' } });

      const result = await service.handlePaymentEvent({
        type: 'payment_succeeded',
        providerPaymentId: 'pay_void',
        invoiceNumber: state.invoice.number,
        amountMinor: 10_000,
        occurredAt: new Date(),
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toMatch(/void/i);
      // The money genuinely arrived, so it must be visible to reconciliation — but the
      // invoice must not be quietly marked settled.
      expect(state.createdPayments).toHaveLength(1);
      expect(state.invoice.status).toBe('VOID');
    });

    it('marks a failed payment PAST_DUE and starts the dunning ladder', async () => {
      const { service, prisma } = buildHarness();
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'pay-1',
        providerPaymentId: 'pay_fail',
        status: 'SUCCEEDED',
        invoiceId: 'inv-1',
        invoice: { id: 'inv-1', subscriptionId: 'sub-1', totalMinor: 10_000 },
      });

      const result = await service.handlePaymentEvent({
        type: 'payment_failed',
        providerPaymentId: 'pay_fail',
        occurredAt: new Date(),
      });

      expect(result.applied).toBe(true);
      // `updateMany` is what moves the subscription to PAST_DUE; `update` is reserved
      // for single-row writes such as `resume`.
      const pastDueCalls = (prisma.subscription.updateMany as jest.Mock).mock.calls;
      expect(
        pastDueCalls.some(
          ([arg]: [{ data: Record<string, unknown> }]) => arg.data.status === 'PAST_DUE',
        ),
      ).toBe(true);
    });

    it('ignores an event for an unknown invoice rather than creating one', async () => {
      const { service } = buildHarness();
      const result = await service.handlePaymentEvent({
        type: 'payment_succeeded',
        providerPaymentId: 'pay_x',
        invoiceNumber: 'INV-1970-NOPE0000',
        amountMinor: 100,
        occurredAt: new Date(),
      });

      expect(result).toEqual({ applied: false, reason: 'unknown invoice' });
    });
  });

  describe('webhook replay is harmless', () => {
    it('does not double-record a redelivered payment_succeeded', async () => {
      const { service, state } = buildHarness();
      const event = {
        type: 'payment_succeeded' as const,
        providerPaymentId: 'pay_replay',
        invoiceNumber: state.invoice.number,
        amountMinor: 10_000,
        occurredAt: new Date(),
      };

      await service.handlePaymentEvent(event);
      await service.handlePaymentEvent(event);

      // Unique on providerPaymentId: one row, and the invoice is settled exactly once.
      expect(state.createdPayments).toHaveLength(1);
      expect(state.invoice.status).toBe('PAID');
    });

    it('records a refund once even when refund_created is redelivered', async () => {
      const { service, prisma } = buildHarness();
      const payment = {
        id: 'pay-1',
        providerPaymentId: 'pay_ref',
        status: 'SUCCEEDED',
        invoiceId: 'inv-1',
      };
      (prisma.payment.findUnique as jest.Mock).mockImplementation(async () => ({ ...payment }));
      (prisma.payment.update as jest.Mock).mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(payment, data);
          return payment;
        },
      );

      const event = {
        type: 'refund_created' as const,
        providerPaymentId: 'pay_ref',
        amountMinor: 10_000,
        occurredAt: new Date(),
      };

      const first = await service.handlePaymentEvent(event);
      const second = await service.handlePaymentEvent(event);

      expect(first.applied).toBe(true);
      expect(second).toEqual({ applied: false, reason: 'refund already recorded' });
      // Exactly one Refund row: a second delivery must not create a phantom refund.
      expect(prisma.refund.create).toHaveBeenCalledTimes(1);
    });

    it('schedules dunning with a stable job id so a redelivered failure cannot advance the ladder twice', async () => {
      const { service, prisma, queues } = buildHarness();
      (prisma.payment.findUnique as jest.Mock).mockResolvedValue({
        id: 'pay-1',
        providerPaymentId: 'pay_fail',
        status: 'SUCCEEDED',
        invoiceId: 'inv-1',
        invoice: { id: 'inv-1', subscriptionId: 'sub-1', totalMinor: 10_000 },
      });

      const event = {
        type: 'payment_failed' as const,
        providerPaymentId: 'pay_fail',
        occurredAt: new Date(),
      };
      await service.handlePaymentEvent(event);
      await service.handlePaymentEvent(event);

      const calls = (queues.addDelayed as jest.Mock).mock.calls;
      expect(calls).toHaveLength(2);
      const jobId = (calls[0][4] as { jobId: string }).jobId;
      expect(jobId).toBe('dunning-schedule:inv-1');
      // Same id both times: BullMQ collapses the duplicate while the first is queued.
      expect((calls[1][4] as { jobId: string }).jobId).toBe(jobId);
    });
  });

  describe('refunds', () => {
    it('refuses a refund larger than the payment', async () => {
      const { service, prisma } = buildHarness();
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'pay-1',
        amountMinor: 10_000,
        status: 'SUCCEEDED',
        invoiceId: 'inv-1',
        refunds: [],
      });

      await expect(
        service.refund({
          paymentId: 'pay-1',
          amountMinor: 20_000,
          reason: 'over-refund',
          actorId: 'a1',
        }),
      ).rejects.toThrow(/between 1 and 10000/);
    });

    it('refuses to refund a payment that never succeeded', async () => {
      const { service, prisma } = buildHarness();
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'pay-1',
        amountMinor: 10_000,
        status: 'PENDING',
        invoiceId: 'inv-1',
        refunds: [],
      });

      await expect(
        service.refund({ paymentId: 'pay-1', amountMinor: 100, reason: 'x', actorId: 'a1' }),
      ).rejects.toThrow(/succeeded payment/i);
    });

    it('refuses to refund the same money twice', async () => {
      const { service, prisma } = buildHarness();
      (prisma.payment.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'pay-1',
        amountMinor: 10_000,
        status: 'SUCCEEDED',
        invoiceId: 'inv-1',
        refunds: [{ amountMinor: 9_000 }],
      });

      // Only 1,000 minor units remain refundable, so asking for 1,500 would overdraw
      // the payment across two refunds.
      await expect(
        service.refund({ paymentId: 'pay-1', amountMinor: 1_500, reason: 'double', actorId: 'a1' }),
      ).rejects.toThrow(/between 1 and 1000/);
    });
  });

  describe('subscription lifecycle', () => {
    it('defaults cancellation to the end of the paid period', async () => {
      const { service, state } = buildHarness();

      const updated = await service.cancel('sub-1', true, 'actor-1');

      expect(updated.cancelAtPeriodEnd).toBe(true);
      expect(state.providerCalls).toContain('cancel');
    });

    it('rejects cancelling an already cancelled subscription', async () => {
      const { service, prisma } = buildHarness();
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sub-1',
        status: 'CANCELLED',
      });

      await expect(service.cancel('sub-1', true, 'actor-1')).rejects.toThrow(/already cancelled/i);
    });

    it('caps a pause at the documented maximum', async () => {
      const { service } = buildHarness();

      await expect(service.pause('sub-1', 31, 'actor-1')).rejects.toThrow(/between 1 and 30/i);
      await expect(service.pause('sub-1', 0, 'actor-1')).rejects.toThrow(/between 1 and 30/i);
    });

    it('refuses to resume a subscription that is not paused', async () => {
      const { service, prisma } = buildHarness();
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 'sub-1',
        status: 'ACTIVE',
      });

      await expect(service.resume('sub-1', 'actor-1')).rejects.toThrow(/not paused/i);
    });
  });

  describe('dunning', () => {
    it('uses the documented retry ladder and stops at its end', () => {
      expect(DUNNING_RETRY_DAYS).toEqual([1, 3, 7]);
      // After three attempts there is no fourth: an unbounded retry schedule on a
      // family who has declined three charges is harassment, not revenue recovery.
      expect(DUNNING_RETRY_DAYS).toHaveLength(3);
    });
  });
});
