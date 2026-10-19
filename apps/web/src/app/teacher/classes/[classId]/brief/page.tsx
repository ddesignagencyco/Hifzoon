'use client';

import { useParams } from 'next/navigation';
import { BriefScreen } from '@/components/teacher/BriefScreen';

export default function TeacherClassBriefPage() {
  const { classId } = useParams<{ classId: string }>();
  return <BriefScreen classId={classId} />;
}
