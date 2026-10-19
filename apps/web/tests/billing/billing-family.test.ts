import { describe, it, expect } from 'vitest';
import {
  billingFamilyApi,
  canCancel,
  canPause,
  canResume,
  FamilySubscription,
  Invoice,
  isPayable,
  isSafeCheckoutUrl,
  outstandingMinor,
  periodLabel,
  priceIn,
  validatePauseDays,
} from '@/lib/api/modules/billing-family';
import { ApiClientError } from '@/lib/api/http';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';

const SUB_ID = '01a13f96-0000-7000-8000-00000000aaaa';

const subscription = (over: Partial<FamilySubscription> = {}): FamilySubscription => ({
  id: SUB_ID,
  familyId: 'fam',
  planId: 'plan',
  currency: 'GBP',
  status: 'ACTIVE',
  providerSubscriptionId: 'fake-sub-1',
  currentPeriodStart: '2026-10-01T00:00:00Z',
  currentPeriodEnd: '2026-10-31T00:00:00Z',
  pausedUntil: null,
  cancelAtPeriodEnd: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  plan: { code: 'ONE_3X', name: '1:1, 3/week', classesPerWeek: 3 },
  ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: 'inv',
  familyId: 'fam',
  subscriptionId: SUB_ID,
  number: 'INV-2026-ABCD1234',
  currency: 'GBP',
  subtotalMinor: 5500,
  discountMinor: 0,
  totalMinor: 5500,
  status: 'OPEN',
  dueAt: '2026-10-20T00:00:00Z',
  paidAt: null,
  pdfUrl: null,
  createdAt: '2026-10-13T00:00:00Z',
  updatedAt: '2026-10-13T00:00:00Z',
  ...over,
});

