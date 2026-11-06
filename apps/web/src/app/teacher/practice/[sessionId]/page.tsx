'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PracticeReviewScreen } from '@/components/practice/Practice';

export default function TeacherPracticeReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return (
    <>
      <Link
        href="/teacher/practice"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink mb-3"
      >
        ← Practice to review
      </Link>
      <PracticeReviewScreen sessionId={sessionId} />
    </>
  );
}
