import { createHmac } from 'node:crypto';

import type {
  PaymentProvider,
  VideoProvider,
  VideoWebhookEvent,
} from '../../integrations/providers';
import { QUEUE } from '../../queue/queue.constants';

import { WebhooksService } from './webhooks.service';

/**
 * Webhook routes are `@Public()`, so the only things standing between an attacker and a
 * "invoice paid" are the adapter's signature check and this service's wiring. These tests
 * pin both: a fake adapter must refuse rather than accept, and a verified event must reach
 * exactly one idempotent consumer.
 */
function buildHarness(options: { paymentName?: string; videoName?: string } = {}) {
  const prisma = {
    recording: { findFirst: jest.fn(), findUnique: jest.fn() },
    classSession: { findFirst: jest.fn() },
    processedWebhookEvent: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
    },
  };
  const billing = {
    handlePaymentEvent: jest.fn(async () => ({ applied: true, reason: 'invoice settled' })),
  };
  const queues = { add: jest.fn(async () => ({ id: 'job-1' })) };
  const payments = {
    name: options.paymentName ?? 'stripe',
    parseWebhook: jest.fn(),
  } as unknown as PaymentProvider;
  const video = {
    name: options.videoName ?? 'livekit',
    parseWebhook: jest.fn(),
  } as unknown as VideoProvider;

  const service = new WebhooksService(
    prisma as never,
    billing as never,
    queues as never,
    payments,
    video,
    // The WhatsApp adapter is only exercised by webhooks.whatsapp.spec.ts; these tests
    // are about payment and video routing.
    { name: 'whatsapp_cloud' } as never,
  );

  return { service, prisma, billing, queues, payments, video };
}

const paymentEvent = {
  eventId: 'evt_1',
  type: 'payment_succeeded' as const,
  providerPaymentId: 'pay_1',
  invoiceNumber: 'INV-2026-ABC12345',
  amountMinor: 10_000,
  occurredAt: new Date('2026-10-14T10:00:00Z'),
  raw: {},
};

