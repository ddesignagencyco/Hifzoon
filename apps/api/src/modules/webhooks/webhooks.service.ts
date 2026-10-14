import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  PAYMENT_PROVIDER,
  VIDEO_PROVIDER,
  type PaymentProvider,
  type VideoProvider,
  type VideoWebhookEvent,
} from '../../integrations/providers';
import { assertProviderSelected } from '../../integrations/provider-selection';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { BillingService } from '../billing/billing.service';

/**
 * Inbound provider webhooks (TRD section 5.1; FR-BIL-04, FR-CLS-12).
 *
 * These routes are `@Public()` because a provider has no session — the *signature* is
 * the authentication, verified by the adapter's `parseWebhook` against the exact bytes
 * received (the raw-body capture in `main.ts` exists for precisely this). Everything
 * here is deliberately idempotent, because providers retry: a payment applies through
 * `BillingService.handlePaymentEvent` (unique on `providerPaymentId`) and a recording
 * change goes through the worker's monotonic `handle-recording-webhook` job rather than
 * mutating state inline.
 *
 * On a deployment still running a fake adapter the route returns 501 rather than
 * pretending to accept an event it cannot verify (STATUS §2.8 — fail loudly).
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly queues: QueueService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentsProvider: PaymentProvider,
    @Inject(VIDEO_PROVIDER) private readonly videoProvider: VideoProvider,
  ) {}

  /** Payment provider event → invoice/payment state (FR-BIL-04). */
  async payments(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: boolean; applied: boolean; reason?: string }> {
    const body = this.requireRawBody(rawBody, 'payment');
    assertProviderSelected(this.paymentsProvider.name, 'payment', [
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ]);

    const event = this.paymentsProvider.parseWebhook(body, signature);
    const result = await this.billing.handlePaymentEvent({
      type: event.type,
      providerPaymentId: event.providerPaymentId,
      providerSubscriptionId: event.providerSubscriptionId,
      invoiceNumber: event.invoiceNumber,
      amountMinor: event.amountMinor,
      occurredAt: event.occurredAt,
    });

    this.logger.log(
      `Payment webhook ${event.type} (${event.eventId}): applied=${result.applied}` +
        (result.reason ? ` (${result.reason})` : ''),
    );

    return { received: true, applied: result.applied, reason: result.reason };
  }

  /** Video provider event → recording lifecycle (FR-CLS-12). */
  async video(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: boolean; ignored?: string; recordingId?: string; status?: string }> {
    const body = this.requireRawBody(rawBody, 'video');
    assertProviderSelected(this.videoProvider.name, 'video', [
      'LIVEKIT_URL',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
    ]);

    const event = this.videoProvider.parseWebhook(body, signature);
    const status = recordingStatusFor(event.type);

    // Participant join/leave is presence, owned by the socket gateway, not the recording
    // row. Acknowledge so the provider stops retrying; do not touch recording state.
    if (!status) return { received: true, ignored: event.type };

    const recording = await this.resolveRecording(event);
    if (!recording) {
      this.logger.warn(
        `Video webhook ${event.type} (${event.eventId}) has no matching recording ` +
          `(room ${event.roomId}${event.egressId ? `, egress ${event.egressId}` : ''})`,
      );
      // Unknown recording is acknowledged, not failed: a retry would never resolve it,
      // and the reconcile-recordings job is what repairs genuine drift.
      return { received: true, ignored: 'no matching recording' };
    }

    await this.queues.add(QUEUE.CLASSROOM, 'handle-recording-webhook', {
      recordingId: recording.id,
      classId: recording.classId,
      status,
      storageKey: event.recordingKey,
      durationSeconds: event.durationSeconds,
    });

    return { received: true, recordingId: recording.id, status };
  }

  /**
   * Finds the local recording a video event belongs to, by egress id first (exact) and
   * then by the room the class session was opened with (a `started` event may arrive
   * before the egress id is known to us).
   */
  private async resolveRecording(
    event: VideoWebhookEvent,
  ): Promise<{ id: string; classId: string } | null> {
    if (event.egressId) {
      const byEgress = await this.prisma.recording.findFirst({
        where: { providerEgressId: event.egressId },
        select: { id: true, classId: true },
      });
      if (byEgress) return byEgress;
    }

    if (event.roomId) {
      const session = await this.prisma.classSession.findFirst({
        where: { roomId: event.roomId },
        select: { id: true },
      });
      if (session) {
        return this.prisma.recording.findUnique({
          where: { classId: session.id },
          select: { id: true, classId: true },
        });
      }
    }

    return null;
  }

  private requireRawBody(rawBody: Buffer | undefined, kind: string): Buffer {
    if (!rawBody || rawBody.length === 0) {
      throw AppError.badRequest(
        `A raw ${kind} webhook body is required for signature verification`,
      );
    }
    return rawBody;
  }
}

/** Provider event → the monotonic status the classroom worker understands. */
function recordingStatusFor(
  type: VideoWebhookEvent['type'],
): 'RECORDING' | 'READY' | 'FAILED' | null {
  switch (type) {
    case 'egress_started':
      return 'RECORDING';
    case 'egress_ended':
      return 'READY';
    case 'egress_failed':
      return 'FAILED';
    default:
      return null;
  }
}
