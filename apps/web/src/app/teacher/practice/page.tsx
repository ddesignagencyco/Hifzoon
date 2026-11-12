'use client';

import { PageHeader } from '@/components/ui/primitives';
import { HowItWorks } from '@/components/ui/HowItWorks';
import { PracticeReviewQueue } from '@/components/practice/Practice';

/** `/teacher/practice` — practice sessions waiting for the teacher's reply. */
export default function TeacherPracticeToReviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Teacher portal"
        title="Practice to review"
        description="Practice your students logged at home on the passages you set, so you can listen and reply."
      />
      <HowItWorks
        steps={[
          'The child practises a passage you set, with the timer or a recording.',
          'You open it, listen, tap any words read wrongly and write feedback.',
          'The family sees your reply on the practice page.',
        ]}
      />
      <PracticeReviewQueue />
    </>
  );
}
