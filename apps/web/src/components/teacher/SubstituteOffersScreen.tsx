'use client';

import React from 'react';
import { Card, CardBody, CardHeader, EmptyState, PageHeader, QueryState, UiButton, formatDateTime } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useMySubstituteOffers, useRespondOffer } from '@/hooks/useSchedulingExtras';

/** Classes offered to this teacher as a substitute: the first to accept gets the class. */
export function SubstituteOffersScreen() {
  const query = useMySubstituteOffers();
  const respond = useRespondOffer();
  const toast = useToast();
  const answer = (offerId: string, accept: boolean) =>
    respond.mutate({ offerId, accept }, {
      onSuccess: () => toast.success(accept ? 'The class is yours. It is on your timetable.' : 'Declined'),
      // Expired, already taken, or you were booked meanwhile: the message says which; the list refreshes.
      onError: (e) => toast.error(e),
    });
  return (
    <>
      <PageHeader eyebrow="Teacher" title="Cover requests" description="Classes offered to you as a substitute. The first teacher to accept gets the class." />
      <QueryState query={query} empty={<EmptyState title="No offers right now" description="When the office needs cover you will see the request here and be notified." />}>
        {(rows) => (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((o) => (
              <Card key={o.offerId}>
                <CardHeader title={o.course} description={formatDateTime(o.startsAt)} />
                <CardBody className="space-y-3">
                  <p className="text-sm text-ink-2">{o.students.join(', ') || 'No students listed'}</p>
                  <p className="text-xs text-muted">Offer expires {formatDateTime(o.expiresAt)}</p>
                  <div className="flex gap-2">
                    <UiButton loading={respond.isPending} onClick={() => answer(o.offerId, true)}>Accept</UiButton>
                    <UiButton variant="secondary" disabled={respond.isPending} onClick={() => answer(o.offerId, false)}>Decline</UiButton>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}
