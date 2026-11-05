'use client';

import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { PracticeList } from '@/components/practice/Practice';

/** `/parent/practice` — practice the teachers have set, for every child in the family. */
export default function ParentPracticePage() {
  return (
    <>
      <PageHeader
        eyebrow="Family portal"
        title="Practice"
        description="What the teachers have set between classes. Young children can practise from here with you."
      />
      <Card>
        <CardHeader title="All children" />
        <CardBody>
          <PracticeList showStudent practiceHref={(a) => `/parent/children/${a.studentId}/practice/${a.id}`} />
        </CardBody>
      </Card>
    </>
  );
}
