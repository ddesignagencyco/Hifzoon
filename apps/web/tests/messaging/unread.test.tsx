// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import { ThreadList } from '@/components/messaging/ThreadList';
import { Conversation } from '@/components/messaging/Conversation';
import { messagingKeys, useUnreadThreadCount } from '@/hooks/useMessaging';
import {
  isLessonCardQuestion,
  markThreadReadInList,
  Message,
  sortUnreadFirst,
  ThreadSummary,
} from '@/lib/api/modules/messaging';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const ME = 'teacher-user';

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  threadId: 't1',
  senderId: 'guardian-user',
  body: 'Salam',
  createdAt: '2026-11-05T10:00:00Z',
  readAt: null,
  ...over,
});

const thread = (id: string, name: string, last: Partial<Message> = {}): ThreadSummary => ({
  id,
  familyId: `fam-${id}`,
  teacherId: 'tp',
  studentId: null,
  enrolmentId: null,
  createdAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-05T10:00:00Z',
  family: { id: `fam-${id}`, name },
  studentName: null,
  messages: [msg({ threadId: id, id: `m-${id}`, ...last })],
});

describe('unread helpers', () => {
  it('sorts unread conversations first and keeps the API order otherwise', () => {
    const list = [
      thread('a', 'Ahmed', { senderId: ME }),
      thread('b', 'Bakr', { readAt: '2026-11-05T11:00:00Z' }),
      thread('c', 'Cheema'),
      thread('d', 'Dar'),
    ];
    expect(sortUnreadFirst(list, ME).map((t) => t.id)).toEqual(['c', 'd', 'a', 'b']);
    const none = [list[0], list[1]];
    expect(sortUnreadFirst(none, ME)).toBe(none);
  });

  it('marks an opened thread read in a cached list, and is a no-op when nothing is unread', () => {
    const list = [thread('a', 'Ahmed'), thread('b', 'Bakr')];
    const next = markThreadReadInList(list, 'a', ME, '2026-11-05T12:00:00Z');
    expect(next).not.toBe(list);
    expect(next[0].messages[0].readAt).toBe('2026-11-05T12:00:00Z');
    expect(next[1]).toBe(list[1]);
    expect(markThreadReadInList(next, 'a', ME, 'x')).toBe(next);
  });

  it('recognises a question asked from a lesson card', () => {
    expect(isLessonCardQuestion('Revision request — Revisit a portion — lesson card 1 Nov: please')).toBe(true);
    expect(isLessonCardQuestion('A revision request — hi')).toBe(false);
  });
});

describe('ThreadList unread state', () => {
  it('puts unread rows on top with bold name and an unread dot', () => {
    render(
      <ThreadList
        threads={[thread('a', 'Ahmed', { senderId: ME, body: 'Shukran' }), thread('b', 'Bakr', { body: 'Question' })]}
        side="teacher"
        basePath="/teacher/messages"
        viewerUserId={ME}
        studentName={() => null}
      />,
    );
    const rows = screen.getAllByRole('link');
    expect(rows[0].getAttribute('href')).toBe('/teacher/messages/b');
    expect(within(rows[0]).getByRole('img', { name: 'Unread' })).toBeTruthy();
    expect(within(rows[0]).getByText('Bakr').className).toContain('font-semibold');
    expect(within(rows[1]).queryByRole('img', { name: 'Unread' })).toBeNull();
    expect(within(rows[1]).getByText('You: Shukran')).toBeTruthy();
  });
});

function Badge() {
  const count = useUnreadThreadCount('teacher', ME);
  return <span data-testid="badge">{count ?? '-'}</span>;
}

describe('opening a thread', () => {
  it('clears the row dot and the sidebar count at once, and tags lesson-card questions', async () => {
    const body = 'Revision request — Question about a mistake — lesson card 1 Nov: why 2:255?';
    const unreadList = [thread('t1', 'Khan Family', { body })];
    let opened = false;
    mockApi({
      // Unread until the thread is opened, which marks it read on the server.
      'GET /teacher/threads': () => ({
        body: envelope([thread('t1', 'Khan Family', { body, readAt: opened ? '2026-11-05T12:00:00Z' : null })]),
      }),
      'GET /teacher/threads/t1': () => {
        opened = true;
        return {
        body: envelope({
          thread: { ...unreadList[0], teacher: { photoUrl: null, user: { name: 'Ustadh Bilal' } } },
          messages: [{ ...unreadList[0].messages[0], sender: { id: 'guardian-user', name: 'Aisha Khan' } }],
        }),
        };
      },
    });
    const { queryClient } = renderWithProviders(<Badge />);
    await waitFor(() => expect(screen.getByTestId('badge').textContent).toBe('1'));

    renderInSameClient(queryClient);
    expect(await screen.findByText('About a lesson card')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('badge').textContent).toBe('0'));
    const cached = queryClient.getQueryData<ThreadSummary[]>(messagingKeys.threads('teacher'));
    expect(cached?.[0].messages[0].readAt).toBeTruthy();
  });
});

function renderInSameClient(queryClient: QueryClient) {
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Conversation
          side="teacher"
          threadId="t1"
          basePath="/teacher/messages"
          viewer={{ id: ME, name: 'Ustadh Bilal' }}
          studentName={() => null}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
