import { http } from '../http';
import type { BillingPlan, PriceQuote } from './billing-family';

/**
 * Every price is in USD (`BILLING_CURRENCY`). Invoices, payments and refunds carry the
 * currency they were recorded in: USD for anything new, possibly another currency on
 * older history, so those fields stay plain strings.
 */

export type { BillingPlan, PlanPrice } from './billing-family';
/** Prisma `Invoice` row returned by `POST /admin/billing/invoices`. */
export interface Invoice {
  id: string;
  familyId: string;
  subscriptionId: string | null;
  number: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'FAILED' | 'REFUNDED' | 'VOID';
  dueAt: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** Prisma `Refund` row returned by `POST /admin/billing/refunds`. */
export interface Refund {
  id: string;
  paymentId: string;
  amountMinor: number;
  reason: string;
  issuedById: string;
  createdAt: string;
  [key: string]: unknown;
}

/** Zod `invoiceBody`. */
export interface IssueInvoiceInput {
  subscriptionId: string;
  discountMinor?: number;
}

/** Zod `refundBody`. */
export interface RefundInput {
  paymentId: string;
  amountMinor: number;
  reason: string;
}

/** Zod `writeOffBody`. */
export interface WriteOffInput {
  reason: string;
}

export interface DunningResult {
  retried: number;
  cancelled: number;
}

/**
 * Admin billing. Each mutation takes the `Idempotency-Key` generated once per user
 * intent (see `newIdempotencyKey`) so a double-click or retry replays the same request.
 */
/** `GET /admin/billing/prices` — every plan with standard and tier prices (FR-OPS-05). */
export interface AdminPriceList {
  /** Always 'USD': every price is set in USD. */
  currency: 'USD';
  tiers: Array<{
    id: string;
    code: string;
    name: string;
    badgeIcon: string | null;
    active: boolean;
    teacherCount: number;
  }>;
  plans: Array<{
    id: string;
    code: string;
    name: string;
    classesPerWeek: number;
    classMinutes: number;
    roomType: 'ONE_TO_ONE' | 'CIRCLE';
    billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
    /** Off monthly × months on a prepaid plan; prices here are always monthly. */
    periodDiscountPercent: number;
    active: boolean;
    /** The tier the public plans page shows for this plan. */
    tierId: string | null;
    liveSubscriptions: number;
    /** USD, monthly, in cents. */
    prices: Array<{ amountMinor: number }>;
    tierPrices: Array<{ tierId: string; amountMinor: number }>;
  }>;
}

export interface SetPriceInput {
  planId: string;
  /** Null = the standard price. */
  tierId: string | null;
  /** US cents. Null removes a tier price (the standard price applies again). */
  amountMinor: number | null;
}

export interface PlanInput {
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY';
  /** 0–50; applies to QUARTERLY / HALF_YEARLY plans only. Editable even with families on it. */
  periodDiscountPercent?: number;
}

/** `GET /admin/billing/promo-codes` row (Prisma `PromoCode` + redemption count). */
export interface PromoCode {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
  /** USD for an amount off (a code made before USD-only pricing may show another). */
  currency: string | null;
  maxRedemptions: number | null;
  /** Counted when a subscription using the code is paid for, not at checkout. */
  redeemedCount: number;
  expiresAt: string | null;
  active: boolean;
  /** Empty = every plan. */
  appliesToPlanIds: string[];
  createdAt: string;
  _count?: { redemptions: number };
}

/** Zod `createPromoBody`: a percentage, or an amount off in US cents. */
export interface PromoCodeInput {
  code: string;
  percentOff?: number | null;
  amountOffMinor?: number | null;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  active?: boolean;
  appliesToPlanIds?: string[];
}

/** `GET /admin/billing/lookups` — newest records with the family name, to pick from a list. */
export interface BillingLookups {
  subscriptions: Array<{
    id: string;
    status: string;
    currency: string;
    createdAt: string;
    plan: { name: string };
    family: { name: string };
  }>;
  invoices: Array<{
    id: string;
    number: string;
    status: string;
    totalMinor: number;
    currency: string;
    createdAt: string;
    dueAt?: string;
    paidAt?: string | null;
    hostedUrl?: string | null;
    /** CARD = billed by Stripe for a card subscription; MANUAL = issued by the academy. */
    source?: 'CARD' | 'MANUAL';
    /** How the subscription's price was reached (invoices list only); null before discounts. */
    discount?: Omit<PriceQuote, 'currency'> | null;
    family: { name: string };
  }>;
  payments: Array<{
    id: string;
    status: string;
    amountMinor: number;
    currency: string;
    createdAt: string;
    invoice: { number: string; family: { name: string } };
    refundedMinor?: number;
    /** What can still be refunded on this payment. */
    refundableMinor?: number;
  }>;
}

/** One row of the paginated invoices table (`GET /admin/billing/invoices`). */
export type InvoiceListItem = BillingLookups['invoices'][number];

export interface InvoiceListFilters {
  status?: Invoice['status'] | '';
  source?: 'CARD' | 'MANUAL' | '';
  page?: number;
  limit?: number;
}

/** `GET /admin/billing/class-credits?familyId=` */
export interface ClassCreditList {
  family: { id: string; name: string };
  totalClasses: number;
  credits: Array<{
    id: string;
    amountClasses: number;
    reason: string;
    issuedById: string;
    issuedBy: string | null;
    createdAt: string;
  }>;
}

/** Server limit on one grant (`MAX_CLASS_CREDIT`). */
export const MAX_CLASS_CREDIT = 50;

export const billingAdminApi = {
  classCredits: (familyId: string) =>
    http.get<ClassCreditList>('/admin/billing/class-credits', { query: { familyId } }),
  issueClassCredit: (body: { familyId: string; amountClasses: number; reason: string }, idempotencyKey: string) =>
    http.post<{ id: string }>('/admin/billing/class-credits', body, { idempotencyKey }),
  revokeClassCredit: (id: string, reason: string) =>
    http.post<{ id: string; revoked: boolean }>(`/admin/billing/class-credits/${encodeURIComponent(id)}/revoke`, {
      reason,
    }),
  lookups: (q?: string) =>
    http.get<BillingLookups>('/admin/billing/lookups', { query: { q: q?.trim() || undefined } }),
  /** All invoices, newest first — server-paginated, filterable by status and source. */
  listInvoices: (filters: InvoiceListFilters = {}) =>
    http.getPage<InvoiceListItem>('/admin/billing/invoices', {
      query: {
        status: filters.status || undefined,
        source: filters.source || undefined,
        page: filters.page,
        limit: filters.limit,
      },
    }),
  prices: () => http.get<AdminPriceList>('/admin/billing/prices'),
  setPrice: (body: SetPriceInput) => http.put<SetPriceInput>('/admin/billing/prices', body),
  createPlan: (body: PlanInput) => http.post<{ id: string }>('/admin/billing/plans', body),
  updatePlan: (planId: string, body: Partial<Omit<PlanInput, 'code'> & { active: boolean }>) =>
    http.patch<{ id: string }>(`/admin/billing/plans/${encodeURIComponent(planId)}`, body),
  plans: () => http.get<BillingPlan[]>('/billing/plans'),
  /** Links a plan to the teacher tier it guarantees (`null` clears it). */
  setPlanTier: (planId: string, tierId: string | null) =>
    http.patch<{ id: string; tierId: string | null }>(
      `/billing/plans/${encodeURIComponent(planId)}/tier`,
      { tierId },
    ),
  issueInvoice: (body: IssueInvoiceInput, idempotencyKey: string) =>
    http.post<Invoice>('/admin/billing/invoices', body, { idempotencyKey }),
  refund: (body: RefundInput, idempotencyKey: string) =>
    http.post<Refund>('/admin/billing/refunds', body, { idempotencyKey }),
  writeOffInvoice: (invoiceId: string, body: WriteOffInput, idempotencyKey: string) =>
    http.post<Invoice>(`/admin/billing/invoices/${invoiceId}/write-off`, body, { idempotencyKey }),
  promoCodes: () => http.get<PromoCode[]>('/admin/billing/promo-codes'),
  createPromoCode: (body: PromoCodeInput) =>
    http.post<PromoCode>('/admin/billing/promo-codes', body),
  updatePromoCode: (id: string, body: Partial<Omit<PromoCodeInput, 'code'>>) =>
    http.patch<PromoCode>(`/admin/billing/promo-codes/${encodeURIComponent(id)}`, body),
  deletePromoCode: (id: string) =>
    http.delete<{ id: string; deleted: boolean }>(
      `/admin/billing/promo-codes/${encodeURIComponent(id)}`,
    ),
  runDunning: (idempotencyKey: string) =>
    http.post<DunningResult>('/admin/billing/dunning/run', {}, { idempotencyKey }),
};

// ── Money input helpers ─────────────────────────────────────────────────────

/**
 * Parses a major-unit amount typed by an operator ("12", "12.5", "12.50") into integer
 * minor units without floating-point maths. Returns `null` for anything that is not a
 * plain non-negative amount with at most two decimals.
 */
export function parseMajorToMinor(input: string): number | null {
  const value = input.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RefundFormValues = {
  paymentId: string;
  amount: string;
  reason: string;
  maxRefundable?: string;
};
export type RefundErrors = Partial<
  Record<'paymentId' | 'amount' | 'reason' | 'maxRefundable', string>
>;

/** Mirrors `refundBody` (uuid, int ≥ 1, reason 3–2000) plus an optional operator-entered ceiling. */
export function validateRefund(values: RefundFormValues): {
  errors: RefundErrors;
  body?: RefundInput;
} {
  const errors: RefundErrors = {};
  const paymentId = values.paymentId.trim();
  if (!paymentId) errors.paymentId = 'Payment ID is required.';
  else if (!UUID_RE.test(paymentId)) errors.paymentId = 'Payment ID must be a UUID.';

  const amountMinor = parseMajorToMinor(values.amount);
  if (values.amount.trim() === '') errors.amount = 'Amount is required.';
  else if (amountMinor === null) errors.amount = 'Enter an amount like 12 or 12.50.';
  else if (amountMinor < 1) errors.amount = 'Refund must be greater than zero.';

  let ceiling: number | null = null;
  if (values.maxRefundable && values.maxRefundable.trim() !== '') {
    ceiling = parseMajorToMinor(values.maxRefundable);
    if (ceiling === null) errors.maxRefundable = 'Enter an amount like 30 or 30.00.';
  }
  if (!errors.amount && ceiling !== null && amountMinor !== null && amountMinor > ceiling) {
    errors.amount = 'Refund cannot exceed the amount still refundable on this payment.';
  }

  const reason = values.reason.trim();
  if (reason.length < 3) errors.reason = 'Reason must be at least 3 characters.';
  else if (reason.length > 2000) errors.reason = 'Reason must be at most 2000 characters.';

  if (Object.keys(errors).length > 0 || amountMinor === null) return { errors };
  return { errors, body: { paymentId, amountMinor, reason } };
}

export type InvoiceFormValues = { subscriptionId: string; discount: string };
export type InvoiceErrors = Partial<Record<'subscriptionId' | 'discount', string>>;

/** Mirrors `invoiceBody` (uuid, optional int ≥ 0). The ≤ subtotal rule is enforced by the API. */
export function validateInvoice(values: InvoiceFormValues): {
  errors: InvoiceErrors;
  body?: IssueInvoiceInput;
} {
  const errors: InvoiceErrors = {};
  const subscriptionId = values.subscriptionId.trim();
  if (!subscriptionId) errors.subscriptionId = 'Subscription ID is required.';
  else if (!UUID_RE.test(subscriptionId)) errors.subscriptionId = 'Subscription ID must be a UUID.';

  let discountMinor: number | undefined;
  if (values.discount.trim() !== '') {
    const parsed = parseMajorToMinor(values.discount);
    if (parsed === null) errors.discount = 'Enter a discount like 5 or 5.00, or leave it empty.';
    else discountMinor = parsed;
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    body: { subscriptionId, ...(discountMinor !== undefined ? { discountMinor } : {}) },
  };
}

export type WriteOffFormValues = { invoiceId: string; reason: string };
export type WriteOffErrors = Partial<Record<'invoiceId' | 'reason', string>>;

/** Mirrors `writeOffBody` (reason 3–2000) plus the invoice reference in the route param. */
export function validateWriteOff(values: WriteOffFormValues): {
  errors: WriteOffErrors;
  invoiceId?: string;
  body?: WriteOffInput;
} {
  const errors: WriteOffErrors = {};
  const invoiceId = values.invoiceId.trim();
  if (!invoiceId) errors.invoiceId = 'Invoice ID is required.';
  else if (!UUID_RE.test(invoiceId)) errors.invoiceId = 'Invoice ID must be a UUID.';

  const reason = values.reason.trim();
  if (reason.length < 3) errors.reason = 'Reason must be at least 3 characters.';
  else if (reason.length > 2000) errors.reason = 'Reason must be at most 2000 characters.';

  if (Object.keys(errors).length > 0) return { errors };
  return { errors, invoiceId, body: { reason } };
}
