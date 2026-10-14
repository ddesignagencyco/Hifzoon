import { type MushafLayout } from '@hifzoon/shared';

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const MAILER = Symbol('MAILER');
export const MESSENGER = Symbol('MESSENGER');
export const QURAN_CONTENT = Symbol('QURAN_CONTENT');
export const SPEECH_PROVIDER = Symbol('SPEECH_PROVIDER');

/**
 * Provider interfaces (NFR-PORT-01, PLAT-BE-07). Feature modules depend on these
 * symbols only — never on LiveKit, Stripe or a specific speech vendor — so a
 * provider decision (TRD section 21 open questions 1 and 3) costs one new adapter
 * rather than a refactor.
 */

// ── Video (TRD section 8) ────────────────────────────────────────────────────

export interface VideoRoomInput {
  classId: string;
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
  userId: string;
  displayName: string;
  role: 'teacher' | 'student' | 'guardian' | 'supervisor';
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
    'egress_started' | 'egress_ended' | 'egress_failed' | 'participant_joined' | 'participant_left';
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
  /** Verifies the webhook signature and normalises the payload. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): VideoWebhookEvent;
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
  amountMinor: number;
  currency: string;
  interval: 'month' | 'quarter' | 'half_year';
  idempotencyKey: string;
}

export interface ProviderSubscription {
  provider: string;
  subscriptionId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
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
    | 'refund_created';
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  invoiceNumber?: string;
  amountMinor?: number;
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
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
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
}

export interface QuranContentProvider {
  readonly name: string;
  getPage(layout: MushafLayout, page: number): Promise<MushafPageContent>;
  getAyahWords(layout: MushafLayout, surah: number, ayah: number): Promise<AyahWord[]>;
  /** True when the deployment is allowed to fetch/store licensed content at all. */
  isLicensed(): boolean;
}

// ── Speech (TRD section 15, NFR-PERF-04) ────────────────────────────────────

export interface SpeechFeedback {
  alignment: Array<{ wordIndex: number; matched: boolean; confidence: number }>;
  flags: Array<{
    wordIndex: number;
    kind: 'SKIPPED_WORD' | 'ADDED_WORD' | 'WRONG_WORD' | 'VOWEL_HARAKAH';
    detail?: string;
    confidence: number;
  }>;
  processingMs: number;
}

export interface SpeechProvider {
  readonly name: string;
  /** Scores a recitation against the licensed word sequence (FR-AIC-02). */
  score(options: {
    audio: Buffer;
    expectedWords: string[];
    mode: 'READING' | 'MEMORISATION';
  }): Promise<SpeechFeedback>;
  /** URL of a reference recitation for the given range (FR-AIC-04). */
  referenceAudio(surah: number, ayah: number, qariId: string): Promise<string>;
}
