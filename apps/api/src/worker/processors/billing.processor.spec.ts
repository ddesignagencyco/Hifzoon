import { BillingProcessor } from './billing.processor';

/**
 * A redelivered `payment_failed` webhook enqueues `schedule-retries` a second time. If
 * the processor blindly added another rung, a duplicate delivery would walk the family
 * down the dunning ladder faster and cancel them early. These tests pin the guard that
 * makes the job idempotent (FR-BIL-05).
 */
function buildProcessor(invoice: Record<string, unknown> | null) {
  const prisma = {
    invoice: {
      findUnique: jest.fn(async () => invoice),
    },
    payment: {
      upsert: jest.fn(async () => ({})),
    },
    subscription: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const notifications = { enqueue: jest.fn(async () => ({})) };
  // `billing.dunning_retry_days` is a *count* of ladder rungs; 3 walks the whole
  // [1, 3, 7] ladder, which is what every other test here assumes.
  const settings = { getNumber: jest.fn(async () => 3) };
  const payments = { name: 'fake-payments' };
  const processor = new BillingProcessor(
    prisma as never,
    notifications as never,
    settings as never,
    payments as never,
    { reconcileAll: jest.fn(async () => ({ checked: 0, failed: 0 })) } as never,
  );
  return { processor, prisma, notifications, settings, payments };
}

function schedule(processor: BillingProcessor, invoiceId = 'inv-1') {
  return processor.handle({ name: 'schedule-retries', data: { invoiceId } } as never);
}

const future = new Date(Date.now() + 86_400_000);

describe('BillingProcessor.scheduleRetries', () => {
  it('skips when a future retry is already scheduled (replay-safe)', async () => {
    const { processor, prisma } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      payments: [{ attempt: 1, status: 'PENDING', nextRetryAt: future }],
    });

    const result = await schedule(processor);

    expect(result).toEqual({ skipped: 'retry already scheduled' });
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('schedules the next rung via a deterministic, upsertable id', async () => {
    const { processor, prisma } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      payments: [{ attempt: 1, status: 'FAILED', nextRetryAt: null }],
    });

    const result = await schedule(processor);

    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerPaymentId: 'dunning_inv-1_2' } }),
    );
    expect(result).toMatchObject({ attempt: 2 });
  });

  it('cancels and notifies once the ladder is exhausted', async () => {
    const { processor, prisma, notifications } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      family: { members: [{ user: { id: 'user-1' } }] },
      payments: [
        { attempt: 1, status: 'FAILED', nextRetryAt: null },
        { attempt: 2, status: 'FAILED', nextRetryAt: null },
        { attempt: 3, status: 'FAILED', nextRetryAt: null },
      ],
    });

    const result = await schedule(processor);

    expect(result).toMatchObject({ retriesExhausted: true, attempts: 3 });
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).toHaveBeenCalled();
    expect(notifications.enqueue).toHaveBeenCalled();
  });

  it('skips an invoice that is already paid', async () => {
    const { processor, prisma } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'PAID',
      totalMinor: 10_000,
      subscription: null,
      payments: [],
    });

    const result = await schedule(processor);

    expect(result).toEqual({ skipped: 'invoice is PAID' });
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('records the provider of the selected adapter, not a hardcoded STRIPE', async () => {
    const { processor, prisma, payments } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      payments: [{ attempt: 1, status: 'FAILED', nextRetryAt: null }],
    });
    payments.name = 'paypal-live';

    await schedule(processor);

    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ provider: 'PAYPAL' }) }),
    );
  });

  it('shortens the ladder when billing.dunning_retry_days is lowered', async () => {
    const { processor, prisma, settings } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      payments: [
        { attempt: 1, status: 'FAILED', nextRetryAt: null },
        { attempt: 2, status: 'FAILED', nextRetryAt: null },
      ],
    });
    settings.getNumber.mockResolvedValue(2);

    const result = await schedule(processor);

    expect(result).toMatchObject({ retriesExhausted: true, attempts: 2 });
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('cancels immediately when the ladder is configured to zero rungs', async () => {
    const { processor, prisma, settings } = buildProcessor({
      id: 'inv-1',
      number: 'INV-1',
      status: 'FAILED',
      totalMinor: 10_000,
      subscription: { id: 'sub-1', status: 'PAST_DUE' },
      payments: [],
    });
    settings.getNumber.mockResolvedValue(0);

    const result = await schedule(processor);

    expect(result).toMatchObject({ retriesExhausted: true });
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).toHaveBeenCalled();
  });
});
