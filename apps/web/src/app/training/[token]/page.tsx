'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { LoadingState } from '@/components/ui/primitives';
import { ApplicantTrainingCourse } from '@/components/training/ApplicantTrainingCourse';

/**
 * `/training/:token` — the link emailed to an applicant at the TRAINING hiring step
 * (`ApplicantTrainingService.send`). Outside every portal: applicants have no account,
 * so the token is the credential and the API validates it.
 */
function Course() {
  const { token } = useParams<{ token: string }>();
  return <ApplicantTrainingCourse token={decodeURIComponent(token)} />;
}

export default function ApplicantTrainingPage() {
  return (
    <Suspense fallback={<LoadingState className="min-h-screen" />}>
      <Course />
    </Suspense>
  );
}
