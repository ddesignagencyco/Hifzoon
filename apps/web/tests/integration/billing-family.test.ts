import { describe, it, expect, afterAll } from 'vitest';
import { billingFamilyApi, BillingPlan, Subscription, priceIn } from '@/lib/api/modules/billing-family';
import { http, newIdempotencyKey } from '@/lib/api/http';
import { actAs, actAsAnonymous, API_URL, SEED } from '../helpers/live';

/**
 * Family billing against the live, seeded API (fake payment provider).
 * The subscription created here is cancelled at the end so the family is left
 * with no live subscription.
 */
describe('live API — family billing', () => {
  let plans: BillingPlan[] = [];
  let subscription: Subscription | null = null;

  afterAll(async () => {
    // Safety net: never leave a live subscription behind if an assertion failed midway.
    if (subscription && subscription.status !== 'CANCELLED') {
      await actAs('guardian');
      await billingFamilyApi.cancel(subscription.id, false).catch(() => undefined);
    }
    actAsAnonymous();
  });

  it('guardian reads the family (GBP), billing view and plan catalogue', async () => {
    await actAs('guardian');
    const [families, billing, catalogue] = await Promise.all([
      billingFamilyApi.families(),
      billingFamilyApi.family(),
      billingFamilyApi.plans(),
    ]);
    const family = families.find((f) => f.id === SEED.familyId);
    expect(family?.currency).toBe('GBP');
    expect(Array.isArray(billing.subscriptions)).toBe(true);
    expect(Array.isArray(billing.invoices)).toBe(true);
    expect(catalogue.length).toBeGreaterThanOrEqual(3);
    for (const plan of catalogue) {
      expect(priceIn(plan, 'GBP')?.amountMinor).toBeGreaterThan(0);
      expect(plan.prices.length).toBeGreaterThanOrEqual(6);
    }
    plans = catalogue;
  });

  it('narrows plan prices to one currency', async () => {
    actAsAnonymous();
    const gbp = await billingFamilyApi.plans('GBP');
    expect(gbp.every((p) => p.prices.every((price) => price.currency === 'GBP'))).toBe(true);
  });

  it('subscribes, pauses, resumes and cancels at period end, then immediately', async () => {
    await actAs('guardian');
    const plan = plans[0];
    subscription = await billingFamilyApi.subscribe(
      { familyId: SEED.familyId, planId: plan.id, currency: 'GBP' },
      newIdempotencyKey(),
    );
    expect(subscription.status).toBe('ACTIVE');
    expect(subscription.currency).toBe('GBP');
    expect(subscription.currentPeriodEnd).toBeTruthy();

    const billing = await billingFamilyApi.family();
    const listed = billing.subscriptions.find((s) => s.id === subscription!.id);
    expect(listed?.plan.name).toBe(plan.name);

    const paused = await billingFamilyApi.pause(subscription.id, 7);
    expect(paused.status).toBe('PAUSED');
    expect(paused.pausedUntil).toBeTruthy();

    const resumed = await billingFamilyApi.resume(subscription.id);
    expect(resumed.status).toBe('ACTIVE');
    expect(resumed.pausedUntil).toBeNull();

    await expect(billingFamilyApi.resume(subscription.id)).rejects.toThrow(/not paused/);
    await expect(billingFamilyApi.pause(subscription.id, 31)).rejects.toMatchObject({ status: 400 });

    const atEnd = await billingFamilyApi.cancel(subscription.id, true);
    expect(atEnd.cancelAtPeriodEnd).toBe(true);
    expect(atEnd.status).toBe('ACTIVE');

    subscription = await billingFamilyApi.cancel(subscription.id, false);
    expect(subscription.status).toBe('CANCELLED');
    await expect(billingFamilyApi.cancel(subscription.id)).rejects.toMatchObject({ status: 409 });
  });

  it('starts a hosted checkout for an open invoice (fake provider returns a redirect URL)', async () => {
    // Invoices are issued by operations; issue one for a fresh subscription, then pay as the guardian.
    await actAs('guardian');
    const sub = await billingFamilyApi.subscribe({ familyId: SEED.familyId, planId: plans[0].id, currency: 'GBP' });
    subscription = sub;

    await actAs('admin');
    const invoice = await http.post<{ id: string; status: string; totalMinor: number; currency: string }>(
      '/admin/billing/invoices',
      { subscriptionId: sub.id },
    );
    expect(invoice.status).toBe('OPEN');
    expect(invoice.currency).toBe('GBP');

    await actAs('guardian');
    const billing = await billingFamilyApi.family();
    expect(billing.invoices.find((i) => i.id === invoice.id)?.totalMinor).toBe(invoice.totalMinor);

    const key = newIdempotencyKey();
    const successUrl = 'http://localhost:3000/parent/billing/checkout/success';
    const session = await billingFamilyApi.checkout(
      { invoiceId: invoice.id, successUrl, cancelUrl: 'http://localhost:3000/parent/billing/checkout/cancelled' },
      key,
    );
    expect(session.sessionId).toBeTruthy();
    expect(session.url.startsWith(successUrl)).toBe(true);

    // The backend refuses a checkout without an Idempotency-Key.
    const { token } = await actAs('guardian');
    const raw = await fetch(`${API_URL}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ invoiceId: invoice.id, successUrl, cancelUrl: successUrl }),
    });
    expect(raw.status).toBe(400);

    subscription = await billingFamilyApi.cancel(sub.id, false);
    expect(subscription.status).toBe('CANCELLED');
  });
});
