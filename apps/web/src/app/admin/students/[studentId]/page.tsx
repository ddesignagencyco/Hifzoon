'use client';

import { useParams } from 'next/navigation';
import { StudentDetailScreen } from '@/components/admin/ops/StudentDetailScreen';

export default function Page() {
  const { studentId } = useParams<{ studentId: string }>();
  return <StudentDetailScreen studentId={studentId} />;
}
