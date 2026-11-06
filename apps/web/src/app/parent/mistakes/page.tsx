'use client';

import { PageHeader } from '@/components/ui/primitives';
import { PracticeOverview } from '@/components/practice/PracticeOverview';
import { useActiveFamily, useFamilyStudents } from '@/hooks/useFamily';

/** `/parent/mistakes` — every child's open mistakes from class, to practise at home. */
export default function ParentMistakesPage() {
  const { familyId } = useActiveFamily();
  const students = useFamilyStudents(familyId);
  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Mistakes"
        description="Mistakes from class still to practise. Listen to the ayah, read it in the Mushaf, and the teacher marks it fixed once it is read right."
      />
      <PracticeOverview
        view="mistakes"
        students={(students.data ?? []).map((s) => ({ id: s.id, displayName: s.displayName }))}
        studentsLoading={students.isLoading}
        readerBase="/parent/quran"
        showStudent
      />
    </>
  );
}
