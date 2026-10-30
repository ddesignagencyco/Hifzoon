'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ClassroomRoom } from '@/components/classroom/ClassroomRoom';

/** A guardian enters as their child (`?as=<studentId>`) or to watch (`?as=watch`); watch-only cannot publish. */
function ParentRoom() {
  const { classId } = useParams<{ classId: string }>();
  const joinAs = useSearchParams().get('as');
  return <ClassroomRoom classId={classId} viewer="guardian" joinAs={joinAs} />;
}

export default function ParentClassroomPage() {
  return (
    <Suspense fallback={null}>
      <ParentRoom />
    </Suspense>
  );
}
