import { describe, it, expect } from 'vitest';
import { fetchPlans } from '@/lib/api/client';
import { mockApi, envelope } from '../helpers/fetch-mock';

const SERVER_PLAN = {
  id: 'plan-1',
  code: 'ONE_TO_ONE_3X',
  name: '1-to-1, 3 classes/week',
  classesPerWeek: 3,
  classMinutes: 30,
  roomType: 'ONE_TO_ONE',
  billingPeriod: 'MONTHLY',
  tier: { code: 'CERTIFIED', name: 'Certified', badgeIcon: '🎓', description: 'Ijazah holder' },
};

describe('fetchPlans', () => {
  it('maps the teacher tier and carries no price', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([SERVER_PLAN]) } });
    const [plan] = await fetchPlans();
    expect(plan.tier).toEqual(SERVER_PLAN.tier);
    expect(plan).not.toHaveProperty('pricesMinor');
    expect(plan.source).toBe('api');
  });

  it('keeps a plan with no tier', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([{ ...SERVER_PLAN, tier: null }]) } });
    const [plan] = await fetchPlans();
    expect(plan.tier).toBeNull();
  });

  it('describes features from the plan fields only', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([{ ...SERVER_PLAN, roomType: 'CIRCLE', classMinutes: 45 }]) } });
    const [plan] = await fetchPlans();
    expect(plan.type).toBe('CIRCLE');
    expect(plan.classDurationMins).toBe(45);
    expect(plan.features).toEqual(['3 live classes per week', '45 minutes per class', 'Small group circle', 'Billed monthly']);
  });

  it('throws when the API is unreachable', async () => {
    mockApi({ 'GET /billing/plans': { status: 503, body: { message: 'down' } } });
    await expect(fetchPlans()).rejects.toThrow('down');
  });

  it('returns no plans when none are offered', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([]) } });
    await expect(fetchPlans()).resolves.toEqual([]);
  });
});
