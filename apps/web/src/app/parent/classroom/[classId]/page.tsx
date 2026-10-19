'use client';

import { useParams } from 'next/navigation';
import { ClassroomRoom } from '@/components/classroom/ClassroomRoom';

/** FR-CLS-13 — a guardian joins to watch; the token issued cannot publish audio or video. */
export default function ParentClassroomPage() {
  const { classId } = useParams<{ classId: string }>();
  return <ClassroomRoom classId={classId} viewer="guardian" />;
}
