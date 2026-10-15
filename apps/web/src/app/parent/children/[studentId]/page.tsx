'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { ChildDetail } from '@/components/parent/ChildDetail';

export default function ParentChildDetailPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = Array.isArray(params.studentId) ? params.studentId[0] : params.studentId;
  return (
    <Suspense fallback={<LoadingState />}>
      <ChildDetail key={studentId} studentId={studentId} />
    </Suspense>
  );
}
