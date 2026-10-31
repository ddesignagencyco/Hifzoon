import { randomUUID } from 'node:crypto';

import { MushafLayout, MUSHAF_MAX_PAGE, MUSHAF_MIN_PAGE } from '@hifzoon/shared';

import {
  type AyahWord,
  type CheckoutInput,
  type CheckoutSession,
  type Mailer,
  type MailMessage,
  type MailResult,
  type Messenger,
  type MessengerMessage,
  type MushafPageContent,
  type PaymentProvider,
  type PaymentWebhookEvent,
  type ProviderSubscription,
  type ProviderSubscriptionInput,
  type QuranContentProvider,
  type RefundInput,
  type SpeechFeedback,
  type SpeechProvider,
  type VideoProvider,
  type VideoRecordingHandle,
  type VideoRecordingInput,
  type VideoRoom,
  type VideoRoomInput,
  type VideoTokenInput,
  type VideoWebhookEvent,
} from './providers';

/**
 * Deterministic in-process adapters used by tests and local development
 * (PLAT-BE-07: "with fakes for tests"). They keep every module hermetic — no
 * network, no provider keys — while still exercising the real code paths.
 */

export class FakeVideoProvider implements VideoProvider {
  readonly name = 'fake';
  private readonly rooms = new Map<string, VideoRoom>();

  async createRoom(input: VideoRoomInput): Promise<VideoRoom> {
    const room: VideoRoom = { roomId: `fake-room-${randomUUID()}`, createdAt: new Date() };
    this.rooms.set(room.roomId, room);
    void input;
    return room;
  }

  async issueToken(
    input: VideoTokenInput,
  ): Promise<{ token: string; url: string; expiresAt: Date }> {
    return {
      token: `fake-token.${Buffer.from(JSON.stringify(input)).toString('base64url')}`,
      url: `fake://room/${input.roomId}`,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
    };
  }

  async startRecording(_input: VideoRecordingInput): Promise<VideoRecordingHandle> {
    return { egressId: `fake-egress-${randomUUID()}`, startedAt: new Date() };
  }

  async stopRecording(): Promise<void> {
    return undefined;
  }
  async endRoom(): Promise<void> {
    // Fake rooms have no live connections to close.
  }


  parseWebhook(_rawBody: Buffer, _signature: string | undefined): VideoWebhookEvent {
    throw new Error('fake video provider cannot verify webhooks');
  }
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  private readonly subscriptions = new Map<string, ProviderSubscription>();

  async createCustomer(input: { familyId: string }): Promise<{ customerId: string }> {
    return { customerId: `fake-cus-${input.familyId}` };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutSession> {
    return {
      provider: this.name,
      sessionId: `fake-cs-${randomUUID()}`,
      url: `${input.successUrl}?session=fake`,
    };
  }

  async createSubscription(input: ProviderSubscriptionInput): Promise<ProviderSubscription> {
    const months = input.interval === 'month' ? 1 : input.interval === 'quarter' ? 3 : 6;
    const now = new Date();
    const subscription: ProviderSubscription = {
      provider: this.name,
      subscriptionId: `fake-sub-${randomUUID()}`,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + months * 30 * 86_400_000),
    };
    this.subscriptions.set(subscription.subscriptionId, subscription);
    return subscription;
  }

  /** No hosted page in development: the billing service activates the subscription directly. */
  async createSubscriptionCheckout(): Promise<CheckoutSession | null> {
    return null;
  }

  async createBillingPortal(): Promise<{ url: string } | null> {
    return null;
  }

  async fetchSubscription(): Promise<null> {
    return null;
  }

  /** No billing cycle to wait for in development, so every change applies at once. */
  async changeSubscriptionPlan(): Promise<{ appliedNow: boolean }> {
    return { appliedNow: true };
  }

  async undoCancel(): Promise<void> {}

  async pauseSubscription(): Promise<void> {
    return undefined;
  }
  async resumeSubscription(): Promise<void> {
    return undefined;
  }
  async cancelSubscription(): Promise<void> {
    return undefined;
  }
  async retryInvoicePayment(): Promise<void> {
    return undefined;
  }

  async refund(_input: RefundInput): Promise<{ refundId: string }> {
    return { refundId: `fake-ref-${randomUUID()}` };
  }

  parseWebhook(_rawBody: Buffer, _signature: string | undefined): PaymentWebhookEvent {
    throw new Error('fake payment provider cannot verify webhooks');
  }
}

/** Writes emails to the log instead of sending them; used in dev and tests. */
export class LogMailer implements Mailer {
  readonly name = 'log';
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<MailResult> {
    this.sent.push(message);
    return { messageId: `log-${randomUUID()}`, accepted: true };
  }
}

export class FakeMessenger implements Messenger {
  readonly name = 'fake';

  async canContact(): Promise<boolean> {
    return true;
  }

  async sendTemplate(_message: MessengerMessage): Promise<{ messageId: string }> {
    return { messageId: `fake-wa-${randomUUID()}` };
  }
}

/**
 * Placeholder Quran content. It deliberately returns *structure only* — no Quran
 * text — because text may only come from the licensed source (CR-11, TRD section 9).
 * With this adapter the classroom renders page numbers but no words, which is the
 * correct degraded behaviour until a licence is configured.
 */
export class FakeQuranContentProvider implements QuranContentProvider {
  readonly name = 'fake';

  isLicensed(): boolean {
    return false;
  }

  async getPage(layout: MushafLayout, page: number): Promise<MushafPageContent> {
    assertPageRange(page);
    const perPage =
      layout === MushafLayout.MADANI_15 ? 15 : layout === MushafLayout.INDOPAK_13 ? 13 : 16;
    const surah = Math.min(114, Math.ceil(page / 6));
    const ayahStart = ((page - 1) * 3) % 20;
    return {
      layout,
      page,
      lines: Array.from({ length: perPage }, (_, i) => ({
        lineNumber: i + 1,
        ayahs: [{ surah, ayah: ayahStart + i }],
      })),
      surahStart: surah,
      ayahStart: ayahStart || 1,
    };
  }

  async getAyahWords(layout: MushafLayout, surah: number, ayah: number): Promise<AyahWord[]> {
    void layout;
    void surah;
    void ayah;
    return [];
  }
}

export class FakeSpeechProvider implements SpeechProvider {
  readonly name = 'fake';

  async score(options: {
    audio: Buffer;
    expectedWords: string[];
    mode: 'READING' | 'MEMORISATION';
  }): Promise<SpeechFeedback> {
    return {
      alignment: options.expectedWords.map((_, index) => ({
        wordIndex: index,
        matched: true,
        confidence: 1,
      })),
      flags: [],
      processingMs: 0,
    };
  }

  async referenceAudio(surah: number, ayah: number, qariId: string): Promise<string> {
    return `fake://recitation/${qariId}/${surah}/${ayah}`;
  }
}

function assertPageRange(page: number): void {
  if (page < MUSHAF_MIN_PAGE || page > MUSHAF_MAX_PAGE) {
    throw new Error(`Mushaf page must be between ${MUSHAF_MIN_PAGE} and ${MUSHAF_MAX_PAGE}`);
  }
}
