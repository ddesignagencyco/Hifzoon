import { describe, it, expect } from 'vitest';
import { fetchPlans } from '@/lib/api/client';
import { TUITION_PLANS_CATALOG } from '@/lib/data/baseline-catalog';
import { DISPLAY_CURRENCY, planPrice } from '@/components/home/PlanPriceGrid';
import { Currency } from '@/lib/types';
import { mockApi, envelope } from '../helpers/fetch-mock';

const SERVER_PLAN = {
  id: 'plan-1',
  code: 'ONE_TO_ONE_3X',
  name: '1-to-1, 3 classes/week',
  classesPerWeek: 3,
  classMinutes: 30,
  roomType: 'ONE_TO_ONE',
  billingPeriod: 'MONTHLY',
  active: true,
  prices: [
    { id: 'p1', planId: 'plan-1', currency: 'USD', amountMinor: 6900 },
    { id: 'p2', planId: 'plan-1', currency: 'GBP', amountMinor: 5500 },
    { id: 'p3', planId: 'plan-1', currency: 'XXX', amountMinor: 1 },
  ],
};

describe('fetchPlans', () => {
  it('uses the stored price for each currency (no multipliers)', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([SERVER_PLAN]) } });
    const [plan] = await fetchPlans();
    expect(plan.pricesMinor).toEqual({ USD: 6900, GBP: 5500 });
    // The site shows USD only: the plan's USD row, never a conversion of another currency.
    expect(DISPLAY_CURRENCY).toBe(Currency.USD);
    expect(planPrice(plan)).toBe(6900);
    expect(planPrice(plan, Currency.GBP)).toBe(5500);
    expect(planPrice({ ...plan, pricesMinor: { GBP: 5500 } })).toBeNull();
    expect(plan.source).toBe('api');
  });

  it('describes features from the plan fields only', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([{ ...SERVER_PLAN, roomType: 'CIRCLE', classMinutes: 45 }]) } });
    const [plan] = await fetchPlans();
    expect(plan.type).toBe('CIRCLE');
    expect(plan.classDurationMins).toBe(45);
    expect(plan.features).toEqual(['3 live classes per week', '45 minutes per class', 'Small group circle', 'Billed monthly']);
    expect(plan.features.join(' ')).not.toMatch(/sibling|discount|%/i);
  });

  it('falls back to the baseline catalogue (USD only) when the API is unreachable', async () => {
    mockApi({ 'GET /billing/plans': { status: 503, body: { message: 'down' } } });
    const plans = await fetchPlans();
    expect(plans).toHaveLength(TUITION_PLANS_CATALOG.length);
    expect(plans.every((p) => p.source === 'baseline')).toBe(true);
    expect(Object.keys(plans[0].pricesMinor)).toEqual(['USD']);
    expect(planPrice(plans[0])).toBe(plans[0].pricesMinor.USD);
  });
});
