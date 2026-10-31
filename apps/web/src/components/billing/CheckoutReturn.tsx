'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, PageHeader, formatDate } from '@/components/ui/primitives';
import { billingKeys, useSyncSubscription } from '@/hooks/useBilling';

const BUTTON =
  'inline-flex items-center rounded-full bg-green-800 text-white px-5 h-10 text-sm font-semibold hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';
const SECONDARY =
  'inline-flex items-center rounded-full border border-line bg-white text-ink px-5 h-10 text-sm font-semibold hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2';

/**
 * Landing page after the hosted checkout.
 *
 * Returning from a subscription's card page (`?subscription=`), it asks the API to read the
 * subscription straight from the payment provider, so the family sees it active even when
 * the provider's webhook is late or was lost. A one-off invoice payment still waits for
 * the webhook, so that case never claims the invoice is settled.
 */
export function CheckoutReturn({ outcome }: { outcome: 'success' | 'cancelled' }) {
  const queryClient = useQueryClient();
  const subscriptionId = useSearchParams().get('subscription');
  const sync = useSyncSubscription();
  const started = useRef(false);

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: billingKeys.family });
    if (outcome === 'success' && subscriptionId && !started.current) {
      started.current = true;
      sync.mutate(subscriptionId);
    }
  }, [outcome, queryClient, subscriptionId, sync]);

  const success = outcome === 'success';
  const active = sync.data && sync.data.status !== 'INCOMPLETE';
  const title = !success
    ? 'Payment cancelled'
    : subscriptionId
      ? active
        ? 'You’re all set'
        : 'Confirming your payment…'
      : 'Payment submitted';

  return (
    <>
      <PageHeader eyebrow="Billing" title={title} />
      <Card className="p-6 max-w-xl">
        <div className="flex items-start gap-3">
          {!success ? (
            <XCircle className="w-6 h-6 text-amber shrink-0" aria-hidden />
          ) : subscriptionId && !active ? (
            <Clock className="w-6 h-6 text-gold shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" aria-hidden />
          )}
          <div className="space-y-3 text-sm text-ink-2" aria-live="polite">
            {!success ? (
              <p>
                No payment was taken and nothing has started. You can come back and finish whenever you are ready — your
                choices are kept.
              </p>
            ) : subscriptionId ? (
              active ? (
                <>
                  <p>
                    Your card is saved and <strong>{sync.data?.plan.name}</strong> is active. It renews automatically
                    {sync.data?.currentPeriodEnd ? ` on ${formatDate(sync.data.currentPeriodEnd)}` : ''}; you can cancel
                    any time and keep classes until the end of the paid period.
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-green-700" aria-hidden />
                    Your regular classes are in your timetable.
                  </p>
                </>
              ) : sync.isPending ? (
                <p>We are checking with our payment partner. This only takes a moment.</p>
              ) : (
                <p>
                  Your payment is being confirmed by our payment partner. It usually takes under a minute — this page and
                  Billing update on their own once it lands.
                </p>
              )
            ) : (
              <p>
                Thank you. Your payment has been handed to our payment provider. The invoice will show as{' '}
                <strong>Paid</strong> as soon as the provider confirms it — this can take a few minutes.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {success && subscriptionId && active && (
                <Link href="/parent/timetable" className={BUTTON}>
                  See the timetable
                </Link>
              )}
              {success && subscriptionId && !active && !sync.isPending && (
                <button type="button" className={BUTTON} onClick={() => sync.mutate(subscriptionId)}>
                  Check again
                </button>
              )}
              <Link href="/parent/billing" className={success && subscriptionId ? SECONDARY : BUTTON}>
                Back to billing
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
