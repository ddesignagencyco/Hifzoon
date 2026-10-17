import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, UserStatus } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { MAILER, MESSENGER, Mailer, Messenger } from '../../integrations/providers';

/** Template keys, kept in one place so FE, worker and tests agree. */
export const TEMPLATE = {
  CLASS_REMINDER_DAY_BEFORE: 'class.reminder.day-before',
  CLASS_REMINDER_15_MIN: 'class.reminder.15-min',
  CLASS_CANCELLED: 'class.cancelled',
  CLASS_RESCHEDULED: 'class.rescheduled',
  LESSON_CARD_READY: 'lesson-card.ready',
  TRIAL_BOOKED: 'trial.booked',
  REPORT_CARD_READY: 'report-card.ready',
  MISSED_CLASS: 'class.missed',
  TEACHER_CHANGE: 'class.teacher-change',
  PAYMENT_FAILED: 'billing.payment-failed',
  SAFEGUARDING_ALERT: 'case.safeguarding-alert',
  PASSWORD_RESET: 'auth.password-reset',
  ACCOUNT_LOCKED: 'auth.account-locked',
  GUARDIAN_VERIFICATION: 'consent.guardian-verification',
  DATA_REQUEST: 'consent.data-request',
} as const;

export type TemplateKey = (typeof TEMPLATE)[keyof typeof TEMPLATE];

/**
 * Values interpolated into a template. Narrow on purpose: an object ending up in an
 * email body is a bug, and 
estrict-template-expressions catches it at lint time.
 */
export type TemplateData = Record<string, string | number | boolean | null | undefined>;

interface LocaleStrings {
  subject: (data: TemplateData) => string;
  body: (data: TemplateData) => string;
}

/**
 * Minimal locale-aware copy. Kept in code rather than in the database so a missing
 * translation is a deploy-time error instead of a blank email at 3am — and so the
 * Urdu and Arabic text can be reviewed by a native speaker in one PR (NFR-L10N-01).
 */
const STRINGS: Record<string, Partial<Record<TemplateKey, LocaleStrings>>> = {
  en: {
    [TEMPLATE.CLASS_REMINDER_DAY_BEFORE]: {
      subject: (d) => `Class tomorrow: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} is teaching ${d.studentName} tomorrow at ${d.localTime} (${d.timeZone}). ` +
        `Join: ${d.joinUrl}`,
    },
    [TEMPLATE.CLASS_REMINDER_15_MIN]: {
      subject: (d) => `Class in 15 minutes: ${d.studentName}`,
      body: (d) => `Your class with ${d.teacherName} starts at ${d.localTime}. Join: ${d.joinUrl}`,
    },
    [TEMPLATE.LESSON_CARD_READY]: {
      subject: (d) => `Lesson card for ${d.studentName} is ready`,
      body: (d) =>
        `${d.teacherName} has shared the lesson card from today's class. Today's homework: ${d.homework ?? 'none set'}`,
    },
    [TEMPLATE.CLASS_CANCELLED]: {
      subject: (d) => `Class cancelled: ${d.studentName}`,
      body: (d) =>
        `The class on ${d.localDate} has been cancelled by ${d.cancelledBy}. ` +
        `A make-up credit has been added to your account.`,
    },
    [TEMPLATE.PAYMENT_FAILED]: {
      subject: (d) => `Payment failed for ${d.invoiceNumber}`,
      body: (d) =>
        `We could not take the payment for ${d.invoiceNumber}. We will retry on ${d.nextRetryDate}. ` +
        `Please update your payment method to avoid the class being paused.`,
    },
    [TEMPLATE.SAFEGUARDING_ALERT]: {
      subject: (d) => `Safeguarding report received (${d.caseReference})`,
      body: (d) =>
        `A safeguarding report was raised in a class. Reference ${d.caseReference}. ` +
        `Please open the case record and acknowledge within 15 minutes.`,
    },
    [TEMPLATE.GUARDIAN_VERIFICATION]: {
      subject: () => 'Confirm a guardian for your family',
      body: (d) =>
        `${d.requesterName} asked to join your family as a guardian. ` +
        `If you recognise them, confirm this code: ${d.code}. If not, ignore this message and contact support.`,
    },
    [TEMPLATE.PASSWORD_RESET]: {
      subject: () => 'Reset your Hifzoon password',
      body: (d) =>
        `Use this link within ${d.ttlMinutes} minutes to choose a new password: ${d.resetUrl ?? ''}`,
      // Plain URL, not markup: the delivery path escapes the body before wrapping it in
      // HTML, so an <a> here would arrive as literal text. This template used to
      // interpolate `d.code`, which a reset never sets, so the email arrived with an empty
      // code and no way in (B20).
    },
  },

  ur: {
    [TEMPLATE.CLASS_REMINDER_DAY_BEFORE]: {
      subject: (d) => `کل کلاس: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} کل ${d.localTime} (${d.timeZone}) پر ${d.studentName} کو پڑھائیں گے۔ شامل ہوں: ${d.joinUrl}`,
    },
    [TEMPLATE.CLASS_REMINDER_15_MIN]: {
      subject: (d) => `15 منٹ میں کلاس: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} کے ساتھ کلاس ${d.localTime} پر شروع ہوگی۔ شامل ہوں: ${d.joinUrl}`,
    },
    [TEMPLATE.LESSON_CARD_READY]: {
      subject: (d) => `${d.studentName} کا سبق کارڈ تیار ہے`,
      body: (d) =>
        `${d.teacherName} نے آج کے کلاس کا سبق کارڈ بھیجا ہے۔ ہوم ورک: ${d.homework ?? 'کوئی نہیں'}`,
    },
  },
};

