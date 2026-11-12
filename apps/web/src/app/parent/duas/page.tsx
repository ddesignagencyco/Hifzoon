'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/primitives';
import { DuaReader } from '@/components/duas/DuaReader';

/** `/parent/duas` — Hisn al-Muslim for learning the duas from class at home. */
export default function ParentDuasPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DuaReader eyebrow="Family portal" basePath="/parent/duas" />
    </Suspense>
  );
}
