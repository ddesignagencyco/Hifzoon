'use client';

import { BillingConsole } from '@/components/admin/finance/BillingConsole';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function AdminBillingPage() {
  return billingEnabled() ? <BillingConsole /> : <BillingUnavailable audience="admin" />;
}
