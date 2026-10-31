'use client';

import { InvoicesConsole } from '@/components/admin/finance/BillingConsole';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function AdminInvoicesPage() {
  return billingEnabled() ? <InvoicesConsole /> : <BillingUnavailable audience="admin" />;
}
