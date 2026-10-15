'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, LoadingState, UiButton, formatDate } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import {
  PENDING_MESSAGE_PREFIX,
  THREAD_DEFAULT_LIMIT,
  useSendMessage,
  useThread,
} from '@/hooks/useMessaging';
import { MessagingSide, THREAD_MESSAGE_LIMIT_MAX, ThreadMessage } from '@/lib/api/modules/messaging';
import { MessageComposer } from './MessageComposer';

function timeOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function dayKey(value: string): string {
  return new Date(value).toDateString();
}

export function Conversation({
  side,
  threadId,
  basePath,
  viewer,
  studentName,
}: {
  side: MessagingSide;
  threadId: string;
  basePath: string;
  viewer: { id: string; name: string } | null;
  /** Child the thread is about, resolved by the parent screen. */
  studentName: (studentId: string | null) => string | null;
}) {
  const [limit, setLimit] = useState(THREAD_DEFAULT_LIMIT);
  const query = useThread(side, threadId, limit);
  const send = useSendMessage(side);
  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = query.data?.messages;
  const lastId = messages?.[messages.length - 1]?.id;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const thread = query.data?.thread;
  const title = thread ? (side === 'guardian' ? thread.teacher.user.name : thread.family.name) : 'Conversation';
  const child = thread ? studentName(thread.studentId) : null;

  const onSend = (body: string) => {
    if (!viewer) return Promise.reject(new Error('Not signed in'));
    return send.mutateAsync(
      { threadId, body, sender: viewer },
      {
        onError: (error) => toast.error(error),
      },
    );
  };

  return (
    <section aria-label={`Conversation with ${title}`} className="flex flex-col h-full min-h-0">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <Link
          href={basePath}
          className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-muted hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
        </Link>
        <div className="min-w-0">
          <h2 className="text-base text-ink truncate font-sans font-semibold">{title}</h2>
          {thread && (
            <p className="text-[11px] text-muted truncate">
              {child ? `About ${child} · ` : ''}
              {side === 'guardian' ? 'Teacher' : thread.family.name}
            </p>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto bg-cream/60 px-3 sm:px-5 py-4">
        {query.isLoading ? (
          <LoadingState label="Loading messages…" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load this conversation" />
        ) : !messages || messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description={side === 'guardian' ? 'Say salam and ask your question below.' : 'Nothing has been sent in this thread yet.'}
          />
        ) : (
          <>
            {messages.length >= limit && limit < THREAD_MESSAGE_LIMIT_MAX && (
              <div className="flex justify-center mb-3">
                <UiButton
                  size="sm"
                  variant="secondary"
                  loading={query.isFetching}
                  onClick={() => setLimit(THREAD_MESSAGE_LIMIT_MAX)}
                >
                  Show earlier messages
                </UiButton>
              </div>
            )}
            <ol role="log" aria-live="polite" aria-label="Messages" className="space-y-2">
              {messages.map((message, index) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  mine={message.senderId === viewer?.id}
                  showDay={index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt)}
                />
              ))}
            </ol>
          </>
        )}
      </div>

      <MessageComposer onSend={onSend} pending={send.isPending} disabled={!thread || !viewer} />
    </section>
  );
}

function MessageRow({ message, mine, showDay }: { message: ThreadMessage; mine: boolean; showDay: boolean }) {
  const pending = message.id.startsWith(PENDING_MESSAGE_PREFIX);
  return (
    <li>
      {showDay && (
        <p className="text-center text-[11px] text-muted my-3">
          {formatDate(message.createdAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
            mine ? 'bg-green-800 text-white rounded-br-md' : 'bg-white border border-line text-ink rounded-bl-md',
            pending && 'opacity-70',
          )}
        >
          <p className={cn('text-[11px] font-semibold mb-0.5', mine ? 'text-white/75' : 'text-gold-600')}>
            {mine ? 'You' : message.sender.name}
          </p>
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          <p className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-white/75' : 'text-muted')}>
            <time dateTime={message.createdAt}>{timeOf(message.createdAt)}</time>
            {mine &&
              (pending ? (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="w-3 h-3" aria-hidden /> Sending…
                </span>
              ) : message.readAt ? (
                <span className="inline-flex items-center" title="Read">
                  <CheckCheck className="w-3 h-3" aria-hidden />
                  <span className="sr-only">Read</span>
                </span>
              ) : (
                <span className="inline-flex items-center" title="Sent">
                  <Check className="w-3 h-3" aria-hidden />
                  <span className="sr-only">Sent</span>
                </span>
              ))}
          </p>
        </div>
      </div>
    </li>
  );
}
