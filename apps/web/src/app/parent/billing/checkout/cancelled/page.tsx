'use client';

import { CheckoutReturn } from '@/components/billing/CheckoutReturn';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function CheckoutReturnPage() {
  return billingEnabled() ? <CheckoutReturn outcome="cancelled" /> : <BillingUnavailable />;
}
