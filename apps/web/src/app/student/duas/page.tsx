'use client';

import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/primitives';
import { DuaReader } from '@/components/duas/DuaReader';

/** `/student/duas` — Hisn al-Muslim for learning the duas from class at home. */
export default function StudentDuasPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DuaReader eyebrow="Student portal" basePath="/student/duas" />
    </Suspense>
  );
}
