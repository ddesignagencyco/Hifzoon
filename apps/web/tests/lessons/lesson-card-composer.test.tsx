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
  students: [
    {
      id: 's1',
      displayName: 'Amina',
      mistakes: [
        { id: 'm1', studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE' },
      ],
    },
  ],
  mistakes: [{ id: 'm1', studentId: 's1', surah: 2, ayah: 5, wordIndex: 1, type: 'TAJWEED_RULE' }],
  primaryStudentId: 's1',
  portions: [{ kind: 'SABAQ', fromSurah: 2, fromAyah: 5, toSurah: 2, toAyah: 5, grade: 'GOOD' }],
  readyToSubmit: true,
};

function renderComposer() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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
      [`POST /classes/${CID}/lesson-card`]: {
        status: 201,
        body: envelope({ id: 'card-9', submittedAt: '2026-10-15T13:31:00Z', portions: [] }),
      },
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
    // Homework starts from today's sabaq; the teacher may rewrite it.
    expect(input('lesson-card-homework').value).toContain('Surah 2:');
    await user.clear(input('lesson-card-homework'));
    await user.type(input('lesson-card-homework'), 'Revise page 3');
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/lesson-cards/card-9'));
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      studentId: 's1',
      homework: 'Revise page 3',
      portions: [
        { kind: 'SABAQ', fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, grade: 'GOOD' },
        { kind: 'MANZIL', fromSurah: 78, toSurah: 80, grade: 'EXCELLENT' },
      ],
    });
  }, 15_000); // heavy form interaction; can exceed 5 s under full-suite load

  it('shows validation errors and does not submit an invalid card', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) },
    });
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
  }, 15_000); // heavy form interaction; can exceed 5 s under full-suite load

  it('shows a failed submit as an error toast, not inline, and keeps the form', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) },
      [`POST /classes/${CID}/lesson-card`]: apiError(
        422,
        'VALIDATION',
        'The class has not ended yet',
      ),
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

  it('holds the submit until 10 minutes before the class ends, saying when it opens', async () => {
    const endsAt = new Date(Date.now() + 40 * 60_000).toISOString();
    const opensAt = new Date(Date.parse(endsAt) - 10 * 60_000).toISOString();
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: {
        body: envelope({ ...prefill, classEndedAt: endsAt, submittableFrom: opensAt }),
      },
    });
    renderComposer();

    await screen.findByRole('form', { name: 'Lesson card' });
    const button = screen.getByRole('button', { name: 'Submit lesson card' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/You can submit from/)).toBeTruthy();
    // The form stays editable for drafting.
    expect(input('lesson-card-fromAyah-0').disabled).toBe(false);
  });

  it('allows submitting at once when the class is already completed (submittableFrom null)', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: {
        body: envelope({ ...prefill, classEndedAt: new Date(Date.now() + 40 * 60_000).toISOString(), submittableFrom: null }),
      },
    });
    renderComposer();

    await screen.findByRole('form', { name: 'Lesson card' });
    expect((screen.getByRole('button', { name: 'Submit lesson card' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/You can submit from/)).toBeNull();
  });

  it('links to the existing card when it was already submitted', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: apiError(
        409,
        'CONFLICT',
        'This lesson card has already been submitted',
        { lessonCardId: 'card-1', locked: false },
      ),
    });
    renderComposer();
    const link = await screen.findByRole('link', { name: 'Open the submitted card' });
    expect(link.getAttribute('href')).toBe('/teacher/lesson-cards/card-1');
  });

  it('names the Duas board chapters shown in class, from GET /content/duas', async () => {
    mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: {
        body: envelope({
          ...prefill,
          course: { id: 'c2', name: 'Duas', type: 'DUAS' },
          portions: [],
          coverage: {
            lessons: [
              { board: 'DUAS', lesson: 2 },
              { board: 'DUAS', lesson: 1 },
            ],
          },
        }),
      },
      'GET /content/duas': {
        body: envelope({
          source: {
            name: 'Hisn al-Muslim',
            author: '',
            url: '',
            languages: ['ar', 'en'],
            importedAt: '',
          },
          categories: [
            { id: 1, title: 'Supplications for when you wake up', titleAr: '', duas: [] },
            { id: 2, title: 'Invocation when getting dressed', titleAr: '', duas: [] },
          ],
        }),
      },
    });
    renderComposer();
    await screen.findByRole('form', { name: 'Lesson card' });
    expect(input('lesson-card-homework').value).toBe(
      'Revise: Invocation when getting dressed; Supplications for when you wake up.',
    );
  });

  it('shows each board portion by its lesson name, with no Quran-only fields', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: {
        body: envelope({
          ...prefill,
          course: { id: 'c2', name: 'Duas', type: 'DUAS' },
          mistakes: [],
          students: [{ id: 's1', displayName: 'Amina', mistakes: [] }],
          portions: [
            { kind: 'OTHER', label: 'Invocation when getting dressed' },
            { kind: 'OTHER', label: 'Supplications for when you wake up' },
          ],
          coverage: {
            pages: [1],
            lessons: [
              { board: 'DUAS', lesson: 2 },
              { board: 'DUAS', lesson: 1 },
            ],
          },
        }),
      },
      'GET /content/duas': {
        body: envelope({
          source: { name: '', author: '', url: '', languages: [], importedAt: '' },
          categories: [],
        }),
      },
      [`POST /classes/${CID}/lesson-card`]: {
        status: 201,
        body: envelope({ id: 'card-9', submittedAt: '2026-10-15T13:31:00Z', portions: [] }),
      },
    });
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('form', { name: 'Lesson card' });

    // The portions, the intro and the homework name the same chapters.
    expect(input('lesson-card-label-0').value).toBe('Invocation when getting dressed');
    expect(input('lesson-card-label-1').value).toBe('Supplications for when you wake up');
    expect(screen.getByText(/Filled in from the 2 lessons shown in class/)).toBeTruthy();
    expect(input('lesson-card-homework').value).toBe(
      'Revise: Invocation when getting dressed; Supplications for when you wake up.',
    );
    expect(document.getElementById('lesson-card-kind-0')).toBeNull();
    expect(document.getElementById('lesson-card-fromSurah-0')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sabaq' })).toBeNull();
    expect(screen.queryByText('Layout')).toBeNull();
    expect(screen.queryByText('Last page shown')).toBeNull();

    // A lesson added by hand must be named.
    await user.click(screen.getByRole('button', { name: 'Add lesson' }));
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));
    expect(await screen.findByText('Say which lesson this was')).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await user.type(input('lesson-card-label-2'), 'Chapter 5');
    await chooseOption(input('lesson-card-grade-0'), /excellent/i);
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/lesson-cards/card-9'));
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect((post.body as { portions: unknown[] }).portions).toEqual([
      { kind: 'OTHER', label: 'Invocation when getting dressed', grade: 'EXCELLENT' },
      { kind: 'OTHER', label: 'Supplications for when you wake up' },
      { kind: 'OTHER', label: 'Chapter 5' },
    ]);
  }, 15_000);

  it('sets practice with the card: the sabaq range, due by the next class', async () => {
    const next = new Date(Date.now() + 2 * 86_400_000);
    const ymd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: {
        body: envelope({ ...prefill, course: { id: 'c1', name: 'Hifz', type: 'HIFZ' }, nextClassAt: next.toISOString() }),
      },
      [`POST /classes/${CID}/lesson-card`]: {
        status: 201,
        body: envelope({ id: 'card-9', submittedAt: '2026-10-15T13:31:00Z', portions: [] }),
      },
      'POST /practice-assignments': { status: 201, body: envelope({ id: 'pa-1' }) },
    });
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('form', { name: 'Lesson card' });

    await user.click(screen.getByLabelText(/Set practice before the next class/));
    expect(input('card-practice-fromSurah').value).toBe('2');
    expect(input('card-practice-toAyah').value).toBe('5');
    expect(input('card-practice-due').value).toBe(ymd);
    await user.clear(input('card-practice-minutes'));
    await user.type(input('card-practice-minutes'), '20');
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/teacher/lesson-cards/card-9'));
    const practice = api.calls.find((c) => c.method === 'POST' && c.url.includes('/practice-assignments'))!;
    expect(practice.body).toEqual({
      studentId: 's1',
      mode: 'MEMORISATION',
      targetMinutes: 20,
      dueOn: ymd,
      fromSurah: 2,
      fromAyah: 5,
      toSurah: 2,
      toAyah: 5,
    });
  }, 15_000);

  it('does not set practice unless asked', async () => {
    const api = mockApi({
      [`GET /classes/${CID}/lesson-card/prefill`]: { body: envelope(prefill) },
      [`POST /classes/${CID}/lesson-card`]: {
        status: 201,
        body: envelope({ id: 'card-9', submittedAt: '2026-10-15T13:31:00Z', portions: [] }),
      },
    });
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole('form', { name: 'Lesson card' });
    await user.click(screen.getByRole('button', { name: 'Submit lesson card' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(api.calls.some((c) => c.url.includes('/practice-assignments'))).toBe(false);
  });
});
