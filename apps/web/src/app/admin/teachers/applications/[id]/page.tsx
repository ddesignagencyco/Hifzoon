'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { ApplicationDetailView } from '@/components/admin/teachers/ApplicationDetailView';

function Detail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  return (
    <ApplicationDetailView
      applicationId={params.id}
      backHref="/admin/teachers"
      initialProfileId={search.get('profileId') ?? undefined}
    />
  );
}

export default function AdminApplicationDetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Detail />
    </Suspense>
  );
}
