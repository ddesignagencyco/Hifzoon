'use client';

import { FamilyBillingScreen } from '@/components/billing/FamilyBillingScreen';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function ParentBillingPage() {
  return billingEnabled() ? <FamilyBillingScreen /> : <BillingUnavailable />;
}
