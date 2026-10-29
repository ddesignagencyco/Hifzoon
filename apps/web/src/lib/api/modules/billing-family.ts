import { ApiClientError, http, newIdempotencyKey } from '../http';

/**
 * Family-facing billing (`apps/api/src/modules/billing/billing.controller.ts`, BillingController).
 *
 * All money is integer minor units (pence/cents) — format with `formatMoney` at the edge.
 */

export type CurrencyCode = 'USD' | 'GBP' | 'CAD' | 'AUD' | 'AED' | 'PKR';
export type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED';
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOID';

/** `plan_price` row (Prisma `PlanPrice`). */
export interface PlanPrice {
  id: string;
  planId: string;
  currency: CurrencyCode;
  amountMinor: number;
  createdAt: string;
  updatedAt: string;
}

/** Teacher tier a plan guarantees (BillingService.listPublicPlans `tier` select). */
export interface PlanTierInfo {
  code: string;
  name: string;
  badgeIcon: string | null;
  description: string | null;
}

/**
 * `GET /billing/plans` row (BillingService.listPublicPlans). The catalogue sells the teacher
 * tier and never carries a price; read a price with `billingFamilyApi.price`.
 */
export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: BillingPeriod;
  tier: PlanTierInfo | null;
}

/** Raw `subscription` row as returned by subscribe/cancel/pause/resume. */
export interface Subscription {
  id: string;
  familyId: string;
  planId: string;
  currency: CurrencyCode;
  status: SubscriptionStatus;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Subscription in `GET /billing/family` (includes `plan: { code, name, classesPerWeek }`). */
export interface FamilySubscription extends Subscription {
  plan: { code: string; name: string; classesPerWeek: number };
}

/** Raw `invoice` row (no payments are included by the family endpoint). */
export interface Invoice {
  id: string;
  familyId: string;
  subscriptionId: string | null;
  number: string;
  currency: CurrencyCode;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: InvoiceStatus;
  dueAt: string;
  paidAt: string | null;
  pdfUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /billing/family` — BillingService.familyBilling (latest 50 invoices). */
export interface FamilyBilling {
  subscriptions: FamilySubscription[];
  invoices: Invoice[];
}

/** `POST /billing/checkout` — provider `CheckoutSession`. */
export interface CheckoutSession {
  provider: string;
  sessionId: string;
  url: string;
}

/** `GET /families` row (FamiliesService.listForUser) — used for the family currency and id. */
export interface BillingFamily {
  id: string;
  name: string;
  country: string | null;
  currency: CurrencyCode;
  createdAt: string;
  members: Array<{ isPrimary: boolean; verifiedAt: string | null; relationship: string }>;
}

export interface SubscribeInput {
  familyId: string;
  planId: string;
  /** ISO 4217, exactly 3 characters. */
  currency: string;
  trialOutcomeId?: string;
}

export interface CheckoutInput {
  invoiceId: string;
  successUrl: string;
  cancelUrl: string;
}

export const PAUSE_MIN_DAYS = 1;
export const PAUSE_MAX_DAYS = 30;

const sub = (id: string) => `/billing/subscriptions/${encodeURIComponent(id)}`;

export const billingFamilyApi = {
  /** Public catalogue: plan shape and teacher tier, no prices. */
  plans: () => http.get<BillingPlan[]>('/billing/plans'),
  /** A plan's price in one currency (signed-in only). `null` when no price is set for it. */
  price: async (planId: string, currency: string): Promise<PlanPrice | null> => {
    try {
      return await http.get<PlanPrice>(`/billing/plans/${encodeURIComponent(planId)}/price`, { query: { currency } });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return null;
      throw error;
    }
  },
  family: () => http.get<FamilyBilling>('/billing/family'),
  /** Families the signed-in guardian belongs to (id + billing currency). */
  families: () => http.get<BillingFamily[]>('/families'),
  /**
   * Hosted checkout for an invoice. The backend refuses without an Idempotency-Key, so a
   * key is mandatory: pass the same key when retrying the same "Pay" intent.
   */
  checkout: (input: CheckoutInput, idempotencyKey: string = newIdempotencyKey()) =>
    http.post<CheckoutSession>('/billing/checkout', input, { idempotencyKey }),
  /** Idempotency-Key is not required by the backend today but is sent for safe retries. */
  /** Subscribing also issues the first invoice (backend B22), returned as `firstInvoice`. */
  subscribe: (input: SubscribeInput, idempotencyKey?: string) =>
    http.post<Subscription & { firstInvoice?: Invoice | null }>(
      '/billing/subscribe',
      input,
      idempotencyKey ? { idempotencyKey } : undefined,
    ),
  cancel: (subscriptionId: string, atPeriodEnd = true) =>
    http.post<Subscription>(`${sub(subscriptionId)}/cancel`, { atPeriodEnd }),
  pause: (subscriptionId: string, days: number) =>
    http.post<Subscription>(`${sub(subscriptionId)}/pause`, { days }),
  resume: (subscriptionId: string) => http.post<Subscription>(`${sub(subscriptionId)}/resume`),
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function periodLabel(period: BillingPeriod | string): string {
  if (period === 'QUARTERLY') return 'quarter';
  if (period === 'HALF_YEARLY') return '6 months';
  return 'month';
}

/** A subscription that still bills (or will resume billing). */
export function isLiveSubscription(s: Pick<Subscription, 'status'>): boolean {
  return s.status !== 'CANCELLED';
}

export function canPause(s: Pick<Subscription, 'status' | 'cancelAtPeriodEnd'>): boolean {
  return (s.status === 'ACTIVE' || s.status === 'TRIALING') && !s.cancelAtPeriodEnd;
}

export function canResume(s: Pick<Subscription, 'status'>): boolean {
  return s.status === 'PAUSED';
}

export function canCancel(s: Pick<Subscription, 'status' | 'cancelAtPeriodEnd'>): boolean {
  return s.status !== 'CANCELLED' && !s.cancelAtPeriodEnd;
}

export function isPayable(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'OPEN' || invoice.status === 'FAILED';
}

/** Sum of unpaid invoices in one currency (other currencies are not mixed in). */
export function outstandingMinor(invoices: Invoice[], currency: string): number {
  return invoices
    .filter((i) => isPayable(i) && i.currency === currency)
    .reduce((sum, i) => sum + i.totalMinor, 0);
}

/** Validates a pause length to the backend rule (integer 1..30). Returns an error or null. */
export function validatePauseDays(days: number): string | null {
  if (!Number.isInteger(days) || days < PAUSE_MIN_DAYS || days > PAUSE_MAX_DAYS) {
    return `Choose between ${PAUSE_MIN_DAYS} and ${PAUSE_MAX_DAYS} days.`;
  }
  return null;
}

/** Only follow provider redirects to http(s) URLs. */
export function isSafeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
