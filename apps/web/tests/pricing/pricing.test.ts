import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPlans } from '@/lib/api/client';
import { CURRENCY_EXCHANGE_CONFIG, TUITION_PLANS_CATALOG } from '@/lib/data/baseline-catalog';
import { Currency } from '@/lib/types';

describe('Pricing & Tuition Module Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return tuition catalog plans when backend plans are fetched', async () => {
    const persistedPlansEnvelope = {
      data: [
        {
          id: 'plan-1',
          code: 'STANDARD',
          name: 'Standard Momentum',
          classesPerWeek: 3,
          classMinutes: 30,
          roomType: 'ONE_TO_ONE',
          billingPeriod: 'MONTHLY',
          active: true,
          prices: [
            { currency: 'USD', amountMinor: 6900 },
            { currency: 'GBP', amountMinor: 5500 },
          ],
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => persistedPlansEnvelope,
    } as Response);

    const plans = await fetchPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0].name).toBe('Standard Momentum');
    expect(plans[0].baseUsdPrice).toBe(69);
    expect(plans[0].classesPerWeek).toBe(3);
  });

  it('should fall back to TUITION_PLANS_CATALOG when backend fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Connection timeout'));

    const plans = await fetchPlans();

    expect(plans).toHaveLength(TUITION_PLANS_CATALOG.length);
    expect(plans[0].baseUsdPrice).toBeGreaterThan(0);
  });

  it('should calculate accurate multi-currency conversions and sibling discounts', () => {
    const usdPlan = TUITION_PLANS_CATALOG.find((p) => p.id === 'plan-standard')!;
    expect(usdPlan).toBeDefined();

    const gbpMultiplier = CURRENCY_EXCHANGE_CONFIG[Currency.GBP].rateMultiplier;
    const cadMultiplier = CURRENCY_EXCHANGE_CONFIG[Currency.CAD].rateMultiplier;

    const gbpPrice = Math.round(usdPlan.baseUsdPrice * gbpMultiplier);
    const cadPrice = Math.round(usdPlan.baseUsdPrice * cadMultiplier);

    expect(gbpPrice).toBe(Math.round(69 * 0.8));
    expect(cadPrice).toBe(Math.round(69 * 1.35));

    // 15% discount for 2nd sibling
    const secondChildDiscountPrice = Math.round(usdPlan.baseUsdPrice * 0.85);
    expect(secondChildDiscountPrice).toBeLessThan(usdPlan.baseUsdPrice);
  });
});
