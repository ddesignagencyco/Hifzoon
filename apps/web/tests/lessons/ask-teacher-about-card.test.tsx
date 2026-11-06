// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AskTeacherAboutCard, familyThreadHref } from '@/components/lessons/AskTeacherAboutCard';
import {
  REVISION_MESSAGE_MAX,
  revisionReasonLabel,
  validateRevisionText,
} from '@/lib/api/modules/revision-requests';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { findSuccessToast, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function question(extra: Record<string, unknown> = {}) {
  return {
    id: 'rr-1',
    lessonCardId: 'card-1',
    studentId: 'stu-1',
    familyId: 'fam-1',
    reason: 'MISTAKE_QUESTION',
    message: 'Why was 2:255 marked?',
    status: 'OPEN',
    response: null,
    respondedAt: null,
    closedAt: null,
    threadId: 'thread-9',
    createdAt: '2026-11-02T10:00:00.000Z',
    requestedBy: { id: 'g1', name: 'Aisha Khan' },
    respondedBy: null,
    student: { id: 'stu-1', displayName: 'Maryam' },
    lessonCard: {
      id: 'card-1',
      teacher: { id: 't1', name: 'Ustadhah Zainab' },
      class: { startsAt: '2026-11-01T10:00:00.000Z' },
    },
    ...extra,
  };
}

describe('ask-the-teacher rules', () => {
  it('needs a message of 1 to 1000 characters and has the four reasons', () => {
    expect(validateRevisionText('   ', REVISION_MESSAGE_MAX)).toMatch(/Write a message/);
    expect(validateRevisionText('x'.repeat(1001), REVISION_MESSAGE_MAX)).toMatch(/1000 characters/);
    expect(validateRevisionText('Please revisit', REVISION_MESSAGE_MAX)).toBeNull();
    expect(revisionReasonLabel('EXTRA_CLASS')).toBe('Extra class');
    expect(familyThreadHref('t 1')).toBe('/parent/messages/t%201');
    expect(familyThreadHref(null)).toBe('/parent/messages');
  });
});

describe('AskTeacherAboutCard', () => {
  it('sends the chosen reason chip and a trimmed message, then links to the conversation', async () => {
    const api = mockApi({
      'GET /revision-requests': { body: envelope([]) },
      'POST /lesson-cards/card-1/revision-requests': { status: 201, body: envelope(question()) },
    });
    renderWithProviders(<AskTeacherAboutCard lessonCardId="card-1" />);

    await userEvent.click(
      await screen.findByRole('button', { name: /Ask the teacher about this card/ }),
    );
    const chip = screen.getByRole('radio', { name: 'Question about a mistake' });
    expect(screen.getByRole('radio', { name: 'Revisit a portion' }).getAttribute('aria-checked')).toBe('true');
    await userEvent.click(chip);
    expect(chip.getAttribute('aria-checked')).toBe('true');
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual([
      'Revisit a portion',
      'Question about a mistake',
      'Extra class',
      'Other',
    ]);
    await userEvent.type(screen.getByLabelText('Message'), '  Why was 2:255 marked?  ');
    await userEvent.click(screen.getByRole('button', { name: 'Send to teacher' }));

    await findSuccessToast(/Sent to the teacher in Messages/);
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ reason: 'MISTAKE_QUESTION', message: 'Why was 2:255 marked?' });
    expect(await screen.findByText(/Sent to Ustadhah Zainab in Messages/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Open conversation' }).getAttribute('href'),
    ).toBe('/parent/messages/thread-9');
  });

  it('does not send an empty message', async () => {
    const api = mockApi({ 'GET /revision-requests': { body: envelope([]) } });
    renderWithProviders(<AskTeacherAboutCard lessonCardId="card-1" />);
    await userEvent.click(
      await screen.findByRole('button', { name: /Ask the teacher about this card/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send to teacher' }));
    expect(await screen.findByText('Write a message.')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('lists earlier questions only as links to their conversation, with no status or close', async () => {
    const api = mockApi({
      'GET /revision-requests': {
        body: envelope([question(), question({ id: 'rr-2', threadId: null, status: 'ANSWERED', response: 'Done' })]),
      },
    });
    renderWithProviders(<AskTeacherAboutCard lessonCardId="card-1" />);
    const links = await screen.findAllByRole('link', { name: 'open conversation' });
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/parent/messages/thread-9',
      '/parent/messages',
    ]);
    expect(screen.getAllByText(/Asked on/)).toHaveLength(2);
    expect(screen.queryByText(/Withdraw|Mark as resolved|Open|Answered/)).toBeNull();
    expect(screen.queryByText('Done')).toBeNull();
    await waitFor(() => expect(api.calls[0].url).toContain('scope=family'));
    expect(api.calls[0].url).toContain('lessonCardId=card-1');
  });
});
