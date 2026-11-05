'use client';

import { useParams } from 'next/navigation';
import { PracticeScreen } from '@/components/practice/Practice';

export default function ParentPracticeAssignmentPage() {
  const { studentId, assignmentId } = useParams<{ studentId: string; assignmentId: string }>();
  return (
    <PracticeScreen
      assignmentId={assignmentId}
      backHref={`/parent/children/${studentId}?tab=practice`}
      backLabel="Back to practice"
    />
  );
}
