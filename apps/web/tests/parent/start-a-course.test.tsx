// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChildCourses } from '@/components/parent/ChildCourses';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { chooseOption, findSuccessToast, renderWithProviders } from '../helpers/render';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const S = 'stu-1';

function enrolment(id: string, status: string, teacher: { id: string; user: { name: string } } | null) {
  return {
    id,
    status,
    startedAt: null,
    pausedUntil: null,
    currentLessonPosition: 1,
    student: { id: S, displayName: 'Maryam', birthYear: 2016 },
    course: { id: 'c-1', code: 'HIFZ', name: 'Hifz programme' },
    currentLevel: null,
    teacher,
  };
}

const COURSES = [
  { id: 'c-1', code: 'HIFZ', name: 'Hifz programme', type: 'HIFZ', description: 'Memorisation' },
  { id: 'c-2', code: 'NAZRA', name: 'Nazra', type: 'NAZRA', description: 'Reading the Quran' },
];

function mockCourses(enrolments: unknown[], offers: unknown[] = []) {
  return mockApi({
    'GET /courses/enrolments/list': { body: envelope(enrolments) },
    'GET /teacher-changes': { body: envelope([]) },
    [`GET /consent/students/${S}`]: {
      body: envelope({
        studentId: S,
        purposes: [{ purpose: 'DATA_COLLECTION', status: 'GRANTED', grantedAt: '2026-10-01T00:00:00.000Z', withdrawnAt: null, policyVersion: 'v1' }],
      }),
    },
    'GET /billing/offers': { body: envelope(offers) },
    'GET /courses': { body: envelope(COURSES) },
    'GET /teachers/tp-1/rating': { body: envelope({ average: null, count: 0 }) },
    'GET /courses/enrolments/e-1/next-lesson': { body: envelope({ lesson: null }) },
    'POST /courses/enrolments': {
      status: 201,
      body: envelope({ id: 'e-new', status: 'TRIAL', course: { id: 'c-2', code: 'NAZRA', name: 'Nazra' } }),
    },
  });
}

describe('starting a course from a child’s Courses tab', () => {
  it('offers booking a trial yourself (child and course chosen) or asking the academy', async () => {
    const api = mockCourses([]);
    const user = userEvent.setup();
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" />);

    await user.click(await screen.findByRole('button', { name: 'Start a course' }));
    const dialog = await screen.findByRole('dialog');
    await chooseOption(await within(dialog).findByLabelText(/Course/), 'Nazra');

    const book = within(dialog).getByRole('link', { name: /Book a free trial yourself/ });
    expect(book.getAttribute('href')).toBe(`/book-trial?course=NAZRA&studentId=${S}`);

    await user.click(within(dialog).getByRole('button', { name: 'Ask the academy to choose a teacher' }));
    await findSuccessToast(/academy will choose a teacher for Maryam in Nazra and book the trial/);
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ studentId: S, courseId: 'c-2' });
  }, 15_000);

  it('explains a trial waiting for a teacher and lets the family book it themselves', async () => {
    mockCourses([enrolment('e-1', 'TRIAL', null)]);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" />);

    expect(await screen.findByText(/The academy is choosing a teacher and will book the trial time/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Book a free trial yourself/ }).getAttribute('href')).toBe(
      `/book-trial?course=HIFZ&studentId=${S}`,
    );
    // A regular class needs a plan first, so a trial offers no "Book a class".
    expect(screen.queryByRole('button', { name: 'Book a class' })).toBeNull();
  });

  it('says what follows a booked trial, and links the plan once the trial is won', async () => {
    mockCourses(
      [enrolment('e-1', 'TRIAL', { id: 'tp-1', user: { name: 'Ustadh Bilal' } })],
      [{ trialOutcomeId: 'out-1', enrolmentId: 'e-1', teacher: { id: 'tp-1', userId: 'u-1', name: 'Ustadh Bilal', tierId: null, tier: null } }],
    );
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" />);

    expect(await screen.findByText('The trial went well')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choose a plan' }).getAttribute('href')).toBe('/parent/continue/out-1');
  });

  it('points to the teacher’s result while a trial is booked', async () => {
    mockCourses([enrolment('e-1', 'TRIAL', { id: 'tp-1', user: { name: 'Ustadh Bilal' } })]);
    renderWithProviders(<ChildCourses studentId={S} familyId="fam-1" displayName="Maryam" />);

    expect(await screen.findByText(/Next: the trial class with Ustadh Bilal, then the teacher’s result/)).toBeTruthy();
  });
});
