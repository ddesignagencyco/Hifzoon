'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { SchedulingWorkspace } from '@/components/admin/scheduling/SchedulingWorkspace';

function Workspace() {
  const search = useSearchParams();
  return (
    <SchedulingWorkspace
      initialEnrolmentId={search.get('enrolmentId') ?? undefined}
      initialTeacherId={search.get('teacherId') ?? undefined}
      initialScheduleId={search.get('scheduleId') ?? undefined}
    />
  );
}

export default function AdminSchedulingPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Workspace />
    </Suspense>
  );
}
