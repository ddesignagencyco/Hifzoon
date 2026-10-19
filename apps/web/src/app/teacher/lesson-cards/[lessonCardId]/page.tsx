'use client';

import { useParams } from 'next/navigation';
import { LessonCardDetail } from '@/components/lessons/LessonCardDetail';

export default function TeacherLessonCardPage() {
  const { lessonCardId } = useParams<{ lessonCardId: string }>();
  return <LessonCardDetail lessonCardId={lessonCardId} />;
}
