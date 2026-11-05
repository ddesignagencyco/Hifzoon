'use client';

import { Card, CardBody, CardHeader, PageHeader } from '@/components/ui/primitives';
import { PracticeList } from '@/components/practice/Practice';

export default function StudentPracticePage() {
  return (
    <>
      <PageHeader eyebrow="Student portal" title="Practice" description="What your teacher has set between classes." />
      <Card>
        <CardHeader title="Your practice" />
        <CardBody>
          <PracticeList practiceHref={(a) => `/student/practice/${a.id}`} />
        </CardBody>
      </Card>
    </>
  );
}
