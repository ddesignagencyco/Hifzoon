import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationChannel } from '@hifzoon/shared';
import { QUEUE } from '../../queue/queue.constants';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import type { JobProcessor } from './processor.interface';

/**
 * Notification delivery and hygiene (FR-NTF-01..05).
 *
 * `NotificationsService.enqueue` writes a row per recipient and *deliberately does not
 * send*: the queue is the only thing that talks to a provider. That separation is what
 * makes quiet hours, per-channel preferences and retries enforceable in one place
 * instead of at every call site.
 *
 * The two jobs that exist to keep the notification centre honest:
 *
 *   - `sweep-stale` marks notifications older than 90 days as expired. A notification
 *     centre that grows without bound and still shows a two-year-old "your class starts
 *     tomorrow" is actively misleading.
 *   - `reconcile` flips anything stuck in PENDING for more than 15 minutes to FAILED.
 *     Without it a provider outage looks exactly like a quiet, healthy system, because
 *     nothing ever failed.
 */
@Injectable()
export class NotificationProcessor implements JobProcessor {
  readonly queue = QUEUE.NOTIFICATION;
  readonly concurrency = 8;

  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async handle(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'deliver':
        return this.deliver(job.data);
      // These three are enqueued directly by AuthService and ConsentService rather than
      // through `NotificationsService.enqueue`, because a family who has switched off
      // marketing or set quiet hours must still receive a password reset and an account
      // lock notice. They arrive with an empty `notificationId` and the content inline.
      case 'password-reset':
      case 'account-locked':
      case 'guardian-verification':
        return this.deliverInline(job.data);
      case 'sweep-stale':
        return this.sweepStale();
      case 'reconcile':
        return this.reconcileStuck();
      case 'requeue-retryable':
        return this.requeueRetryable();
      default:
        this.logger.warn(`Unknown notification job "${job.name}" — ignoring`);
        return { skipped: job.name };
    }
  }

  /**
   * Delivers a security notification that was enqueued with its content inline.
   *
   * A `Notification` row is still written first, so every send the platform makes is
   * auditable and countable. The row is created regardless of the recipient's channel
   * preferences — these are transactional and security notices, and a family who opted
   * out of marketing must not be silently unable to reset their password.
   */
  private async deliverInline(data: {
    userId?: string;
    template?: string;
    locale?: string;
    channel?: string;
    data?: Record<string, never>;
  }) {
    if (!data?.userId || !data.template) return { skipped: 'missing userId or template' };

    const locale = data.locale ?? (await this.localeFor(data.userId));
    const channel = (data.channel ?? 'EMAIL') as never;

    const row = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.template,
        channel,
        payload: (data.data ?? {}) as never,
        status: 'QUEUED',
        scheduledFor: new Date(),
      },
      select: { id: true },
    });

    return this.notifications.deliver({
      notificationId: row.id,
      userId: data.userId,
      template: data.template as never,
      locale,
      // `channel` is already narrowed to the shared enum by the cast above.
      channel,
      data: data.data ?? {},
    });
  }

  private async deliver(data: { notificationId?: string }) {
    if (!data?.notificationId) return { skipped: 'no notificationId' };

    const row = await this.prisma.notification.findUnique({
      where: { id: data.notificationId },
      select: {
        id: true,
        userId: true,
        type: true,
        channel: true,
        payload: true,
        status: true,
        scheduledFor: true,
      },
    });

    if (!row) return { skipped: 'notification not found' };
    if (row.status === 'SENT' || row.status === 'FAILED' || row.status === 'SKIPPED') {
      // Delivery is at-most-once on purpose. Re-sending an email a family already
      // received because a retry fired late is worse than a rare missed one.
      return { skipped: `already ${row.status}` };
    }

    // A quiet-hours deferral re-queues the same row with a future `scheduledFor`. The
    // job must stand down and let the delay expire, otherwise it would send the
    // notification during the quiet hours it was explicitly deferred away from.
    if (row.scheduledFor && row.scheduledFor.getTime() > Date.now()) {
      return { deferred: true, until: row.scheduledFor.toISOString() };
    }

    const locale = await this.localeFor(row.userId);
    return this.notifications.deliver({
      notificationId: row.id,
      userId: row.userId,
      template: row.type as never,
      locale,
      // The row stores the Prisma enum and `deliver` takes the shared one. They are the
      // same values with the same names, so this narrows rather than reshapes.
      channel: row.channel as unknown as NotificationChannel,
      data: (row.payload ?? {}) as never,
    });
  }

  private async localeFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { language: true, notificationPreferences: { select: { language: true } } },
    });
    return user?.notificationPreferences?.language ?? user?.language ?? 'en';
  }

  /**
   * FR-NTF-05 — the centre is a recent window, not an archive.
   *
   * Old rows are deleted rather than flagged, because `notification_status` has no
   * EXPIRED member and inventing one would mean a migration for a cosmetic state.
   */
  private async sweepStale() {
    const cutoff = new Date(Date.now() - 90 * 86_400_000);
    const result = await this.prisma.notification.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { in: ['SENT', 'SKIPPED'] } },
    });

    if (result.count > 0) {
      this.logger.log(`Notifications: swept ${result.count} notification(s) older than 90 days`);
    }
    return { swept: result.count };
  }

  /** Turns a silent provider outage into a visible failure. */
  private async reconcileStuck() {
    const cutoff = new Date(Date.now() - 15 * 60_000);
    const stuck = await this.prisma.notification.findMany({
      where: { status: 'QUEUED', createdAt: { lt: cutoff } },
      select: { id: true },
      take: 1_000,
    });

    if (stuck.length === 0) return { failed: 0 };

    await this.prisma.notification.updateMany({
      where: { id: { in: stuck.map((s) => s.id) } },
      data: { status: 'FAILED', failureReason: 'Delivery did not complete within 15 minutes' },
    });

    this.logger.error(
      `Notifications: ${stuck.length} notification(s) stuck QUEUED and were failed`,
    );
    return { failed: stuck.length };
  }

  /** Re-queues failures worth one more attempt, such as a transient SMTP error. */
  private async requeueRetryable() {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const retryable = await this.prisma.notification.findMany({
      where: {
        status: 'FAILED',
        createdAt: { lt: cutoff },
        failureReason: { contains: 'timeout' },
      },
      select: { id: true },
      take: 200,
    });

    if (retryable.length === 0) return { requeued: 0 };

    await this.prisma.notification.updateMany({
      where: { id: { in: retryable.map((n) => n.id) } },
      data: { status: 'QUEUED', failureReason: null },
    });

    this.logger.log(`Notifications: re-queued ${retryable.length} transient failure(s)`);
    return { requeued: retryable.length };
  }
}
