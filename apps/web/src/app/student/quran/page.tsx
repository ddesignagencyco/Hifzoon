'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/primitives';
import { QuranReader } from '@/components/quran/QuranReader';

/** `/student/quran` — the Mushaf for homework and revision at home. */
export default function StudentQuranPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <QuranReader eyebrow="Student portal" self />
    </Suspense>
  );
}
