/**
 * Commercial + platform-support enums (ERD sections 2.10, 2.11, 2.12, 2.13).
 */

export enum Currency {
  USD = 'USD',
  GBP = 'GBP',
  CAD = 'CAD',
  AUD = 'AUD',
  AED = 'AED',
  PKR = 'PKR',
}

/** Currencies with a minor unit of 2 decimals; PKR handled as integer minor units too. */
export const SUPPORTED_CURRENCIES: readonly Currency[] = [
  Currency.USD,
  Currency.GBP,
  Currency.CAD,
  Currency.AUD,
  Currency.AED,
  Currency.PKR,
];

export enum BillingPeriod {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  HALF_YEARLY = 'HALF_YEARLY',
}

export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  VOID = 'VOID',
}

export enum PaymentProviderCode {
  STRIPE = 'STRIPE',
  PAYPAL = 'PAYPAL',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CARD = 'CARD',
  APPLE_PAY = 'APPLE_PAY',
  GOOGLE_PAY = 'GOOGLE_PAY',
  PAYPAL = 'PAYPAL',
  MANUAL = 'MANUAL',
}

export enum DiscountType {
  SIBLING = 'SIBLING',
  PREPAID = 'PREPAID',
  REFERRAL = 'REFERRAL',
  CODE = 'CODE',
}

export enum PayrollPeriodStatus {
  OPEN = 'OPEN',
  CALCULATED = 'CALCULATED',
  EXPORTED = 'EXPORTED',
  PAID = 'PAID',
}

export enum PayrollLineKind {
  CLASS = 'CLASS',
  DEDUCTION_LATE = 'DEDUCTION_LATE',
  DEDUCTION_MISSED = 'DEDUCTION_MISSED',
  BONUS = 'BONUS',
}

export enum SponsorshipStatus {
  ACTIVE = 'ACTIVE',
  ENDED = 'ENDED',
}

export enum LeadStatus {
  NEW = 'NEW',
  TRIAL_BOOKED = 'TRIAL_BOOKED',
  TRIAL_DONE = 'TRIAL_DONE',
  WON = 'WON',
  LOST = 'LOST',
}

export enum TaskType {
  NO_SHOW_FOLLOWUP = 'NO_SHOW_FOLLOWUP',
  TRIAL_NOT_CONVERTED = 'TRIAL_NOT_CONVERTED',
  OTHER = 'OTHER',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum CaseType {
  COMPLAINT = 'COMPLAINT',
  SAFEGUARDING = 'SAFEGUARDING',
}

export enum CaseStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  ACTIONED = 'ACTIONED',
  CLOSED = 'CLOSED',
}

export enum QaSampleSource {
  RANDOM_SAMPLE = 'RANDOM_SAMPLE',
  MANUAL = 'MANUAL',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum DevicePlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
  WEB = 'WEB',
}

export enum Locale {
  EN = 'en',
  UR = 'ur',
  AR = 'ar',
  FR = 'fr',
}

/** NFR-L10N-01 / IR-UI-03 — locales rendered right-to-left. */
export const RTL_LOCALES: readonly Locale[] = [Locale.UR, Locale.AR];
