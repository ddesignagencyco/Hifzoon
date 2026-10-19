import { DUNNING_RETRY_DAYS } from '@hifzoon/shared';

import { type SettingsService } from '../settings/settings.service';

/**
 * Billing decisions that **both** the request path and the worker need to agree on.
 *
 * These two read the same invoice table from different processes, so a rule implemented
 * twice is a rule that will drift: `BillingService.runDunning` (manual admin nudge) and
 * `BillingProcessor.scheduleRetries` (the nightly sweep) must produce byte-identical
 * ladders and the same `provider` code, or the same family gets a different number of
 * retries depending on which one happened to run.
 */

/**
 * The `PaymentProviderCode` a payment row should carry, derived from the *selected*
 * adapter rather than hardcoded. Local dev runs the fake adapter (→ `OTHER`); a real
 * Stripe or PayPal deployment records the matching code, so the stored value is never a
 * lie about who processed the charge.
 */
export function paymentProviderCode(providerName: string): 'STRIPE' | 'PAYPAL' | 'OTHER' {
  const name = providerName.toLowerCase();
  if (name.includes('stripe')) return 'STRIPE';
  if (name.includes('paypal')) return 'PAYPAL';
  return 'OTHER';
}

/**
 * The dunning retry ladder in *days from the failure* (FR-BIL-05).
 *
 * `billing.dunning_retry_days` is a **count**, not a schedule: it says how many rungs of
 * the ladder to walk, while `DUNNING_RETRY_DAYS` supplies the spacing (1, 3, 7). Reading
 * the count as a list of day offsets is the mistake that produces "retry in 1 day,
 * 2 days, 3 days" — three retries inside the first week, hammering a family who has
 * already declined.
 *
 * The count is clamped to the number of available offsets. An operator asking for ten
 * retries cannot get a ladder that runs off the end of the array; `0` is honoured and
 * means cancel on the first failure, which is a legitimate (if aggressive) policy.
 */
export async function dunningLadder(settings: SettingsService): Promise<number[]> {
  const configured = await settings.getNumber('billing.dunning_retry_days');
  if (!Number.isFinite(configured)) return [...DUNNING_RETRY_DAYS];
  const count = Math.min(Math.max(Math.trunc(configured), 0), DUNNING_RETRY_DAYS.length);
  return DUNNING_RETRY_DAYS.slice(0, count);
}
