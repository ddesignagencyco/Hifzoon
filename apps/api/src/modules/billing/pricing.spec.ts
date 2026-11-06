import { computePrice, percentOf, readBreakdown, repriceKeepingDiscount } from './pricing';

const promo = (terms: { percentOff?: number; amountOffMinor?: number }) => ({
  promoCodeId: 'promo-1',
  code: 'WELCOME',
  percentOff: terms.percentOff ?? null,
  amountOffMinor: terms.amountOffMinor ?? null,
});

describe('pricing', () => {
  describe('percentOf', () => {
    it('rounds half up to the minor unit, in integers', () => {
      expect(percentOf(12_345, 15)).toBe(1_852); // 1851.75
      expect(percentOf(1_050, 10)).toBe(105);
      expect(percentOf(5, 10)).toBe(1); // 0.5 rounds up
      expect(percentOf(4, 10)).toBe(0); // 0.4 rounds down
      expect(percentOf(0, 50)).toBe(0);
    });

    it('refuses fractional or out-of-range inputs rather than guessing', () => {
      expect(() => percentOf(100.5, 10)).toThrow(RangeError);
      expect(() => percentOf(100, 12.5)).toThrow(RangeError);
      expect(() => percentOf(100, 101)).toThrow(RangeError);
      expect(() => percentOf(-1, 10)).toThrow(RangeError);
    });
  });

  describe('period discount', () => {
    it('charges monthly × months less the plan percentage on a prepaid plan', () => {
      const quarter = computePrice({
        monthlyMinor: 7_100,
        billingPeriod: 'QUARTERLY',
        periodDiscountPercent: 10,
      });
      expect(quarter).toMatchObject({
        months: 3,
        listMinor: 21_300,
        periodDiscountMinor: 2_130,
        periodPriceMinor: 19_170,
        finalMinor: 19_170,
        applied: null,
      });

      const half = computePrice({
        monthlyMinor: 3_333,
        billingPeriod: 'HALF_YEARLY',
        periodDiscountPercent: 15,
      });
      // 19,998 × 15% = 2,999.7 → 3,000
      expect(half).toMatchObject({
        listMinor: 19_998,
        periodDiscountMinor: 3_000,
        finalMinor: 16_998,
      });
    });

    it('ignores a percentage stored on a monthly plan', () => {
      const monthly = computePrice({
        monthlyMinor: 4_900,
        billingPeriod: 'MONTHLY',
        periodDiscountPercent: 20,
      });
      expect(monthly).toMatchObject({ periodDiscountPercent: 0, finalMinor: 4_900 });
    });
  });

  describe('sibling discount', () => {
    it('takes the percentage off the period price', () => {
      const p = computePrice({ monthlyMinor: 8_900, billingPeriod: 'MONTHLY', siblingPercent: 10 });
      expect(p).toMatchObject({
        sibling: { percent: 10, amountMinor: 890 },
        applied: 'SIBLING',
        finalMinor: 8_010,
      });
    });
  });

  describe('promo codes', () => {
    it('takes a percentage off the period price', () => {
      const p = computePrice({
        monthlyMinor: 4_900,
        billingPeriod: 'MONTHLY',
        promo: promo({ percentOff: 25 }),
      });
      expect(p).toMatchObject({ applied: 'PROMO', extraDiscountMinor: 1_225, finalMinor: 3_675 });
    });

    it('takes a fixed amount off, never below zero', () => {
      const p = computePrice({
        monthlyMinor: 1_000,
        billingPeriod: 'MONTHLY',
        promo: promo({ amountOffMinor: 2_500 }),
      });
      expect(p).toMatchObject({ extraDiscountMinor: 1_000, finalMinor: 0 });
    });
  });

  describe('combining (period first, then the larger of sibling vs promo)', () => {
    it('measures sibling and promo on the price after the period discount', () => {
      const p = computePrice({
        monthlyMinor: 10_000,
        billingPeriod: 'QUARTERLY',
        periodDiscountPercent: 10, // 30,000 → 27,000
        siblingPercent: 10, // 2,700
        promo: promo({ percentOff: 15 }), // 4,050
      });
      expect(p).toMatchObject({
        periodPriceMinor: 27_000,
        sibling: { amountMinor: 2_700 },
        promo: expect.objectContaining({ amountMinor: 4_050 }),
        applied: 'PROMO',
        extraDiscountMinor: 4_050,
        finalMinor: 22_950,
      });
    });

    it('does not stack sibling and promo: the sibling discount wins when larger', () => {
      const p = computePrice({
        monthlyMinor: 10_000,
        billingPeriod: 'MONTHLY',
        siblingPercent: 20,
        promo: promo({ amountOffMinor: 500 }),
      });
      expect(p).toMatchObject({ applied: 'SIBLING', extraDiscountMinor: 2_000, finalMinor: 8_000 });
    });

    it('keeps the promo code unused on a tie by taking the sibling discount', () => {
      const p = computePrice({
        monthlyMinor: 10_000,
        billingPeriod: 'MONTHLY',
        siblingPercent: 10,
        promo: promo({ percentOff: 10 }),
      });
      expect(p.applied).toBe('SIBLING');
    });

    it('rounds each step once, so the parts always add up to the final price', () => {
      const p = computePrice({
        monthlyMinor: 3_333,
        billingPeriod: 'QUARTERLY',
        periodDiscountPercent: 7,
        siblingPercent: 13,
      });
      expect(p.listMinor - p.periodDiscountMinor - p.extraDiscountMinor).toBe(p.finalMinor);
      expect(Number.isInteger(p.finalMinor)).toBe(true);
    });
  });

  describe('re-pricing a live subscription', () => {
    it('keeps the sibling or promo discount as the same amount on the new recurring price', () => {
      const sold = computePrice({
        monthlyMinor: 5_000,
        billingPeriod: 'MONTHLY',
        siblingPercent: 10,
      });
      const next = computePrice({ monthlyMinor: 8_000, billingPeriod: 'MONTHLY' });

      expect(repriceKeepingDiscount(sold, next)).toMatchObject({
        periodPriceMinor: 8_000,
        applied: 'SIBLING',
        extraDiscountMinor: 500,
        finalMinor: 7_500,
      });
      expect(repriceKeepingDiscount(null, next).finalMinor).toBe(8_000);
    });

    it('reads back only a real stored breakdown', () => {
      expect(readBreakdown(null)).toBeNull();
      expect(readBreakdown({ trialOutcomeId: 'x' })).toBeNull();
      const p = computePrice({ monthlyMinor: 1_000, billingPeriod: 'MONTHLY' });
      expect(readBreakdown(JSON.parse(JSON.stringify(p)))).toEqual(p);
    });
  });
});
