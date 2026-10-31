'use client';

import { Suspense } from 'react';
import { CheckoutReturn } from '@/components/billing/CheckoutReturn';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function CheckoutReturnPage() {
  if (!billingEnabled()) return <BillingUnavailable />;
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <CheckoutReturn outcome="cancelled" />
    </Suspense>
  );
}
