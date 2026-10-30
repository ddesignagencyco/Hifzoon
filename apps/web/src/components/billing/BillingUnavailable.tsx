'use client';

import React from 'react';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';

/**
 * Shown in place of plans, subscriptions and checkout while `NEXT_PUBLIC_BILLING_ENABLED`
 * is off (no payment provider is integrated yet).
 */
export function BillingUnavailable({ audience = 'family' }: { audience?: 'family' | 'admin' }) {
  const family = audience === 'family';
  return (
    <>
      <PageHeader eyebrow="Billing" title={family ? 'Billing' : 'Billing console'} />
      <Card className="max-w-2xl">
        <EmptyState
          icon={<CreditCard className="w-6 h-6" aria-hidden />}
          title="Billing isn't available yet"
          description={
            family
              ? 'Online payments are not set up yet — the academy will contact you about fees. Your classes are not affected.'
              : 'Subscriptions, invoices, refunds and payment retries are switched off until a payment provider is connected. Teacher payroll is unaffected.'
          }
          action={
            family ? (
              <Link href="/parent" className="text-sm font-semibold text-green-800 hover:underline">
                Back to overview
              </Link>
            ) : (
              <Link href="/admin/payroll" className="text-sm font-semibold text-green-800 hover:underline">
                Go to payroll
              </Link>
            )
          }
        />
      </Card>
    </>
  );
}
