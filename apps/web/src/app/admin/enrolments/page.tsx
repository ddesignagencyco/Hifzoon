'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingState, PageHeader } from '@/components/ui/primitives';
import { EnrolmentsPanel } from '@/components/admin/courses/EnrolmentsPanel';

/** `/admin/enrolments` — every student's course enrolments; `?awaiting=1` shows those without a teacher. */
function Screen() {
  const awaiting = useSearchParams().get('awaiting') === '1';
  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Enrolments"
        description="Which student is on which course, with which teacher, and where they are in the lesson plan."
      />
      <EnrolmentsPanel initialAwaiting={awaiting} />
    </>
  );
}

export default function AdminEnrolmentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Screen />
    </Suspense>
  );
}
