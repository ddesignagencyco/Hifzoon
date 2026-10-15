// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { renderWithProviders, findErrorToast, chooseOption, optionLabels } from '../helpers/render';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { LessonCardComposer } from '@/components/lessons/LessonCardComposer';

const CID = 'class-1';

const prefill = {
  classId: CID,
  course: { id: 'c1', name: 'Hifz' },
  teacherName: 'Ustadh Bilal',
  classStartedAt: '2026-10-15T13:00:00Z',
  classEndedAt: '2026-10-15T13:30:00Z',
  mushafLayout: 'MADANI_15',
  pagesShown: { lastPage: 3 },
  attendance: [{ studentId: 's1', minutesPresent: 28 }],
  students: [{ id: 's1', displayName: 'Amina', mistakes: [{ id: 'm1', studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE' }] }],
  mistakes: [{ id: 'm1', studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE' }],
  primaryStudentId: 's1',
  portions: [{ kind: 'SABAQ', fromSurah: 2, fromAyah: 5, toSurah: 2, toAyah: 5, grade: 'GOOD' }],
  readyToSubmit: true,
};

function renderComposer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LessonCardComposer classId={CID} />
    </QueryClientProvider>,
  );
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;

describe('LessonCardComposer', () => {
  beforeEach(() => push.mockReset());

  it('prefills from the class and submits the edited card', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) },
      [`POST /classes/${CID}/lesson-card`]: { status: 201, body: envelope({ id: 'card-9', submittedAt: '2026-10-15T13:31:00Z', portions: [] }) },
    });
    const user = userEvent.setup();
    renderComposer();

    await screen.findByRole('form', { name: 'Lesson card' });
    expect(input('lesson-card-fromSurah-0').value).toBe('2');
    expect(input('lesson-card-fromAyah-0').value).toBe('5');
    expect(screen.getByText('28 minutes present · 1 mistake')).toBeTruthy();

    await user.clear(input('lesson-card-fromAyah-0'));
    await user.type(input('lesson-card-fromAyah-0'), '1');
    await user.click(screen.getByRole('button', { name: 'Manzil' }));
    await chooseOption(input('lesson-card-grade-1'), /excellent/i);
    await user.type(input('lesson-card-fromSurah-1'), '78');
    await user.type(input('lesson-card-toSurah-1'), '80');
    await user.type(input('lesson-card-homework'), 'Revise page 3');
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/lesson-cards/card-9'));
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      homework: 'Revise page 3',
      portions: [
        { kind: 'SABAQ', fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, grade: 'GOOD' },
        { kind: 'MANZIL', fromSurah: 78, toSurah: 80, grade: 'EXCELLENT' },
      ],
    });
  });

  it('shows validation errors and does not submit an invalid card', async () => {
    const api = mockApi({ [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) } });
    const user = userEvent.setup();
    renderWithProviders(<LessonCardComposer classId={CID} />);

    await screen.findByRole('form', { name: 'Lesson card' });
    await user.clear(input('lesson-card-fromSurah-0'));
    await user.type(input('lesson-card-fromSurah-0'), '120');
    await user.clear(input('lesson-card-toAyah-0'));
    await user.type(input('lesson-card-toAyah-0'), '0');
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));

    await findErrorToast('Please fix the highlighted fields');
    expect(screen.getByText('Surah must be between 1 and 114')).toBeTruthy();
    expect(screen.getByText('Ayah must be 1 or greater')).toBeTruthy();
    expect(input('lesson-card-fromSurah-0').getAttribute('aria-invalid')).toBe('true');

    // Removing every portion is refused too (ArrayMinSize(1)).
    await user.click(screen.getByRole('button', { name: 'Remove portion 1' }));
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));
    await findErrorToast('Add at least one portion (Sabaq, Sabqi or Manzil)');
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('shows a failed submit as an error toast, not inline, and keeps the form', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) },
      [`POST /classes/${CID}/lesson-card`]: apiError(422, 'VALIDATION', 'The class has not ended yet'),
    });
    const user = userEvent.setup();
    renderWithProviders(<LessonCardComposer classId={CID} />);

    await screen.findByRole('form', { name: 'Lesson card' });
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));

    const toast = await findErrorToast('The class has not ended yet');
    expect(screen.getAllByText('The class has not ended yet')).toHaveLength(1);
    expect(screen.getByRole('form', { name: 'Lesson card' }).contains(toast)).toBe(false);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
    expect(input('lesson-card-fromSurah-0').value).toBe('2');
  });

  it('links to the existing card when it was already submitted', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: apiError(409, 'CONFLICT', 'This lesson card has already been submitted', { lessonCardId: 'card-1', locked: false }),
    });
    renderComposer();
    const link = await screen.findByRole('link', { name: 'Open the submitted card' });
    expect(link.getAttribute('href')).toBe('/teacher/lesson-cards/card-1');
  });
});
