import { ApiClientError, http, newIdempotencyKey } from '../http';

/**
 * Family-facing billing (`apps/api/src/modules/billing/billing.controller.ts`, BillingController).
 *
 * All money is integer minor units (pence/cents) — format with `formatMoney` at the edge.
 */

/**
 * Every price is set in, and every family is billed in, USD (owner decision, Nov 2026);
 * Stripe shows the family their local currency at checkout. Subscriptions, invoices and
 * payments carry the currency they were recorded in (USD now, maybe another on older
 * history), so those fields are plain strings and are formatted with their own currency.
 */
export const BILLING_CURRENCY = 'USD';
export type BillingPeriod = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
/** INCOMPLETE = waiting for the family to finish the card page; never shown in the family view. */
export type SubscriptionStatus = 'INCOMPLETE' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELLED';
export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOID';

/**
 * `GET /billing/plans/:id/price`. `amountMinor` is one billing period after the plan's
 * period discount (what the family pays each period before sibling/promo discounts);
 * `listMinor` is the same months at the monthly price, so the saving can be shown.
 */
export interface PlanPrice {
  id: string;
  planId: string;
  currency: string;
  amountMinor: number;
  monthlyMinor?: number;
  months?: number;
  listMinor?: number;
  periodDiscountPercent?: number;
  periodDiscountMinor?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * `POST /billing/quote` (pricing.ts `PriceBreakdown`): period discount first, then the
 * larger of the sibling or promo discount (never both), never below zero.
 */
export interface PriceQuote {
  currency: string;
  monthlyMinor: number;
  months: number;
  listMinor: number;
  periodDiscountPercent: number;
  periodDiscountMinor: number;
  periodPriceMinor: number;
  sibling: { percent: number; amountMinor: number } | null;
  promo: {
    promoCodeId: string;
    code: string;
    percentOff: number | null;
    amountOffMinor: number | null;
    amountMinor: number;
  } | null;
  applied: 'SIBLING' | 'PROMO' | null;
  extraDiscountMinor: number;
  finalMinor: number;
}

export interface QuoteInput extends Omit<SubscribeInput, 'schedule'> {
  teacherId?: string;
  /** The child, before an enrolment exists ("start with this teacher"), for the sibling rule. */
  studentId?: string;
  schedule?: ScheduleChoice;
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
  /** Off monthly × months on a prepaid plan (0 on monthly plans). */
  periodDiscountPercent?: number;
  tier: PlanTierInfo | null;
}

/** Raw `subscription` row as returned by subscribe/cancel/pause/resume. */
export interface Subscription {
  id: string;
  familyId: string;
  planId: string;
  currency: string;
  status: SubscriptionStatus;
  providerSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  cancelAtPeriodEnd: boolean;
  /** The teacher tier this family is charged for (tier pricing); null = standard price. */
  tierId?: string | null;
  /** A cheaper plan that starts when the paid period ends. */
  pendingPlanId?: string | null;
  pendingPlanFrom?: string | null;
  /** What the family chose; `timesNeeded` asks them to pick new weekly times (plan change). */
  setup?: {
    timesNeeded?: boolean;
    scheduleError?: string;
    schedule?: { timeZone: string; slots: Array<{ weekday: WeekdayCode; localTime: string }> };
  } | null;
  createdAt: string;
  updatedAt: string;
}

/** Subscription in `GET /billing/family`: its plan and the children it covers. */
export interface FamilySubscription extends Subscription {
  plan: { code: string; name: string; classesPerWeek: number };
  enrolments?: Array<{
    id: string;
    status: string;
    student: { id: string; displayName: string };
    course: { name: string };
    teacher: { id: string; user: { name: string } } | null;
  }>;
  /** Classes in the current billing period (computed by the API from the class records). */
  usage?: ClassUsage | null;
}

export interface ClassUsage {
  periodStart: string;
  periodEnd: string;
  /** Paid-for classes this period: taught + still to come + missed by the student. */
  included: number;
  completed: number;
  upcoming: number;
  missedByStudent: number;
  /** Teacher no-shows/cancellations — not counted against the family. */
  missedByTeacher: number;
}

/** `GET /billing/family/payments` row (M29). */
export interface FamilyPayment {
  id: string;
  status: string;
  method: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
  failureReason: string | null;
  refundedMinor: number;
  invoice: { id: string; number: string; hostedUrl: string | null };
}

/** `GET /billing/offers` — a won trial waiting for the family to continue (FR-ADM-05). */
export interface TrialOffer {
  trialOutcomeId: string;
  completedAt: string;
  notes: string | null;
  familyId: string;
  /** Always USD. */
  currency: string | null;
  enrolmentId: string | null;
  student: { id: string; displayName: string } | null;
  course: { id: string; code: string; name: string } | null;
  placementLevel: { id: string; name: string; position: number } | null;
  /** `id` is the teacher profile id (for scheduling); `userId` for their public page. */
  teacher: {
    id: string;
    userId: string;
    name: string;
    tierId: string | null;
    tier: PlanTierInfo | null;
  } | null;
  recommendedPlan:
    | (Omit<BillingPlan, 'tier'> & { price: { currency: string; amountMinor: number } | null })
    | null;
}

export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/** The weekly times chosen with the trial teacher; created once the first payment lands. */
export interface ScheduleChoice {
  enrolmentId: string;
  teacherId: string;
  timeZone: string;
  /** YYYY-MM-DD in `timeZone`. */
  startsOn: string;
  slots: Array<{ weekday: WeekdayCode; localTime: string }>;
}

/**
 * `GET /billing/teacher-prices` (public) — one teacher's price for every active plan, before
 * any family discount: the monthly price (the teacher's tier price, else the standard price)
 * and one billing period after the plan's period discount. Cheapest monthly first.
 */
export interface TeacherPlanPrice {
  planId: string;
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: BillingPeriod;
  tierPriced: boolean;
  monthlyMinor: number;
  months: number;
  listMinor: number;
  periodDiscountPercent: number;
  periodPriceMinor: number;
}

export interface TeacherPrices {
  teacherId: string;
  currency: string;
  tier: { code: string; name: string } | null;
  /** The cheapest monthly price; null when no plan has a price yet. */
  fromMonthlyMinor: number | null;
  plans: TeacherPlanPrice[];
}

/**
 * `POST /billing/start-with-teacher` — regular classes with a teacher, no trial. The weekly
 * times are the continue-after-trial shape without the enrolment and teacher.
 */
export interface StartWithTeacherInput {
  familyId: string;
  studentId: string;
  courseId: string;
  /** Teacher **profile** id. */
  teacherId: string;
  planId: string;
  schedule: Omit<ScheduleChoice, 'enrolmentId' | 'teacherId'>;
  promoCode?: string;
}

/** Raw `invoice` row (no payments are included by the family endpoint). */
export interface Invoice {
  id: string;
  familyId: string;
  subscriptionId: string | null;
  number: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: InvoiceStatus;
  dueAt: string;
  paidAt: string | null;
  pdfUrl: string | null;
  /** The provider's page for this invoice (pay, receipt); set on card-billed invoices. */
  hostedUrl?: string | null;
  providerInvoiceId?: string | null;
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

/** `GET /families` row (FamiliesService.listForUser) — used for the family id. */
export interface BillingFamily {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  createdAt: string;
  members: Array<{ isPrimary: boolean; verifiedAt: string | null; relationship: string }>;
}

export interface SubscribeInput {
  familyId: string;
  planId: string;
  trialOutcomeId?: string;
  schedule?: ScheduleChoice;
  /** Checked by the API; counted only once the first payment lands. */
  promoCode?: string;
}

/**
 * `POST /billing/subscribe`. With a card provider `checkoutUrl` is the hosted card page and
 * nothing starts until it is paid; without one (development) the subscription is live and
 * `firstInvoice` is paid through the one-off checkout.
 */
export type SubscribeResult = Subscription & { checkoutUrl: string | null; firstInvoice: Invoice | null };

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
  /** A plan's price in USD (signed-in only). `null` when no price is set for it. */
  price: async (
    planId: string,
    ctx?: { teacherId?: string | null; tierId?: string | null },
  ): Promise<PlanPrice | null> => {
    try {
      return await http.get<PlanPrice>(`/billing/plans/${encodeURIComponent(planId)}/price`, {
        query: { teacherId: ctx?.teacherId ?? undefined, tierId: ctx?.tierId ?? undefined },
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) return null;
      throw error;
    }
  },
  family: () => http.get<FamilyBilling>('/billing/family'),
  /** M29 — the family's payments with refunds. */
  payments: () => http.get<FamilyPayment[]>('/billing/family/payments'),
  /** Families the signed-in guardian belongs to. */
  families: () => http.get<BillingFamily[]>('/families'),
  /**
   * Hosted checkout for an invoice. The backend refuses without an Idempotency-Key, so a
   * key is mandatory: pass the same key when retrying the same "Pay" intent.
   */
  checkout: (input: CheckoutInput, idempotencyKey: string = newIdempotencyKey()) =>
    http.post<CheckoutSession>('/billing/checkout', input, { idempotencyKey }),
  /** Idempotency-Key is not required by the backend today but is sent for safe retries. */
  subscribe: (input: SubscribeInput, idempotencyKey?: string) =>
    http.post<SubscribeResult>('/billing/subscribe', input, idempotencyKey ? { idempotencyKey } : undefined),
  offers: () => http.get<TrialOffer[]>('/billing/offers'),
  /** Public: a teacher's price for each plan in USD, before family discounts. */
  teacherPrices: (teacherId: string) =>
    http.get<TeacherPrices>('/billing/teacher-prices', { query: { teacherId } }),
  /** Regular classes with a teacher without a trial; returns the hosted card page. */
  startWithTeacher: (input: StartWithTeacherInput, idempotencyKey?: string) =>
    http.post<SubscribeResult>('/billing/start-with-teacher', input, idempotencyKey ? { idempotencyKey } : undefined),
  /** The price this family will pay, with every discount; validates a promo code (400 if not). */
  quote: (input: QuoteInput) => http.post<PriceQuote>('/billing/quote', input),
  /** Re-reads a subscription from the payment provider (recovers a lost webhook). */
  sync: (subscriptionId: string) => http.post<FamilySubscription>(`${sub(subscriptionId)}/sync`),
  changePlan: (subscriptionId: string, planId: string) =>
    http.post<Subscription & { appliedNow: boolean }>(`${sub(subscriptionId)}/change-plan`, { planId }),
  /** Moves the regular classes to new weekly times with the same teacher. */
  weeklyTimes: (subscriptionId: string, body: Omit<ScheduleChoice, 'teacherId'>) =>
    http.post<Subscription>(`${sub(subscriptionId)}/weekly-times`, body),
  /** Withdraws a cancellation before the period ends. */
  keep: (subscriptionId: string) => http.post<Subscription>(`${sub(subscriptionId)}/keep`),
  /** Stripe's page for the card on file and receipts. */
  portal: (familyId: string) => http.post<{ url: string }>('/billing/portal', { familyId }),
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

/** The period saving on a plan price, or null when there is none to show. */
export function periodSaving(price: Pick<PlanPrice, 'amountMinor' | 'listMinor' | 'periodDiscountPercent'>) {
  if (!price.listMinor || !price.periodDiscountPercent || price.listMinor <= price.amountMinor) return null;
  return { beforeMinor: price.listMinor, savingMinor: price.listMinor - price.amountMinor, percent: price.periodDiscountPercent };
}

/** Plain words for the discount a quote took, or null when it took none. */
export function discountLabel(quote: Pick<PriceQuote, 'applied' | 'sibling' | 'promo'>): string | null {
  if (quote.applied === 'SIBLING' && quote.sibling) return `Sibling discount (${quote.sibling.percent}%)`;
  if (quote.applied === 'PROMO' && quote.promo) {
    return quote.promo.percentOff !== null ? `Promo ${quote.promo.code} (${quote.promo.percentOff}%)` : `Promo ${quote.promo.code}`;
  }
  return null;
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

export function canChangePlan(s: Pick<Subscription, 'status' | 'cancelAtPeriodEnd'>): boolean {
  return (s.status === 'ACTIVE' || s.status === 'PAST_DUE') && !s.cancelAtPeriodEnd;
}

/** Billed by card through the provider (Stripe ids start `sub_`), so card tools apply. */
export function isCardBilled(s: Pick<Subscription, 'providerSubscriptionId'>): boolean {
  return Boolean(s.providerSubscriptionId?.startsWith('sub_'));
}

export function isPayable(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'OPEN' || invoice.status === 'FAILED';
}

/**
 * Sum of unpaid invoices in one currency, USD by default. An older invoice in another
 * currency is not mixed in; it is still listed, with its own currency.
 */
export function outstandingMinor(invoices: Invoice[], currency: string = BILLING_CURRENCY): number {
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
