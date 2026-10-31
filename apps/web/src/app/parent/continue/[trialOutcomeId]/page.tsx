'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { ContinueWithTeacher } from '@/components/parent/ContinueWithTeacher';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

export default function ContinueWithTeacherPage() {
  const params = useParams<{ trialOutcomeId: string }>();
  const id = Array.isArray(params.trialOutcomeId) ? params.trialOutcomeId[0] : params.trialOutcomeId;
  if (!billingEnabled()) return <BillingUnavailable />;
  return (
    <Suspense fallback={<LoadingState />}>
      <ContinueWithTeacher key={id} trialOutcomeId={id} />
    </Suspense>
  );
}
