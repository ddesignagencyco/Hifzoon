'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorState, LoadingState } from '@/components/ui/primitives';
import { useLessonCard } from '@/hooks/useParentProgress';

/**
 * `/parent/lesson-cards/:id` — where a "New lesson card" notification points. Its payload has
 * the card id but not the child, so this looks the card up and opens it on the child's
 * Lesson cards tab.
 */
export default function ParentLessonCardLinkPage() {
  const router = useRouter();
  const params = useParams<{ lessonCardId: string }>();
  const lessonCardId = Array.isArray(params.lessonCardId) ? params.lessonCardId[0] : params.lessonCardId;
  const card = useLessonCard(lessonCardId ?? null);
  const studentId = card.data?.studentId;

  useEffect(() => {
    if (!studentId || !lessonCardId) return;
    router.replace(
      `/parent/children/${encodeURIComponent(studentId)}?tab=lessons&card=${encodeURIComponent(lessonCardId)}`,
    );
  }, [router, studentId, lessonCardId]);

  if (card.isError) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  return <LoadingState label="Opening the lesson card…" />;
}
