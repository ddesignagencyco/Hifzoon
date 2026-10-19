'use client';

import { useParams } from 'next/navigation';
import { LessonCardDetail } from '@/components/lessons/LessonCardDetail';

/** Supervisors edit locked lesson cards with an audited reason (FR-REC-08). */
export default function SupervisorLessonCardPage() {
  const { lessonCardId } = useParams<{ lessonCardId: string }>();
  return <LessonCardDetail lessonCardId={lessonCardId} />;
}
