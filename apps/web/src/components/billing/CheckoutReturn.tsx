'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui/primitives';
import { billingKeys } from '@/hooks/useBilling';

/**
 * Landing page after the hosted checkout. The invoice is only marked paid when the
 * payment provider's webhook arrives, so this page never claims the invoice is settled.
 */
export function CheckoutReturn({ outcome }: { outcome: 'success' | 'cancelled' }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: billingKeys.family });
  }, [queryClient]);

  const success = outcome === 'success';
  return (
    <>
      <PageHeader eyebrow="Billing" title={success ? 'Payment submitted' : 'Payment cancelled'} />
      <Card className="p-6 max-w-xl">
        <div className="flex items-start gap-3">
          {success ? (
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" aria-hidden />
          ) : (
            <XCircle className="w-6 h-6 text-amber shrink-0" aria-hidden />
          )}
          <div className="space-y-2 text-sm text-ink-2">
            {success ? (
              <p>
                Thank you. Your payment has been handed to our payment provider. The invoice will show as{' '}
                <strong>Paid</strong> as soon as the provider confirms it — this can take a few minutes.
              </p>
            ) : (
              <p>No payment was taken. Your invoice is still open and you can pay it at any time from Billing.</p>
            )}
            <Link
              href="/parent/billing"
              className="inline-flex items-center rounded-full bg-green-800 text-white px-5 h-10 text-sm font-semibold hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              Back to billing
            </Link>
          </div>
        </div>
      </Card>
    </>
  );
}
