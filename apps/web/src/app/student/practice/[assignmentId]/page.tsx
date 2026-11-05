'use client';

import { useParams } from 'next/navigation';
import { PracticeScreen } from '@/components/practice/Practice';

export default function StudentPracticeAssignmentPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  return <PracticeScreen assignmentId={assignmentId} backHref="/student/practice" backLabel="All practice" />;
}
