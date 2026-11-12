/**
 * The price a family pays for one billing period, and how it was reached.
 *
 * How the discounts combine (decided with the owner, Nov 2026):
 *
 *   1. **Period discount first.** `PlanPrice` is the monthly price for every plan. A
 *      prepaid plan costs monthly × months, less the plan's `periodDiscountPercent`.
 *   2. **Then the larger of sibling vs promo — they never stack.** Both are measured on
 *      the period price from step 1. On a tie the sibling discount wins, so the family's
 *      promo code is not used up for nothing.
 *   3. **Never below zero.**
 *
 * Every figure is an integer in minor units. Percentages are whole numbers, so
 * `amount × percent` is an exact integer and the one rounding step (half up, to the
 * minor unit) happens in integer arithmetic with no float in between.
 *
 * The result is stored on the subscription (`discountBreakdown`) and its `finalMinor` is
 * the locked `amountMinor` every later invoice bills.
 */

export const MAX_DISCOUNT_PERCENT = 50;

/**
 * The one currency every price is set in and every family is billed in (owner decision,
 * Nov 2026). Stripe Adaptive Pricing shows the customer their local currency at checkout;
 * we still charge, and record, USD. Older subscriptions and invoices keep the currency they
 * were sold in, as history.
 */
export const BILLING_CURRENCY = 'USD' as const;

export const PERIOD_MONTHS = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6 } as const;
export type BillingPeriodCode = keyof typeof PERIOD_MONTHS;

/** A validated promo code's terms, as applied to one subscription. */
export interface PromoTerms {
  promoCodeId: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: number | null;
}

export interface PriceBreakdown {
  monthlyMinor: number;
  months: number;
  /** monthly × months, before any discount. */
  listMinor: number;
  periodDiscountPercent: number;
  periodDiscountMinor: number;
  /** After the period discount: what is sent to the provider as the recurring price. */
  periodPriceMinor: number;
  sibling: { percent: number; amountMinor: number } | null;
  promo: (PromoTerms & { amountMinor: number }) | null;
  /** Which of sibling or promo was taken (never both). */
  applied: 'SIBLING' | 'PROMO' | null;
  /** The sibling or promo discount taken; charged as a provider coupon. */
  extraDiscountMinor: number;
  finalMinor: number;
}

/** `percent`% of `amountMinor`, rounded half up to the minor unit, in integer arithmetic. */
export function percentOf(amountMinor: number, percent: number): number {
  assertMinor(amountMinor, 'amount');
  assertPercent(percent);
  return Math.floor((amountMinor * percent + 50) / 100);
}

export function computePrice(input: {
  monthlyMinor: number;
  /** A `BillingPeriodCode`; anything else is treated as monthly. */
  billingPeriod: string;
  periodDiscountPercent?: number;
  /** The academy's sibling percent when the family qualifies, else 0. */
  siblingPercent?: number;
  promo?: PromoTerms | null;
}): PriceBreakdown {
  assertMinor(input.monthlyMinor, 'monthly price');
  const months = PERIOD_MONTHS[input.billingPeriod as BillingPeriodCode] ?? 1;
  const listMinor = input.monthlyMinor * months;
  // A monthly plan has nothing prepaid to reward, whatever is stored on it.
  const periodDiscountPercent = months > 1 ? (input.periodDiscountPercent ?? 0) : 0;
  const periodDiscountMinor = percentOf(listMinor, periodDiscountPercent);
  const periodPriceMinor = listMinor - periodDiscountMinor;

  const siblingPercent = input.siblingPercent ?? 0;
  const sibling =
    siblingPercent > 0
      ? { percent: siblingPercent, amountMinor: percentOf(periodPriceMinor, siblingPercent) }
      : null;

  let promo: PriceBreakdown['promo'] = null;
  if (input.promo) {
    const { percentOff, amountOffMinor } = input.promo;
    const amountMinor =
      percentOff !== null
        ? percentOf(periodPriceMinor, percentOff)
        : Math.min(periodPriceMinor, amountOffMinor ?? 0);
    promo = { ...input.promo, amountMinor };
  }

  const siblingMinor = sibling?.amountMinor ?? 0;
  const promoMinor = promo?.amountMinor ?? 0;
  const applied: PriceBreakdown['applied'] =
    siblingMinor === 0 && promoMinor === 0 ? null : promoMinor > siblingMinor ? 'PROMO' : 'SIBLING';
  const extraDiscountMinor = Math.max(siblingMinor, promoMinor);

  return {
    monthlyMinor: input.monthlyMinor,
    months,
    listMinor,
    periodDiscountPercent,
    periodDiscountMinor,
    periodPriceMinor,
    sibling,
    promo,
    applied,
    extraDiscountMinor,
    finalMinor: Math.max(0, periodPriceMinor - extraDiscountMinor),
  };
}

/**
 * The same subscription's price after its recurring price changes (a plan change or a new
 * teacher tier). The sibling or promo discount it was sold with is kept as the same
 * amount, because that amount is what the provider coupon takes off every period.
 */
export function repriceKeepingDiscount(
  previous: PriceBreakdown | null | undefined,
  next: PriceBreakdown,
): PriceBreakdown {
  const extraDiscountMinor = previous?.extraDiscountMinor ?? 0;
  return {
    ...next,
    sibling: previous?.sibling ?? null,
    promo: previous?.promo ?? null,
    applied: previous?.applied ?? null,
    extraDiscountMinor,
    finalMinor: Math.max(0, next.periodPriceMinor - extraDiscountMinor),
  };
}

/** Reads a stored breakdown back, tolerating rows written before it existed. */
export function readBreakdown(value: unknown): PriceBreakdown | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Partial<PriceBreakdown>;
  return typeof b.finalMinor === 'number' && typeof b.periodPriceMinor === 'number'
    ? (b as PriceBreakdown)
    : null;
}

export function assertPercent(percent: number, max = 100): void {
  if (!Number.isInteger(percent) || percent < 0 || percent > max) {
    throw new RangeError(`A percentage must be a whole number from 0 to ${max}; got ${percent}`);
  }
}

function assertMinor(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`The ${label} must be whole minor units, not ${amount}`);
  }
}
