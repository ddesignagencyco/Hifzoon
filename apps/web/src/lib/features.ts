/**
 * Build-time feature flags (`NEXT_PUBLIC_*` values are inlined by Next.js, so each flag
 * reads `process.env.NEXT_PUBLIC_…` directly — never through a dynamic key).
 */

/**
 * Subscriptions, checkout, invoices, refunds and dunning. Off until a payment provider is
 * integrated: only the exact string `'true'` enables it. Teacher payroll is not affected.
 */
export function billingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
}

/**
 * The public "Ask a question" form (`POST /faq`). Off until backend M31 adds a pending queue
 * and an answer field: today a submitted question can't be found by anyone. Flip to `true`
 * (or wire to an env flag) to bring the form back on the home page and `/resources`.
 */
export const FAQ_ASK_ENABLED: boolean = false;

/**
 * Class recording (start/stop in the room, the player on lesson cards). Off until a
 * recording bucket LiveKit Cloud can reach is set up (REQUIREMENTS R15).
 */
export function recordingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RECORDING_ENABLED === 'true';
}

/** Feature names a nav item or screen can depend on. */
export type FeatureKey = 'billing';

export function featureEnabled(feature: FeatureKey): boolean {
  switch (feature) {
    case 'billing':
      return billingEnabled();
  }
}
