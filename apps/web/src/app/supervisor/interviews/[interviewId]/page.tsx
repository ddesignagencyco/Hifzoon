'use client';

import { useParams } from 'next/navigation';
import { InterviewRoomPage } from '@/components/interviews/InterviewRoomPage';

export default function SupervisorInterviewRoomPage() {
  const { interviewId } = useParams<{ interviewId: string }>();
  return <InterviewRoomPage interviewId={interviewId} basePath="/supervisor/interviews" />;
}