/**
 * Notifications (NTF-BE-01, NTF-BE-02, FR-NTF-01, FR-NTF-04).
 *
 * Sending is always asynchronous through the queue, never inline in the request that
 * triggered it: a slow SMTP provider must not add latency to a lesson-card submit, and
 * a failed email must be retried without the teacher's work being lost.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(MESSENGER) private readonly messenger: Messenger,
  ) {}

  /** Resolves copy for a template + locale, falling back to English. */
  resolve(template: TemplateKey, locale: string, data: TemplateData) {
    const strings = STRINGS[locale]?.[template] ?? STRINGS.en[template];
    if (!strings) {
      this.logger.warn(
        `No copy for template "${template}" in "${locale}"; falling back to a generic message`,
      );
      return {
        subject: 'Hifzoon update',
        body: JSON.stringify(data),
        fallback: true,
      };
    }
    return { subject: strings.subject(data), body: strings.body(data), fallback: false };
  }

  /**
   * Creates a notification row and queues delivery.
   *
   * The row exists before the send so a delivery failure is visible in the parent
   * portal rather than silently lost, and so `FR-OPS-06` can show what was promised.
   */
  async enqueue(input: {
    userIds: string[];
    template: TemplateKey;
    data: TemplateData;
    channel?: NotificationChannel;
    scheduledFor?: Date;
  }): Promise<{ queued: number }> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: input.userIds }, status: UserStatus.ACTIVE, deletedAt: null },
      select: {
        id: true,
        language: true,
        notificationPreferences: {
          select: {
            email: true,
            whatsapp: true,
            push: true,
            quietFrom: true,
            quietTo: true,
            language: true,
          },
        },
      },
    });

    let queued = 0;
    for (const user of users) {
      const preferences = user.notificationPreferences;
      const locale = preferences?.language ?? user.language;

      // FR-NTF-04 — honour quiet hours unless the message is safety-critical.
      //
      // `isWithinQuietHours` is true *inside* the quiet window (and false for
      // safety-critical templates, which must always go out). This used to test its
      // negation, so every notification was recorded SKIPPED and none was ever queued —
      // safeguarding alerts included (B23).
      if (
        isWithinQuietHours(
          input.template,
          preferences ?? undefined,
          input.scheduledFor ?? new Date(),
        )
      ) {
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: input.template,
            channel: input.channel ?? NotificationChannel.EMAIL,
            payload: { ...input.data },
            status: NotificationStatus.SKIPPED,
            failureReason: 'Within quiet hours',
          },
        });
        continue;
      }

      const copy = this.resolve(input.template, locale, input.data);

      const notification = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: input.template,
          channel: input.channel ?? NotificationChannel.EMAIL,
          payload: { ...input.data, subject: copy.subject, body: copy.body } as never,
          status: NotificationStatus.QUEUED,
          scheduledFor: input.scheduledFor ?? new Date(),
        },
      });

      await this.queues.add(QUEUE.NOTIFICATION, 'deliver', {
        notificationId: notification.id,
        userId: user.id,
        template: input.template,
        locale,
        channel: input.channel ?? NotificationChannel.EMAIL,
        data: input.data,
      });
      queued += 1;
    }

    return { queued };
  }

  /**
   * Delivers one notification. Called by the worker, and directly from tests so the
   * delivery path is covered without a live SMTP server.
   */
  async deliver(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    return input.channel === NotificationChannel.WHATSAPP
      ? this.deliverWhatsapp(input)
      : this.deliverEmail(input);
  }

  /**
   * Email delivery.
   *
   * The row exists before the send, so a delivery failure is visible in the parent
   * portal rather than silently lost, and so `FR-OPS-06` can show what was promised.
   */
  private async deliverEmail(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      await this.markFailed(input.notificationId, 'No email address on file');
      return { delivered: false };
    }

    const copy = this.resolve(input.template, input.locale, input.data);

    try {
      const result = await this.mailer.send({
        to: user.email,
        subject: copy.subject,
        html: `<p>${escapeHtml(copy.body).replace(/\n/g, '<br />')}</p>`,
        text: copy.body,
        // CR-07 — never expose a personal address in the reply path.
        replyTo: undefined,
        idempotencyKey: input.notificationId,
      });

      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      return { delivered: result.accepted };
    } catch (error) {
      await this.markFailed(input.notificationId, (error as Error).message);
      throw error;
    }
  }

  /**
   * WhatsApp delivery (FR-NTF-03, IR-SW-05).
   *
   * Three refusals happen *before* the provider is called, and each is a case where
   * sending would be wrong rather than merely unhelpful:
   *
   *   - **no phone on file** — nothing to send to;
   *   - **the family has not opted in** — `notificationPreference.whatsapp` defaults to
   *     `false`, and WhatsApp policy requires consent for business-initiated messages.
   *     This is the guard that stops the platform messaging families about children
   *     without permission;
   *   - **the adapter says no** — a second, provider-level consent check.
   *
   * The provider's `messageId` is written to the row, because it is the only handle the
   * delivery webhook will ever give us back. A 200 from WhatsApp means *accepted*, not
   * delivered; the difference is only ever resolved asynchronously by
   * `/webhooks/whatsapp`, which finds the row by exactly this value.
   */
  private async deliverWhatsapp(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        phone: true,
        notificationPreferences: { select: { whatsapp: true } },
      },
    });

    if (!user?.phone) {
      await this.markFailed(input.notificationId, 'No WhatsApp number on file');
      return { delivered: false };
    }

    if (!user.notificationPreferences?.whatsapp) {
      // SKIPPED, not FAILED: nothing is wrong, the family simply did not opt in to this
      // channel. A FAILED would show up in an ops report as a broken integration.
      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: NotificationStatus.SKIPPED,
          failureReason: 'Family has not opted in to WhatsApp',
        },
      });
      return { delivered: false };
    }

    if (!(await this.messenger.canContact(user.phone))) {
      await this.markFailed(input.notificationId, 'Recipient has not consented to messages');
      return { delivered: false };
    }

    try {
      const { messageId } = await this.messenger.sendTemplate({
        to: user.phone,
        template: input.template,
        locale: input.locale,
        variables: Object.fromEntries(
          Object.entries(input.data).map(([key, value]) => [key, String(value ?? '')]),
        ),
        idempotencyKey: input.notificationId,
      });

      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: messageId,
        },
      });
      return { delivered: true };
    } catch (error) {
      await this.markFailed(input.notificationId, (error as Error).message);
      throw error;
    }
  }

  private async markFailed(notificationId: string, reason: string): Promise<void> {
    await this.prisma.notification
      .update({
        where: { id: notificationId },
        data: { status: NotificationStatus.FAILED, failureReason: reason },
      })
      .catch(() => undefined);
  }

  async listForUser(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        payload: true,
      },
    });
  }
}

/** Safety-critical messages ignore quiet hours (CR-08 is not a "sometime later"). */
const SAFETY_CRITICAL = new Set<TemplateKey>([TEMPLATE.SAFEGUARDING_ALERT]);

function isWithinQuietHours(
  template: TemplateKey,
  preferences: { quietFrom: Date | null; quietTo: Date | null } | undefined,
  at: Date,
): boolean {
  if (SAFETY_CRITICAL.has(template)) return false;
  if (!preferences?.quietFrom || !preferences.quietTo) return false;

  const minutesNow = at.getUTCHours() * 60 + at.getUTCMinutes();
  const from = preferences.quietFrom.getUTCHours() * 60 + preferences.quietFrom.getUTCMinutes();
  const to = preferences.quietTo.getUTCHours() * 60 + preferences.quietTo.getUTCMinutes();

  // Quiet hours may wrap past midnight (22:00 -> 07:00).
  return from <= to ? minutesNow >= from && minutesNow < to : minutesNow >= from || minutesNow < to;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
