'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { StartWithTeacher } from '@/components/parent/StartWithTeacher';
import { BillingUnavailable } from '@/components/billing/BillingUnavailable';
import { billingEnabled } from '@/lib/features';

function StartFromUrl() {
  const params = useSearchParams();
  const read = (key: string) => params.get(key) ?? undefined;
  return (
    <StartWithTeacher
      initial={{
        teacher: read('teacher'),
        student: read('student'),
        course: read('course'),
        plan: read('plan'),
      }}
    />
  );
}

/** `/parent/start` — start regular classes with a teacher without a trial. */
export default function StartWithTeacherPage() {
  if (!billingEnabled()) return <BillingUnavailable />;
  return (
    <Suspense fallback={<LoadingState />}>
      <StartFromUrl />
    </Suspense>
  );
}