describe('WebhooksService', () => {
  describe('payments', () => {
    it('refuses when the deployment still runs the fake payment adapter (501, not a fake accept)', async () => {
      const { service, payments, billing } = buildHarness({ paymentName: 'fake' });

      await expect(service.payments(Buffer.from('{}'), 'sig')).rejects.toThrow(
        /requires a configured payment provider/i,
      );
      // It must not even try to parse or apply an unverifiable body.
      expect(payments.parseWebhook).not.toHaveBeenCalled();
      expect(billing.handlePaymentEvent).not.toHaveBeenCalled();
    });

    it('parses a verified event and applies it through the billing state machine', async () => {
      const { service, payments, billing } = buildHarness();
      (payments.parseWebhook as jest.Mock).mockReturnValue(paymentEvent);

      const result = await service.payments(Buffer.from('raw'), 'sig');

      expect(payments.parseWebhook).toHaveBeenCalledWith(Buffer.from('raw'), 'sig');
      expect(billing.handlePaymentEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment_succeeded',
          providerPaymentId: 'pay_1',
          invoiceNumber: 'INV-2026-ABC12345',
          amountMinor: 10_000,
        }),
      );
      expect(result).toMatchObject({ received: true, applied: true });
    });

    it('acknowledges a redelivered event without applying it twice', async () => {
      const { service, payments, billing, prisma } = buildHarness();
      (payments.parseWebhook as jest.Mock).mockReturnValue(paymentEvent);
      (prisma.processedWebhookEvent.findUnique as jest.Mock).mockResolvedValueOnce({ id: 'seen' });

      const result = await service.payments(Buffer.from('raw'), 'sig');

      expect(billing.handlePaymentEvent).not.toHaveBeenCalled();
      expect(result).toMatchObject({ received: true, applied: false, reason: 'already processed' });
    });

    it('records an event only after it was applied, so a failure is retried', async () => {
      const { service, payments, billing, prisma } = buildHarness();
      (payments.parseWebhook as jest.Mock).mockReturnValue(paymentEvent);
      (billing.handlePaymentEvent as jest.Mock).mockRejectedValueOnce(new Error('db down'));

      await expect(service.payments(Buffer.from('raw'), 'sig')).rejects.toThrow('db down');
      expect(prisma.processedWebhookEvent.create).not.toHaveBeenCalled();
    });

    it('rejects a body that was not captured raw, because a signature cannot be checked', async () => {
      const { service } = buildHarness();
      await expect(service.payments(undefined, 'sig')).rejects.toThrow(/raw payment webhook body/i);
    });
  });

  describe('signature verification contract', () => {
    /**
     * A provider double that verifies an HMAC over the exact bytes received, the way a
     * real Stripe/LiveKit adapter must. It is the point of these tests that the service
     * hands the adapter the *raw* body: if it re-serialised the parsed JSON, the bytes
     * would change and a genuine event's signature would no longer match.
     */
    class HmacPaymentProvider {
      readonly name = 'stripe';

      constructor(private readonly secret: string) {}

      parseWebhook(rawBody: Buffer, signature: string | undefined) {
        if (!this.secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
        if (!signature) throw new Error('missing signature header');
        const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex');
        if (signature !== expected) throw new Error('signature verification failed');
        return JSON.parse(rawBody.toString('utf8'));
      }
    }

    function harnessWith(secret: string) {
      const billing = { handlePaymentEvent: jest.fn(async () => ({ applied: true })) };
      const provider = new HmacPaymentProvider(secret) as unknown as PaymentProvider;
      const service = new WebhooksService(
        {
          processedWebhookEvent: {
            findUnique: jest.fn(async () => null),
            create: jest.fn(async () => ({})),
          },
        } as never,
        billing as never,
        { add: jest.fn() } as never,
        provider,
        {} as never,
        { name: 'whatsapp_cloud' } as never,
      );
      return { service, billing };
    }

    it('accepts an event whose signature matches the raw bytes exactly', async () => {
      const secret = 'whsec_test';
      const { service, billing } = harnessWith(secret);
      const raw = Buffer.from(JSON.stringify(paymentEvent));
      const signature = createHmac('sha256', secret).update(raw).digest('hex');

      await service.payments(raw, signature);

      expect(billing.handlePaymentEvent).toHaveBeenCalledTimes(1);
    });

    it('rejects a tampered body even when a signature header is present', async () => {
      const secret = 'whsec_test';
      const { service, billing } = harnessWith(secret);
      const raw = Buffer.from(JSON.stringify(paymentEvent));
      const signature = createHmac('sha256', secret).update(raw).digest('hex');
      const tampered = Buffer.from(JSON.stringify({ ...paymentEvent, amountMinor: 1 }));

      await expect(service.payments(tampered, signature)).rejects.toThrow(
        /signature verification failed/,
      );
      expect(billing.handlePaymentEvent).not.toHaveBeenCalled();
    });

    it('rejects a request with no signature header', async () => {
      const { service } = harnessWith('whsec_test');
      await expect(
        service.payments(Buffer.from(JSON.stringify(paymentEvent)), undefined),
      ).rejects.toThrow(/missing signature/);
    });

    it('fails closed when the webhook secret is not configured', async () => {
      const { service, billing } = harnessWith('');
      await expect(
        service.payments(Buffer.from(JSON.stringify(paymentEvent)), 'anything'),
      ).rejects.toThrow(/not configured/);
      expect(billing.handlePaymentEvent).not.toHaveBeenCalled();
    });
  });

  describe('video', () => {
    const egressEnded: VideoWebhookEvent = {
      eventId: 'vev_1',
      type: 'egress_ended',
      roomId: 'room-1',
      egressId: 'egress-1',
      recordingKey: 'recordings/class-1/class.mp4',
      durationSeconds: 1_800,
      occurredAt: new Date('2026-10-14T11:00:00Z'),
      raw: {},
    };

    it('routes a finished egress to the monotonic worker job as READY', async () => {
      const { service, video, prisma, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue(egressEnded);
      prisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', classId: 'class-1' });

      const result = await service.video(Buffer.from('raw'), 'auth');

      expect(queues.add).toHaveBeenCalledWith(
        QUEUE.CLASSROOM,
        'handle-recording-webhook',
        expect.objectContaining({ recordingId: 'rec-1', classId: 'class-1', status: 'READY' }),
      );
      expect(result).toMatchObject({ received: true, recordingId: 'rec-1', status: 'READY' });
    });

    it('falls back to the class room when the egress id is not yet known', async () => {
      const { service, video, prisma, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue({ ...egressEnded, egressId: undefined });
      prisma.recording.findFirst.mockResolvedValue(null);
      prisma.classSession.findFirst.mockResolvedValue({ id: 'class-1' });
      prisma.recording.findUnique.mockResolvedValue({ id: 'rec-1', classId: 'class-1' });

      await service.video(Buffer.from('raw'), 'auth');

      expect(prisma.classSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { roomId: 'room-1' } }),
      );
      expect(queues.add).toHaveBeenCalled();
    });

    it('acknowledges a presence event without touching recording state', async () => {
      const { service, video, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue({
        ...egressEnded,
        type: 'participant_joined',
      });

      const result = await service.video(Buffer.from('raw'), 'auth');

      expect(result).toMatchObject({ received: true, ignored: 'participant_joined' });
      expect(queues.add).not.toHaveBeenCalled();
    });

    it('acknowledges an event for an unknown recording instead of failing the retry loop', async () => {
      const { service, video, prisma, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue(egressEnded);
      prisma.recording.findFirst.mockResolvedValue(null);
      prisma.classSession.findFirst.mockResolvedValue(null);

      const result = await service.video(Buffer.from('raw'), 'auth');

      expect(result).toMatchObject({ received: true, ignored: 'no matching recording' });
      expect(queues.add).not.toHaveBeenCalled();
    });

    it('is stateless across redeliveries — the worker, not the route, dedupes', async () => {
      const { service, video, prisma, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue(egressEnded);
      prisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', classId: 'class-1' });

      const first = await service.video(Buffer.from('raw'), 'auth');
      const second = await service.video(Buffer.from('raw'), 'auth');

      // Same answer both times; the monotonic worker makes the second enqueue harmless.
      expect(first).toEqual(second);
      expect(queues.add).toHaveBeenCalledTimes(2);
    });

    it('maps a late egress_started to RECORDING and leaves the regression for the worker to drop', async () => {
      const { service, video, prisma, queues } = buildHarness();
      (video.parseWebhook as jest.Mock).mockReturnValue({ ...egressEnded, type: 'egress_started' });
      prisma.recording.findFirst.mockResolvedValue({ id: 'rec-1', classId: 'class-1' });

      const result = await service.video(Buffer.from('raw'), 'auth');

      expect(result).toMatchObject({ received: true, status: 'RECORDING' });
      expect(queues.add).toHaveBeenCalledWith(
        QUEUE.CLASSROOM,
        'handle-recording-webhook',
        expect.objectContaining({ status: 'RECORDING' }),
      );
    });

    it('refuses when the deployment still runs the fake video adapter', async () => {
      const { service } = buildHarness({ videoName: 'fake' });
      await expect(service.video(Buffer.from('raw'), 'auth')).rejects.toThrow(
        /requires a configured video provider/i,
      );
    });
  });
});
