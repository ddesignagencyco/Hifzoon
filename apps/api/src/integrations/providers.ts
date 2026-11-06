import { type MushafLayout } from '@hifzoon/shared';

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const MAILER = Symbol('MAILER');
export const MESSENGER = Symbol('MESSENGER');
export const QURAN_CONTENT = Symbol('QURAN_CONTENT');

/**
 * Provider interfaces (NFR-PORT-01, PLAT-BE-07). Feature modules depend on these
 * symbols only — never on LiveKit, Stripe or a specific vendor — so a
 * provider decision (TRD section 21 open questions 1 and 3) costs one new adapter
 * rather than a refactor.
 */

// ── Video (TRD section 8) ────────────────────────────────────────────────────

export interface VideoRoomInput {
  /** The class this room is for. Absent for a room that is not a class (a hiring interview). */
  classId?: string;
  /** The hiring interview this room is for, when it is not a class. */
  interviewId?: string;
  /** Short internal name; providers show it to participants. */
  name: string;
  maxParticipants: number;
  emptyTimeoutSeconds?: number;
}

export interface VideoRoom {
  roomId: string;
  createdAt: Date;
}

export interface VideoTokenInput {
  roomId: string;
  /**
   * The provider identity. Normally the Hifzoon user id; a hiring applicant has no
   * account yet, so theirs is `applicant:<interviewId>`.
   */
  userId: string;
  displayName: string;
  role: 'teacher' | 'student' | 'guardian' | 'supervisor' | 'interviewer' | 'applicant';
  canPublish: boolean;
  ttlSeconds: number;
}

export interface VideoRecordingInput {
  roomId: string;
  classId: string;
  storageKey: string;
  layout: MushafLayout;
}

export interface VideoRecordingHandle {
  egressId: string;
  startedAt: Date;
}

export interface VideoWebhookEvent {
  eventId: string;
  type:
    | 'egress_started'
    | 'egress_ended'
    | 'egress_failed'
    | 'participant_joined'
    | 'participant_left'
    /** Signed and valid but not an event we model; acknowledged so the provider stops retrying. */
    | 'ignored';
  roomId: string;
  egressId?: string;
  recordingKey?: string;
  durationSeconds?: number;
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export interface VideoProvider {
  readonly name: string;
  createRoom(input: VideoRoomInput): Promise<VideoRoom>;
  issueToken(input: VideoTokenInput): Promise<{ token: string; url: string; expiresAt: Date }>;
  startRecording(input: VideoRecordingInput): Promise<VideoRecordingHandle>;
  stopRecording(egressId: string): Promise<void>;
  /** Closes the room and disconnects everyone in it (the class's booked time is over). */
  endRoom(roomId: string): Promise<void>;
  /**
   * Verifies the webhook signature and normalises the payload. May be asynchronous: the
   * LiveKit SDK verifies its signed header with an async JWT check.
   */
  parseWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): VideoWebhookEvent | Promise<VideoWebhookEvent>;
}

// ── Payments (TRD section 14) ───────────────────────────────────────────────

