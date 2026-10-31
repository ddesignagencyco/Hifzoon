import { Inject, Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import {
  MESSENGER,
  PAYMENT_PROVIDER,
  VIDEO_PROVIDER,
  type Messenger,
  type MessengerDeliveryEvent,
  type MessengerWebhookEvent,
  type PaymentProvider,
  type VideoProvider,
  type VideoWebhookEvent,
} from '../../integrations/providers';
import {
  UnsupportedProviderError,
  assertProviderSelected,
} from '../../integrations/provider-selection';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { BillingService } from '../billing/billing.service';
import { nextNotificationStatus } from '../notifications/delivery-status';

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
    @Inject(MESSENGER) private readonly messengerProvider: Messenger,
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
    const provider = this.paymentsProvider.name;

    // Providers redeliver (a timeout on our side is enough). An event already applied is
    // acknowledged without running again; it is recorded only after it succeeds, so a
    // failure here is retried by the provider rather than lost.
    const seen = await this.prisma.processedWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId: event.eventId } },
    });
    if (seen) return { received: true, applied: false, reason: 'already processed' };

    const result = await this.billing.handlePaymentEvent({
      type: event.type,
      providerPaymentId: event.providerPaymentId,
      providerSubscriptionId: event.providerSubscriptionId,
      invoiceNumber: event.invoiceNumber,
      amountMinor: event.amountMinor,
      occurredAt: event.occurredAt,
      reference: event.reference,
      invoice: event.invoice,
      subscription: event.subscription,
    });

    if (event.type !== 'ignored') {
      await this.prisma.processedWebhookEvent
        .create({ data: { provider, eventId: event.eventId, type: event.type } })
        .catch(() => undefined); // a concurrent delivery recorded it first; both were no-ops
    }

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

    const event = await this.videoProvider.parseWebhook(body, signature);
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

  /**
   * WhatsApp delivery receipts (FR-NTF-03, IR-SW-05).
   *
   * This closes the loop the outbound path opened: `deliverWhatsapp` recorded the
   * provider's `wamid` on the notification row, and this is where that id comes back.
   *
   * Three properties are non-negotiable here, and all three come from the fact that the
   * provider retries and reorders:
   *
   *   - **Signature first.** The HMAC is verified over the raw bytes before the body is
   *     parsed. Nothing in this method trusts a field it has not authenticated.
   *   - **Monotonic.** Status only ever moves forward (`delivery-status.ts`). A
   *     redelivered `sent` must not walk a READ message backwards.
   *   - **Unknown ids are acknowledged, not failed.** A receipt for a message this
   *     deployment never sent is not an error; returning non-2xx would make Meta retry
   *     it forever.
   */
  async whatsapp(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Promise<{ received: boolean; applied: number; ignored: number; failures: number }> {
    const body = this.requireRawBody(rawBody, 'whatsapp');
    assertProviderSelected(this.messengerProvider.name, 'messenger', [
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_APP_SECRET',
    ]);

    const parse = (this.messengerProvider as Partial<MessengerWebhookEvent>).parseDeliveryWebhook;
    if (typeof parse !== 'function') {
      throw new UnsupportedProviderError('WhatsApp delivery receipts', 'messenger', [
        'WHATSAPP_APP_SECRET',
      ]);
    }

    const events = parse.call(this.messengerProvider, body, signature);

    let applied = 0;
    let ignored = 0;
    let failures = 0;

    for (const event of events) {
      const outcome = await this.reconcileDelivery(event);
      if (outcome === 'applied') applied += 1;
      else if (outcome === 'failed') failures += 1;
      else ignored += 1;
    }

    this.logger.log(
      `WhatsApp delivery receipts: ${applied} applied, ${ignored} ignored, ${failures} failed`,
    );
    return { received: true, applied, ignored, failures };
  }

  /**
   * Applies one receipt to its notification row.
   *
   * `deleted` is treated as a no-op rather than a failure: the recipient removed the
   * message from their chat *after* it was delivered, which is a privacy action, not a
   * delivery failure. Reporting it as FAILED would put a permanent red mark on a message
   * that genuinely arrived.
   */
  private async reconcileDelivery(
    event: MessengerDeliveryEvent,
  ): Promise<'applied' | 'ignored' | 'failed' | 'deleted'> {
    const notification = await this.prisma.notification.findFirst({
      where: { providerMessageId: event.messageId },
      select: { id: true, status: true, userId: true },
    });

    if (!notification) {
      // A message this deployment did not send — another business on the same WABA, or a
      // row we have already purged. Acknowledged so Meta stops retrying.
      this.logger.warn(`WhatsApp receipt ${event.status} for unknown message ${event.messageId}`);
      return 'ignored';
    }

    if (event.errorCode) {
      this.logger.warn(
        `WhatsApp message ${event.messageId} reported ${event.status} (code ${event.errorCode})`,
      );
    }

    // `next` is a plain string from the shared ladder; Prisma's generated enum has the
    // same members but is a distinct type, and the cast is the boundary between the two
    // rather than a lie about either one.
    const next = nextNotificationStatus(
      notification.status,
      event.status,
    ) as $Enums.NotificationStatus | null;

    if (!next) {
      // Duplicate, or a receipt that overtook one already applied.
      return event.status === 'FAILED' ? 'failed' : 'ignored';
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: next,
        ...(next === 'FAILED'
          ? { failureReason: `WhatsApp reported ${event.status}: ${event.errorCode ?? 'unknown'}` }
          : {}),
      },
    });

    if (next === 'FAILED') return 'failed';
    return 'applied';
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
