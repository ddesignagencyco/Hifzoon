'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatDate } from '@/components/ui/primitives';
import {
  counterpartName,
  hasUnread,
  MessagingSide,
  ThreadSummary,
} from '@/lib/api/modules/messaging';

function shortTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return formatDate(date, { day: 'numeric', month: 'short' });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function ThreadList({
  threads,
  side,
  basePath,
  activeThreadId,
  viewerUserId,
  studentName,
}: {
  threads: ThreadSummary[];
  side: MessagingSide;
  basePath: string;
  activeThreadId?: string;
  viewerUserId?: string;
  studentName: (thread: ThreadSummary) => string | null;
}) {
  return (
    <ul className="divide-y divide-line" aria-label="Conversations">
      {threads.map((thread) => {
        const name = counterpartName(thread, side);
        const child = studentName(thread);
        const last = thread.messages[0];
        const unread = hasUnread(thread, viewerUserId);
        const active = thread.id === activeThreadId;
        return (
          <li key={thread.id}>
            <Link
              href={`${basePath}/${thread.id}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold',
                active ? 'bg-green-50' : 'hover:bg-cream',
              )}
            >
              <span
                aria-hidden
                className="w-9 h-9 shrink-0 rounded-full bg-green-800 text-white text-xs font-semibold flex items-center justify-center"
              >
                {initials(name) || '?'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn('truncate text-sm text-ink', unread ? 'font-semibold' : 'font-medium')}>
                    {name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {shortTime(last?.createdAt ?? thread.updatedAt)}
                  </span>
                </span>
                {child && <span className="block text-[11px] text-gold-600 font-medium truncate">About {child}</span>}
                <span className="flex items-center gap-2">
                  <span className={cn('block truncate text-xs', unread ? 'text-ink' : 'text-muted')}>
                    {last
                      ? `${last.senderId === viewerUserId ? 'You: ' : ''}${last.body}`
                      : 'No messages yet'}
                  </span>
                  {unread && (
                    <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-gold" aria-label="Unread" role="img" />
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
