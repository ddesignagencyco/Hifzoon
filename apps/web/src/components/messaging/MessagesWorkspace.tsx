'use client';

import React, { useState } from 'react';
import { MessageSquare, PenSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, EmptyState, PageHeader, QueryState, UiButton } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/useAuth';
import { useGuardianStudentNames, useThreads } from '@/hooks/useMessaging';
import { MessagingSide, ThreadSummary } from '@/lib/api/modules/messaging';
import { Conversation } from './Conversation';
import { NewThreadModal } from './NewThreadModal';
import { SafeguardingNotice } from './SafeguardingNotice';
import { ThreadList } from './ThreadList';

/**
 * Split-pane inbox shared by `/parent/messages` and `/teacher/messages`.
 * On small screens the list and the open conversation are shown one at a time.
 */
export function MessagesWorkspace({ side, threadId }: { side: MessagingSide; threadId?: string }) {
  const basePath = side === 'guardian' ? '/parent/messages' : '/teacher/messages';
  const { currentUser } = useAuth();
  const threads = useThreads(side);
  const guardianNames = useGuardianStudentNames(side === 'guardian');
  const [composeOpen, setComposeOpen] = useState(false);

  const nameForStudentId = (studentId: string | null): string | null => {
    if (!studentId) return null;
    if (side === 'guardian') return guardianNames.get(studentId) ?? null;
    return threads.data?.find((t) => t.studentId === studentId)?.studentName ?? null;
  };
  const nameForThread = (t: ThreadSummary) =>
    side === 'teacher' ? (t.studentName ?? null) : nameForStudentId(t.studentId);

  const viewer = currentUser ? { id: currentUser.id, name: currentUser.name } : null;
  const canCompose = side === 'guardian';

  return (
    <>
      <PageHeader
        eyebrow={side === 'guardian' ? 'Family portal' : 'Teacher portal'}
        title="Messages"
        description={
          side === 'guardian'
            ? "Talk to your children's teachers about lessons and progress."
            : 'Reply to the families you teach.'
        }
        actions={
          canCompose ? (
            <UiButton onClick={() => setComposeOpen(true)} icon={<PenSquare className="w-4 h-4" aria-hidden />}>
              New message
            </UiButton>
          ) : undefined
        }
      />
      <SafeguardingNotice side={side} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-stretch">
        <Card className={cn('overflow-hidden lg:block lg:h-[calc(100dvh-17rem)] lg:min-h-[480px] lg:overflow-y-auto', threadId && 'hidden')}>
          <QueryState
            query={threads}
            loadingLabel="Loading conversations…"
            empty={
              <EmptyState
                icon={<MessageSquare className="w-5 h-5" aria-hidden />}
                title="No conversations yet"
                description={
                  canCompose
                    ? "Start a conversation with your child's teacher."
                    : 'When a family messages you, the conversation appears here.'
                }
                action={
                  canCompose ? (
                    <UiButton size="sm" onClick={() => setComposeOpen(true)}>
                      New message
                    </UiButton>
                  ) : undefined
                }
              />
            }
          >
            {(data) => (
              <ThreadList
                threads={data}
                side={side}
                basePath={basePath}
                activeThreadId={threadId}
                viewerUserId={currentUser?.id}
                studentName={nameForThread}
              />
            )}
          </QueryState>
        </Card>

        <Card
          className={cn(
            'overflow-hidden flex-col h-[calc(100dvh-13rem)] min-h-[420px] lg:h-[calc(100dvh-17rem)] lg:min-h-[480px]',
            threadId ? 'flex' : 'hidden lg:flex',
          )}
        >
          {threadId ? (
            <Conversation
              key={threadId}
              side={side}
              threadId={threadId}
              basePath={basePath}
              viewer={viewer}
              studentName={nameForStudentId}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="w-5 h-5" aria-hidden />}
                title="Select a conversation"
                description="Choose a conversation from the list to read and reply."
              />
            </div>
          )}
        </Card>
      </div>

      {canCompose && <NewThreadModal open={composeOpen} onClose={() => setComposeOpen(false)} basePath={basePath} />}
    </>
  );
}
