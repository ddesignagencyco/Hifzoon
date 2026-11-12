'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LessonCardsScreen, parseLessonCardStatus } from '@/components/teacher/LessonCardsScreen';

function LessonCardsPageInner() {
  const params = useSearchParams();
  return <LessonCardsScreen initialStatus={parseLessonCardStatus(params.get('status'))} />;
}

/** `/teacher/lesson-cards` — `?status=due` opens on the cards still to write. */
export default function TeacherLessonCardsPage() {
  // useSearchParams needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <LessonCardsPageInner />
    </Suspense>
  );
}
