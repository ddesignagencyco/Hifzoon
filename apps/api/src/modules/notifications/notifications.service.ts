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
  /** Recurring billing (FR-NTF-02): the plan started, a renewal failed, it changed or ended. */
  BILLING_SUBSCRIBED: 'billing.subscribed',
  BILLING_RENEWAL_FAILED: 'billing.renewal-failed',
  BILLING_PLAN_CHANGED: 'billing.plan-changed',
  BILLING_PLAN_ENDING: 'billing.plan-ending',
  BILLING_PLAN_ENDED: 'billing.plan-ended',
  /** The plan's classes a week changed: the family picks new weekly times. */
  BILLING_TIMES_NEEDED: 'billing.times-needed',
  SAFEGUARDING_ALERT: 'case.safeguarding-alert',
  PASSWORD_RESET: 'auth.password-reset',
  ACCOUNT_LOCKED: 'auth.account-locked',
  PASSWORD_CHANGED: 'auth.password-changed',
  GUARDIAN_VERIFICATION: 'consent.guardian-verification',
  /** M40 - a family or teacher has an unread message waiting. */
  NEW_MESSAGE: 'message.new',
  DATA_REQUEST: 'consent.data-request',
  /** M57 - a teacher staged a profile change for approval. */
  PROFILE_CHANGE_SUBMITTED: 'teacher.profile-change.submitted',
  /** M57 - an admin approved or rejected a teacher's staged change. */
  PROFILE_CHANGE_REVIEWED: 'teacher.profile-change.reviewed',
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

