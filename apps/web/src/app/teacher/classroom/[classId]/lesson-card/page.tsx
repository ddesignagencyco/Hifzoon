'use client';

import { useParams } from 'next/navigation';
import { LessonCardComposer } from '@/components/lessons/LessonCardComposer';

export default function TeacherLessonCardComposerPage() {
  const { classId } = useParams<{ classId: string }>();
  return <LessonCardComposer classId={classId} />;
}
