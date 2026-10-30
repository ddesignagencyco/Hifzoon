'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { CoursesAdminScreen } from '@/components/admin/courses/CoursesAdmin';

/** Old links to the enrolments tab now open the Enrolments page. */
function Screen() {
  const search = useSearchParams();
  const router = useRouter();
  const enrolments = search.get('tab') === 'enrolments' || search.get('awaiting') === '1';
  useEffect(() => {
    if (enrolments) router.replace(`/admin/enrolments${search.get('awaiting') === '1' ? '?awaiting=1' : ''}`);
  }, [enrolments, router, search]);
  return enrolments ? <LoadingState /> : <CoursesAdminScreen />;
}

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Screen />
    </Suspense>
  );
}