/** Template fields that have a built-in fallback in the copy, so absence is not an error. */
const OPTIONAL_TEMPLATE_FIELDS = new Set(['homework', 'resetUrl', 'reason']);

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
    [TEMPLATE.PASSWORD_CHANGED]: {
      subject: () => 'Your Hifzoon password was changed',
      body: () =>
        'The password on your Hifzoon account was just changed and other devices were signed out. ' +
        'If this was not you, reset your password straight away and contact support.',
    },
    [TEMPLATE.PROFILE_CHANGE_SUBMITTED]: {
      subject: (d) => `Profile change to review: ${d.teacherName}`,
      body: (d) =>
        `${d.teacherName} submitted changes to their public profile (${d.fields}) for approval. ` +
        `Open Admin → Teachers → Profile changes to review them.`,
    },
    [TEMPLATE.PROFILE_CHANGE_REVIEWED]: {
      subject: (d) => `Your profile changes were ${d.outcome}`,
      body: (d) =>
        d.outcome === 'approved'
          ? 'The changes you submitted to your public profile were approved and are now live.'
          : `The changes you submitted to your public profile were not approved. ${d.reason ?? ''}`.trim(),
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
    [TEMPLATE.BILLING_SUBSCRIBED]: {
      subject: (d) => `Welcome to ${d.planName}`,
      body: (d) =>
        `Your card is saved and ${d.planName} has started. Weekly classes: ${d.schedule}. ` +
        `It renews automatically on ${d.renewsOn}; manage it any time: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_RENEWAL_FAILED]: {
      subject: (d) => `We couldn't take the payment for ${d.planName}`,
      body: (d) =>
        `The payment of ${d.amount} for ${d.planName} did not go through. Classes continue while we ` +
        `try your card again. Please pay or update your card here: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_CHANGED]: {
      subject: (d) => `Your plan is changing to ${d.planName}`,
      body: (d) => `${d.planName} starts ${d.effective}. Details: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDING]: {
      subject: (d) => `${d.planName} ends on ${d.endsOn}`,
      body: (d) =>
        `As requested, ${d.planName} ends on ${d.endsOn}. Classes continue until then. ` +
        `Changed your mind? Keep the plan here: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDED]: {
      subject: (d) => `${d.planName} has ended`,
      body: (d) =>
        `${d.planName} has ended and its future classes are cancelled. You can start again any time: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_TIMES_NEEDED]: {
      subject: (d) => `Choose new weekly times for ${d.planName}`,
      body: (d) =>
        `${d.planName} has ${d.classesPerWeek} classes a week. Please choose the weekly times: ${d.billingUrl}`,
    },
    [TEMPLATE.SAFEGUARDING_ALERT]: {
      subject: (d) => `Safeguarding report received (${d.caseReference})`,
      body: (d) =>
        `A safeguarding report was raised in a class. Reference ${d.caseReference}. ` +
        `Please open the case record and acknowledge within 15 minutes.`,
    },
    [TEMPLATE.GUARDIAN_VERIFICATION]: {
      subject: (d) => `Confirm a guardian for ${d.familyName ?? 'your family'}`,
      body: (d) =>
        // `requesterName` was missing from the payload this template was first shipped
        // with, so the copy rendered a literal "undefined" in front of the one sentence
        // asking a parent to trust a stranger with their children. Both fallbacks keep
        // the message readable if a future caller omits a field.
        `${d.requesterName ?? 'Someone'} asked to join ${d.familyName ?? 'your family'} as a guardian. ` +
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
    [TEMPLATE.BILLING_SUBSCRIBED]: {
      subject: (d) => `${d.planName} شروع ہو گیا`,
      body: (d) =>
        `آپ کا کارڈ محفوظ ہو گیا اور ${d.planName} شروع ہو گیا ہے۔ ہفتہ وار کلاسیں: ${d.schedule}۔ ` +
        `یہ ${d.renewsOn} کو خود بخود تجدید ہوگا۔ انتظام: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_RENEWAL_FAILED]: {
      subject: (d) => `${d.planName} کی ادائیگی نہیں ہو سکی`,
      body: (d) =>
        `${d.planName} کے لیے ${d.amount} کی ادائیگی نہیں ہو سکی۔ کلاسیں جاری رہیں گی، ہم دوبارہ کوشش کریں گے۔ ` +
        `ادائیگی کریں یا کارڈ بدلیں: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDED]: {
      subject: (d) => `${d.planName} ختم ہو گیا`,
      body: (d) => `${d.planName} ختم ہو گیا ہے اور آئندہ کلاسیں منسوخ ہیں۔ دوبارہ شروع کریں: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_TIMES_NEEDED]: {
      subject: (d) => `${d.planName} کے لیے نئے اوقات چنیں`,
      body: (d) => `${d.planName} میں ہفتے میں ${d.classesPerWeek} کلاسیں ہیں۔ اوقات چنیں: ${d.billingUrl}`,
    },
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

  /**
   * Resolves copy for a template + locale, falling back to English.
   *
   * `missing` lists template fields that were read but absent. A template with a missing
   * field used to render the literal word "undefined" into the stored subject and body
   * and into the email (B34); callers now refuse to send instead.
   */
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
        missing: [] as string[],
      };
    }
    const missing = new Set<string>();
    const tracked = new Proxy(data, {
      get: (target, key) => {
        const value = (target as Record<string, unknown>)[key as string];
        if (
          typeof key === 'string' &&
          (value === undefined || value === null || value === '') &&
          !OPTIONAL_TEMPLATE_FIELDS.has(key)
        ) {
          missing.add(key);
        }
        return value;
      },
    });
    return {
      subject: strings.subject(tracked),
      body: strings.body(tracked),
      fallback: false,
      missing: [...missing],
    };
  }

  /**
   * Creates a notification row and queues delivery.
   *
   * The row exists before the send so a delivery failure is visible in the parent
   * portal rather than silently lost, and so `FR-OPS-06` can show what was promised.
   */
  /**
   * The guardians who need to hear about a class (M40).
   *
   * Deliberately the *primary* guardians of the students on the class, deduplicated: a
   * family with two children in the same class hears once, and a second guardian who never
   * opted into WhatsApp does not receive a message on someone else's behalf.
   */
  async guardiansForClass(classId: string): Promise<string[]> {
    const links = await this.prisma.classStudent.findMany({
      where: { classId },
      select: {
        student: {
          select: {
            family: {
              select: { members: { where: { isPrimary: true }, select: { userId: true } } },
            },
          },
        },
      },
      take: 500,
    });

    const ids = new Set<string>();
    for (const link of links) {
      for (const member of link.student.family.members) ids.add(member.userId);
    }
    return [...ids];
  }

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

      if (copy.missing.length > 0 && SAFETY_CRITICAL.has(input.template)) {
        // A safeguarding alert must still reach the lead; log the defect instead of dropping it.
        this.logger.error(
          `"${input.template}" is missing data (${copy.missing.join(', ')}) but is safety-critical; sending anyway`,
        );
      }
      if (copy.missing.length > 0 && !SAFETY_CRITICAL.has(input.template)) {
        // Fail loudly rather than send "undefined" to a family (B34): record the failure so
        // staff can see it, and do not queue a delivery.
        const reason = `Missing template data: ${copy.missing.join(', ')}`;
        this.logger.error(`Not sending "${input.template}" to ${user.id}: ${reason}`);
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: input.template,
            channel: input.channel ?? NotificationChannel.EMAIL,
            payload: { ...input.data } as never,
            status: NotificationStatus.FAILED,
            failureReason: reason,
          },
        });
        continue;
      }

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
    if (copy.missing.length > 0 && !SAFETY_CRITICAL.has(input.template)) {
      await this.markFailed(
        input.notificationId,
        `Missing template data: ${copy.missing.join(', ')}`,
      );
      return { delivered: false };
    }

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

  async listForUser(userId: string, limit = 50, skip = 0) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      // B19 — the controller computed a page and then threw it away, so page 2 was page 1
      // again while the total said there was more. Paging that does not page is worse than
      // no paging: the client shows an infinite-looking inbox and cannot reach the rest.
      skip,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        payload: true,
        // Support needs to answer "why did my WhatsApp not arrive?" without a database
        // console, so the reason a delivery was skipped or failed travels with the row.
        failureReason: true,
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
