'use client';

import { PageHeader } from '@/components/ui/primitives';
import { PracticeOverview } from '@/components/practice/PracticeOverview';
import { useMyEnrolments } from '@/hooks/useStudent';

/** `/student/mistakes` — my open mistakes from class, to practise before the next one. */
export default function StudentMistakesPage() {
  const enrolments = useMyEnrolments();
  const student = enrolments.data?.[0]?.student;
  return (
    <>
      <PageHeader
        eyebrow="Student portal"
        title="Mistakes"
        description="Mistakes from class still to practise. Your teacher marks each one fixed once you read it right."
      />
      <PracticeOverview
        view="mistakes"
        students={student ? [{ id: student.id, displayName: student.displayName }] : []}
        studentsLoading={enrolments.isLoading}
        readerBase="/student/quran"
      />
    </>
  );
}
