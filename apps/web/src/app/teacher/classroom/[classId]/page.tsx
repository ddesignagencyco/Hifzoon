'use client';

import { useParams } from 'next/navigation';
import { ClassroomRoom } from '@/components/classroom/ClassroomRoom';

export default function TeacherClassroomPage() {
  const { classId } = useParams<{ classId: string }>();
  return <ClassroomRoom classId={classId} viewer="teacher" />;
}
