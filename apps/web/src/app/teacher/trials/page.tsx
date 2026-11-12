'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseTrialStatus, TrialResultsScreen } from '@/components/teacher/TrialResultsScreen';

function TrialsPageInner() {
  const params = useSearchParams();
  return <TrialResultsScreen initialStatus={parseTrialStatus(params.get('status'))} />;
}

/** `/teacher/trials` — `?status=due` opens on the trials still waiting for a result. */
export default function TeacherTrialsPage() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <TrialsPageInner />
    </Suspense>
  );
}
