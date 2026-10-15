'use client';

import { useParams } from 'next/navigation';
import { StudentDetailScreen } from '@/components/teacher/StudentDetailScreen';

export default function TeacherStudentPage() {
  const { studentId } = useParams<{ studentId: string }>();
  return <StudentDetailScreen studentId={studentId} />;
}
