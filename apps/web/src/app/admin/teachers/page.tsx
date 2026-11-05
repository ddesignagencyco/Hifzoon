'use client';

import { Suspense } from 'react';
import { TeachersHub } from '@/components/admin/teachers/TeachersHub';
import { LoadingState } from '@/components/ui/primitives';

export default function AdminTeachersPage() {
  // TeachersHub reads `?tab=`; the search params need a Suspense boundary.
  return (
    <Suspense fallback={<LoadingState />}>
      <TeachersHub />
    </Suspense>
  );
}
