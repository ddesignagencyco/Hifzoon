'use client';

import { useParams } from 'next/navigation';
import { MessagesWorkspace } from '@/components/messaging/MessagesWorkspace';

export default function MessageThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  return <MessagesWorkspace side="guardian" threadId={threadId} />;
}
