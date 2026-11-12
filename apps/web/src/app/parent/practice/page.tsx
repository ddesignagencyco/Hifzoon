'use client';

import { PageHeader } from '@/components/ui/primitives';
import { PracticeOverview } from '@/components/practice/PracticeOverview';
import { useActiveFamily, useFamilyStudents } from '@/hooks/useFamily';

/** `/parent/practice` — practice the teachers have set, for every child. Open mistakes: `/parent/mistakes`. */
export default function ParentPracticePage() {
  const { familyId } = useActiveFamily();
  const students = useFamilyStudents(familyId);
  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Practice"
        description="What the teachers have set between classes. Young children can practise from here with you."
      />
      <PracticeOverview
        view="assigned"
        students={(students.data ?? []).map((s) => ({ id: s.id, displayName: s.displayName }))}
        studentsLoading={students.isLoading}
        readerBase="/parent/quran"
        showStudent
        practiceHref={(a) => `/parent/children/${a.studentId}/practice/${a.id}`}
      />
    </>
  );
}