export interface CheckoutInput {
  familyId: string;
  invoiceId: string;
  amountMinor: number;
  currency: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface CheckoutSession {
  provider: string;
  sessionId: string;
  url: string;
}

export interface ProviderSubscriptionInput {
  customerId: string;
  planCode: string;
  /** The plan's display name ("One-to-one, once a week"), shown to the family on the provider's pages. */
  planName?: string;
  amountMinor: number;
  currency: string;
  interval: 'month' | 'quarter' | 'half_year';
  idempotencyKey: string;
  /**
   * The sibling or promo discount, taken off every period. `amountMinor` above is the
   * recurring price before it, so the provider's invoice shows the discount as a line.
   */
  discount?: { amountOffMinor: number; label: string };
}

export interface ProviderSubscription {
  provider: string;
  subscriptionId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

/**
 * A recurring subscription the family starts in the provider's hosted page: they enter a
 * card once, it is saved, the first period is charged there and then, and the provider
 * charges every later period itself (FR-BIL-01/02).
 */
export interface SubscriptionCheckoutInput extends ProviderSubscriptionInput {
  /** Our subscription id; it comes back on the completed-checkout event. */
  reference: string;
  successUrl: string;
  cancelUrl: string;
}

/** A provider-issued invoice for one subscription period, mirrored into ours. */
export interface ProviderInvoice {
  id: string;
  number?: string;
  amountMinor: number;
  currency: string;
  periodStart?: Date;
  periodEnd?: Date;
  hostedUrl?: string;
  pdfUrl?: string;
  /**
   * The provider's id for the charge behind the invoice (a Stripe payment intent), which is
   * what refunds and refund events refer to. Absent when the payload does not carry it.
   */
  paymentId?: string;
}

/** The provider's current view of one subscription, for reconciling without a webhook. */
export interface ProviderSubscriptionState {
  providerSubscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  paused: boolean;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  /** Our plan code for the price being billed now. */
  planCode?: string;
  /** What the provider bills each period now, in minor units. */
  amountMinor?: number;
  /** Recent period invoices, newest first. */
  invoices: Array<ProviderInvoice & { paid: boolean }>;
}

export interface PlanChangeInput {
  providerSubscriptionId: string;
  planCode: string;
  /** The plan's display name, for the provider's product. */
  planName?: string;
  amountMinor: number;
  currency: string;
  interval: 'month' | 'quarter' | 'half_year';
  /** `now` charges the difference straight away; `period_end` switches at renewal. */
  when: 'now' | 'period_end';
}

export interface RefundInput {
  providerPaymentId: string;
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}

export interface PaymentWebhookEvent {
  eventId: string;
  type:
    | 'payment_succeeded'
    | 'payment_failed'
    | 'subscription_updated'
    | 'subscription_cancelled'
    | 'refund_created'
    /** The family finished a hosted subscription checkout; `reference` is our subscription id. */
    | 'subscription_checkout_completed'
    /** A provider-issued period invoice was paid or failed (recurring billing). */
    | 'invoice_paid'
    | 'invoice_failed'
    /** Signed and valid but not an event we model; acknowledged so the provider stops retrying. */
    | 'ignored';
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  invoiceNumber?: string;
  /**
   * On `refund_created` from a charge, the total refunded on the charge so far, not this
   * refund alone. Absent when the event is about one refund (`refunds` then has it).
   */
  amountMinor?: number;
  /** On `refund_created`, each provider refund the event carries, with its own id. */
  refunds?: Array<{ id: string; amountMinor: number }>;
  /**
   * On `subscription_checkout_completed`: `paid`, `no_payment_required` or `unpaid`. An
   * unpaid session (a delayed payment method) is started by the later invoice payment.
   */
  paymentStatus?: string;
  reference?: string;
  invoice?: ProviderInvoice;
  /** Provider-side subscription state, on `subscription_updated` and checkout completion. */
  subscription?: {
    status: string;
    cancelAtPeriodEnd: boolean;
    paused: boolean;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    planCode?: string;
    amountMinor?: number;
  };
  occurredAt: Date;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createCustomer(input: {
    familyId: string;
    email: string;
    name: string;
  }): Promise<{ customerId: string }>;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
  createSubscription(input: ProviderSubscriptionInput): Promise<ProviderSubscription>;
  /**
   * Hosted checkout that saves the card and starts a recurring subscription. Null when the
   * adapter has no hosted page (the fake): the caller then activates directly.
   */
  createSubscriptionCheckout(input: SubscriptionCheckoutInput): Promise<CheckoutSession | null>;
  /**
   * Closes an earlier hosted checkout so its link can no longer be paid. `complete` means it
   * was already paid (its webhook may still be on the way); `closed` means it is now
   * unusable. Absent on adapters without hosted checkout.
   */
  closeCheckout?(sessionId: string): Promise<'closed' | 'complete'>;
  /**
   * Reads the subscription straight from the provider (by id, or through the checkout
   * session that created it). Null when the adapter keeps no remote state (the fake).
   */
  fetchSubscription(ref: {
    providerSubscriptionId?: string;
    checkoutSessionId?: string;
  }): Promise<ProviderSubscriptionState | null>;
  /**
   * Moves a subscription to another plan; returns whether it applied immediately.
   * `paymentPending` means an immediate change is waiting on its charge and has not applied.
   */
  changeSubscriptionPlan(
    input: PlanChangeInput,
  ): Promise<{ appliedNow: boolean; paymentPending?: boolean }>;
  /** The charge (payment intent) behind a provider invoice, for payloads that omit it. */
  invoicePaymentId?(providerInvoiceId: string): Promise<string | undefined>;
  /** Withdraws a cancel-at-period-end before the period ends. */
  undoCancel(providerSubscriptionId: string): Promise<void>;
  /** Hosted page where a family updates its card and downloads receipts (FR-PAR-06). */
  createBillingPortal(customerId: string, returnUrl: string): Promise<{ url: string } | null>;
  pauseSubscription(subscriptionId: string, until: Date): Promise<void>;
  resumeSubscription(subscriptionId: string): Promise<void>;
  cancelSubscription(subscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  retryInvoicePayment(providerPaymentId: string, idempotencyKey: string): Promise<void>;
  refund(input: RefundInput): Promise<{ refundId: string }>;
  parseWebhook(rawBody: Buffer, signature: string | undefined): PaymentWebhookEvent;
}

// ── Mail (TRD section 13) ───────────────────────────────────────────────────

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** `cid` makes it inline: the html shows it with `<img src="cid:...">`. */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string; cid?: string }>;
  headers?: Record<string, string>;
  /** Set for transactional mail so bounces can be traced to a notification row. */
  idempotencyKey?: string;
}

export interface MailResult {
  messageId: string;
  accepted: boolean;
}

export interface Mailer {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
}

// ── WhatsApp (FR-NTF-03, IR-SW-05) ──────────────────────────────────────────

export interface MessengerMessage {
  to: string;
  template: string;
  locale: string;
  variables: Record<string, string>;
  idempotencyKey?: string;
}

export interface Messenger {
  readonly name: string;
  /** True when the recipient has opted in; callers must never message otherwise. */
  canContact(recipientPhone: string): Promise<boolean>;
  sendTemplate(message: MessengerMessage): Promise<{ messageId: string }>;
}

/**
 * A delivery-status callback from the messaging provider.
 *
 * These arrive out of order and are redelivered, so `status` is a position on a
 * progression rather than a boolean, and the caller must only ever move a message
 * forward through it.
 */
export interface MessengerDeliveryEvent {
  /** Provider's id for the message, as returned by `sendTemplate`. */
  messageId: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  /** Phone in E.164 as the provider reports it; used only for logging. */
  recipientPhone: string | null;
  errorCode: string | null;
  occurredAt: Date;
}

export interface MessengerWebhookEvent {
  /** Verifies the HMAC signature over the raw body and normalises the payload. */
  parseDeliveryWebhook(rawBody: Buffer, signature: string | undefined): MessengerDeliveryEvent[];
}

// ── Quran content (CR-11, IR-SW-02) ─────────────────────────────────────────

export interface MushafPageContent {
  layout: MushafLayout;
  page: number;
  /** Lines, each holding the ayahs that start on it. Text comes from the licensed
   *  source and is never generated, edited or stored in an editable column. */
  lines: Array<{ lineNumber: number; ayahs: Array<{ surah: number; ayah: number }> }>;
  surahStart: number;
  ayahStart: number;
}

export interface AyahWord {
  index: number;
  /** Position of the word in the licensed text. Rendered verbatim. */
  text: string;
  tajweedRules: string[];
  /** Word-by-word meaning in the language asked for, when the source has one. */
  translation?: string | null;
}

/** Languages offered for word meanings (ISO 639-1, as the content API takes them). */
export const WORD_MEANING_LANGUAGES = ['en', 'ur', 'id', 'tr', 'bn', 'hi', 'fa'] as const;
export type WordMeaningLanguage = (typeof WORD_MEANING_LANGUAGES)[number];

export interface QuranContentProvider {
  readonly name: string;
  getPage(layout: MushafLayout, page: number): Promise<MushafPageContent>;
  getAyahWords(
    layout: MushafLayout,
    surah: number,
    ayah: number,
    language?: WordMeaningLanguage,
  ): Promise<AyahWord[]>;
  /** True when the deployment is allowed to fetch/store licensed content at all. */
  isLicensed(): boolean;
  /** Whether this source has the layout's pages at all; absent means every layout. */
  supportsLayout?(layout: MushafLayout): boolean;
  /** Playable URL of one ayah recited by a qari (FR-AIC-04); absent when the source has no audio. */
  recitationAudioUrl?(surah: number, ayah: number, recitationId?: number): Promise<string>;
  /** The Madani (604-page) page an ayah is on, so homework can open where it starts. */
  madaniPageOf?(surah: number, ayah: number): Promise<number>;
}
