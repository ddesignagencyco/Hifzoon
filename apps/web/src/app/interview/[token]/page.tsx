'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { ApplicantInterviewLobby } from '@/components/interviews/ApplicantInterviewLobby';

/**
 * `/interview/:token` — the link emailed to a teaching applicant
 * (`InterviewsService.joinUrl` builds `${APP_WEB_URL}/interview/:token`).
 *
 * Deliberately outside every portal and not wrapped in `ProtectedRoute`: an applicant has
 * no Hifzoon account until their application is approved, so there is no session to
 * check. The token is the credential, and the API is the thing that validates it.
 */
function Lobby() {
  const { token } = useParams<{ token: string }>();
  return <ApplicantInterviewLobby token={decodeURIComponent(token)} />;
}

export default function ApplicantInterviewPage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-screen" />}>
      <Lobby />
    </Suspense>
  );
}