describe('billing-family API module', () => {
  it('GETs the public plan catalogue, optionally narrowed by currency', async () => {
    const api = mockApi({
      'GET /billing/plans': { body: envelope([{ id: 'p1', name: 'Plan', prices: [] }]) },
    });
    const all = await billingFamilyApi.plans();
    await billingFamilyApi.plans('GBP');
    expect(all[0].id).toBe('p1');
    expect(api.calls[0].method).toBe('GET');
    expect(api.calls[0].url).toMatch(/\/billing\/plans$/);
    expect(api.calls[1].url).toContain('/billing/plans?currency=GBP');
  });

  it('GETs the family billing view and the families list', async () => {
    const api = mockApi({
      'GET /billing/family': { body: envelope({ subscriptions: [subscription()], invoices: [invoice()] }) },
      'GET /families': { body: envelope([{ id: 'fam', name: 'Khan Family', currency: 'GBP' }]) },
    });
    const billing = await billingFamilyApi.family();
    const families = await billingFamilyApi.families();
    expect(billing.subscriptions[0].plan.name).toBe('1:1, 3/week');
    expect(billing.invoices[0].number).toBe('INV-2026-ABCD1234');
    expect(families[0].currency).toBe('GBP');
    expect(api.calls.map((c) => c.method)).toEqual(['GET', 'GET']);
  });

  it('POSTs checkout with the body and the caller-supplied Idempotency-Key', async () => {
    const api = mockApi({
      'POST /billing/checkout': {
        body: envelope({ provider: 'fake', sessionId: 'cs_1', url: 'https://pay.example/cs_1' }),
      },
    });
    const input = { invoiceId: 'inv', successUrl: 'https://app/s', cancelUrl: 'https://app/c' };
    const session = await billingFamilyApi.checkout(input, 'key-123');
    await billingFamilyApi.checkout(input, 'key-123');

    expect(session.url).toBe('https://pay.example/cs_1');
    expect(api.calls[0].method).toBe('POST');
    expect(api.calls[0].body).toEqual(input);
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('key-123');
    // A retry of the same intent reuses the key.
    expect(api.calls[1].headers.get('Idempotency-Key')).toBe('key-123');
  });

  it('always sends an Idempotency-Key on checkout, generating one when omitted', async () => {
    const api = mockApi({ 'POST /billing/checkout': { body: envelope({ provider: 'fake', sessionId: 's', url: 'https://x' }) } });
    await billingFamilyApi.checkout({ invoiceId: 'inv', successUrl: 'https://a', cancelUrl: 'https://b' });
    expect(api.calls[0].headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('surfaces checkout conflicts (already paid) as ApiClientError', async () => {
    mockApi({ 'POST /billing/checkout': apiError(409, 'CONFLICT', 'Invoice is already paid') });
    const promise = billingFamilyApi.checkout({ invoiceId: 'inv', successUrl: 'https://a', cancelUrl: 'https://b' }, 'k');
    await expect(promise).rejects.toBeInstanceOf(ApiClientError);
    await expect(
      billingFamilyApi.checkout({ invoiceId: 'inv', successUrl: 'https://a', cancelUrl: 'https://b' }, 'k'),
    ).rejects.toThrow('Invoice is already paid');
  });

  it('POSTs subscribe with familyId/planId/currency and an optional Idempotency-Key', async () => {
    const api = mockApi({ 'POST /billing/subscribe': (call) => ({ body: envelope({ id: 's1', ...(call.body as object) }) }) });
    const body = { familyId: 'fam', planId: 'plan', currency: 'GBP' };
    const created = await billingFamilyApi.subscribe(body, 'sub-key');
    await billingFamilyApi.subscribe(body);

    expect(created.id).toBe('s1');
    expect(api.calls[0].body).toEqual(body);
    expect(api.calls[0].headers.get('Idempotency-Key')).toBe('sub-key');
    expect(api.calls[1].headers.get('Idempotency-Key')).toBeNull();
  });

  it('surfaces a missing plan price on subscribe', async () => {
    mockApi({ 'POST /billing/subscribe': apiError(404, 'NOT_FOUND', 'Plan price in XYZ not found') });
    await expect(billingFamilyApi.subscribe({ familyId: 'f', planId: 'p', currency: 'XYZ' })).rejects.toThrow(
      'Plan price in XYZ not found',
    );
  });

  it('POSTs cancel with atPeriodEnd (defaulting to true)', async () => {
    const api = mockApi({
      [`POST /billing/subscriptions/${SUB_ID}/cancel`]: { body: envelope(subscription({ cancelAtPeriodEnd: true })) },
    });
    await billingFamilyApi.cancel(SUB_ID);
    await billingFamilyApi.cancel(SUB_ID, false);
    expect(api.calls[0].url).toContain(`/billing/subscriptions/${SUB_ID}/cancel`);
    expect(api.calls[0].body).toEqual({ atPeriodEnd: true });
    expect(api.calls[1].body).toEqual({ atPeriodEnd: false });
  });

  it('surfaces cancelling an already-cancelled subscription', async () => {
    mockApi({ [`POST /billing/subscriptions/${SUB_ID}/cancel`]: apiError(409, 'CONFLICT', 'Subscription is already cancelled') });
    await expect(billingFamilyApi.cancel(SUB_ID)).rejects.toThrow('Subscription is already cancelled');
  });

  it('POSTs pause with days and resume with an empty body', async () => {
    const api = mockApi({
      [`POST /billing/subscriptions/${SUB_ID}/pause`]: { body: envelope(subscription({ status: 'PAUSED' })) },
      [`POST /billing/subscriptions/${SUB_ID}/resume`]: { body: envelope(subscription()) },
    });
    const paused = await billingFamilyApi.pause(SUB_ID, 14);
    const resumed = await billingFamilyApi.resume(SUB_ID);
    expect(paused.status).toBe('PAUSED');
    expect(resumed.status).toBe('ACTIVE');
    expect(api.calls[0].body).toEqual({ days: 14 });
    expect(api.calls[1].method).toBe('POST');
    expect(api.calls[1].body).toEqual({});
  });

  it('surfaces pause validation and resume conflicts', async () => {
    mockApi({
      [`POST /billing/subscriptions/${SUB_ID}/pause`]: apiError(400, 'VALIDATION_FAILED', 'A pause must be between 1 and 30 days'),
      [`POST /billing/subscriptions/${SUB_ID}/resume`]: apiError(409, 'CONFLICT', 'Subscription is ACTIVE, not paused'),
    });
    await expect(billingFamilyApi.pause(SUB_ID, 31)).rejects.toThrow('between 1 and 30');
    await expect(billingFamilyApi.resume(SUB_ID)).rejects.toThrow('not paused');
  });
});

describe('billing-family helpers', () => {
  it('finds a plan price in a currency', () => {
    const plan = { prices: [{ currency: 'GBP', amountMinor: 5500 }, { currency: 'USD', amountMinor: 6900 }] } as never;
    expect(priceIn(plan, 'GBP')?.amountMinor).toBe(5500);
    expect(priceIn(plan, 'AED')).toBeUndefined();
  });

  it('labels billing periods', () => {
    expect(periodLabel('MONTHLY')).toBe('month');
    expect(periodLabel('QUARTERLY')).toBe('quarter');
    expect(periodLabel('HALF_YEARLY')).toBe('6 months');
  });

  it('gates subscription actions by status', () => {
    expect(canPause(subscription())).toBe(true);
    expect(canPause(subscription({ cancelAtPeriodEnd: true }))).toBe(false);
    expect(canResume(subscription({ status: 'PAUSED' }))).toBe(true);
    expect(canResume(subscription())).toBe(false);
    expect(canCancel(subscription({ status: 'CANCELLED' }))).toBe(false);
    expect(canCancel(subscription({ cancelAtPeriodEnd: true }))).toBe(false);
    expect(canCancel(subscription({ status: 'PAUSED' }))).toBe(true);
  });

  it('sums outstanding invoices in one currency only', () => {
    const rows = [
      invoice({ id: 'a', totalMinor: 5500 }),
      invoice({ id: 'b', status: 'FAILED', totalMinor: 1000 }),
      invoice({ id: 'c', status: 'PAID', totalMinor: 9999 }),
      invoice({ id: 'd', currency: 'USD', totalMinor: 7000 }),
    ];
    expect(outstandingMinor(rows, 'GBP')).toBe(6500);
    expect(isPayable(invoice({ status: 'VOID' }))).toBe(false);
  });

  it('validates pause days to the backend rule (int 1..30)', () => {
    expect(validatePauseDays(1)).toBeNull();
    expect(validatePauseDays(30)).toBeNull();
    expect(validatePauseDays(0)).toMatch(/between 1 and 30/);
    expect(validatePauseDays(31)).toMatch(/between 1 and 30/);
    expect(validatePauseDays(2.5)).toMatch(/between 1 and 30/);
    expect(validatePauseDays(Number.NaN)).toMatch(/between 1 and 30/);
  });

  it('only follows http(s) checkout URLs', () => {
    expect(isSafeCheckoutUrl('https://checkout.stripe.com/c/1')).toBe(true);
    expect(isSafeCheckoutUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeCheckoutUrl('not a url')).toBe(false);
  });
});
