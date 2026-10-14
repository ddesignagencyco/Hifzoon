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

    it('rejects a body that was not captured raw, because a signature cannot be checked', async () => {
      const { service } = buildHarness();
      await expect(service.payments(undefined, 'sig')).rejects.toThrow(/raw payment webhook body/i);
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

    it('refuses when the deployment still runs the fake video adapter', async () => {
      const { service } = buildHarness({ videoName: 'fake' });
      await expect(service.video(Buffer.from('raw'), 'auth')).rejects.toThrow(
        /requires a configured video provider/i,
      );
    });
  });
});
