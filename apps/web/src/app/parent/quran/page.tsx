'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/primitives';
import { QuranReader } from '@/components/quran/QuranReader';

/** `/parent/quran` — the Mushaf for homework and revision at home. */
export default function ParentQuranPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <QuranReader eyebrow="Family portal" />
    </Suspense>
  );
}
