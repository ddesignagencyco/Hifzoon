'use client';

import { PageHeader } from '@/components/ui/primitives';
import { PracticeOverview } from '@/components/practice/PracticeOverview';
import { useMyEnrolments } from '@/hooks/useStudent';

export default function StudentPracticePage() {
  const enrolments = useMyEnrolments();
  const student = enrolments.data?.[0]?.student;
  return (
    <>
      <PageHeader
        eyebrow="Student portal"
        title="Practice"
        description="What your teacher has set between classes."
      />
      <PracticeOverview
        view="assigned"
        students={student ? [{ id: student.id, displayName: student.displayName }] : []}
        studentsLoading={enrolments.isLoading}
        readerBase="/student/quran"
        practiceHref={(a) => `/student/practice/${a.id}`}
      />
    </>
  );
}
