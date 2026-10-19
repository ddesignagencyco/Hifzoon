'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { CoursesAdminScreen } from '@/components/admin/courses/CoursesAdmin';

/** `?tab=enrolments&awaiting=1` opens Enrolments filtered to enrolments awaiting a teacher. */
function Screen() {
  const search = useSearchParams();
  const awaiting = search.get('awaiting') === '1';
  return (
    <CoursesAdminScreen
      initialTab={search.get('tab') === 'enrolments' || awaiting ? 'enrolments' : 'catalogue'}
      initialAwaiting={awaiting}
    />
  );
}

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Screen />
    </Suspense>
  );
}
