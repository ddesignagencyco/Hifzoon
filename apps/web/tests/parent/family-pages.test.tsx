// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import type { TimetableEntry } from '@/lib/api/modules/scheduling-family';
import type { TrialOffer } from '@/lib/api/modules/billing-family';
import type { LessonCardListItem } from '@/lib/api/modules/lessons-read';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/parent',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  BookingsScreen,
  bookingNextStep,
  filterBookings,
} from '@/components/parent/BookingsScreen';
import { LessonsScreen, filterLessons, lessonRows } from '@/components/parent/LessonsScreen';
import { FamilyScreen } from '@/components/parent/FamilyScreen';
import { CoursesScreen } from '@/components/parent/CoursesScreen';
import { PORTALS } from '@/lib/portal/nav';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SUMMARY = {
  id: 'f1',
  name: 'Khan Family',
  country: 'GB',
  currency: 'GBP',
  createdAt: '2026-01-01T00:00:00Z',
  members: [{ isPrimary: true, verifiedAt: '2026-01-02T00:00:00Z', relationship: 'MOTHER' }],
};
const kid = (id: string, displayName: string) => ({
  id,
  displayName,
  birthYear: 2016,
  gender: 'FEMALE',
  language: 'en',
  timeZone: 'Europe/London',
  kidsMode: false,
});
const DETAIL = {
  ...SUMMARY,
  billingName: 'Amina Khan',
  timeZone: 'Europe/London',
  members: [
    {
      id: 'm1',
      relationship: 'MOTHER',
      isPrimary: true,
      verifiedAt: '2026-01-02T00:00:00Z',
      user: { id: 'u1', name: 'Amina Khan', email: 'amina@example.test' },
    },
    {
      id: 'm2',
      relationship: 'FATHER',
      isPrimary: false,
      verifiedAt: null,
      user: { id: 'u2', name: 'Omar Khan', email: 'omar@example.test' },
    },
  ],
  students: [kid('s1', 'Maryam'), kid('s2', 'Yusuf')],
};

const DAY = 86_400_000;
const cls = (
  id: string,
  studentId: string,
  name: string,
  startsAt: string,
  extra: Partial<TimetableEntry> = {},
) =>
  ({
    id,
    type: 'REGULAR',
    status: 'SCHEDULED',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    mushafLayout: 'MADANI_15',
    teacher: { user: { name: 'Ustadh Bilal' } },
    course: { id: 'c-hifz', name: 'Hifz', code: 'HIFZ' },
    students: [{ student: { id: studentId, displayName: name } }],
    lessonCard: null,
    ...extra,
  }) as TimetableEntry;
const offer = (studentId: string, courseId: string): TrialOffer =>
  ({
    trialOutcomeId: 'out-1',
    completedAt: '2026-11-01T00:00:00Z',
    familyId: 'f1',
    student: { id: studentId, displayName: 'Maryam' },
    course: { id: courseId, code: 'HIFZ', name: 'Hifz' },
    teacher: { id: 'tp-1', userId: 'u9', name: 'Ustadh Bilal', tierId: null, tier: null },
  }) as unknown as TrialOffer;

describe('Family sidebar', () => {
  it('lists the new family pages', () => {
    const hrefs = PORTALS.parent.nav.map((n) => n.href);
    for (const href of ['/parent/family', '/parent/courses', '/parent/lessons', '/parent/bookings'])
      expect(hrefs).toContain(href);
  });
});

describe('Trials & bookings', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');

  it('links a finished trial with an offer to its plan, and says what else comes next', () => {
    const trial = cls('t1', 's1', 'Maryam', '2026-11-01T10:00:00Z', {
      type: 'TRIAL',
      status: 'COMPLETED',
    });
    expect(bookingNextStep(trial, [offer('s1', 'c-hifz')], now)).toEqual({
      kind: 'offer',
      label: 'Good result — choose a plan',
      href: '/parent/continue/out-1',
    });
    // Another child's offer does not count.
    expect(bookingNextStep(trial, [offer('s2', 'c-hifz')], now)).toEqual({
      kind: 'text',
      label: 'Waiting for the teacher’s result.',
    });
    const upcoming = cls('t2', 's1', 'Maryam', '2026-11-10T10:00:00Z', { type: 'TRIAL' });
    expect(bookingNextStep(upcoming, [], now).label).toMatch(/Trial booked/);
    const withCard = cls('r1', 's1', 'Maryam', '2026-11-02T10:00:00Z', {
      status: 'COMPLETED',
      lessonCard: { id: 'lc-1', state: 'SHARED' },
    });
    expect(bookingNextStep(withCard, [], now)).toEqual({
      kind: 'card',
      label: 'Lesson card',
      href: '/parent/children/s1?tab=lessons&card=lc-1',
    });
    expect(
      bookingNextStep(
        cls('x', 's1', 'M', '2026-11-10T10:00:00Z', { status: 'CANCELLED_FAMILY' }),
        [],
        now,
      ).label,
    ).toBe('—');
  });

  it('filters by child, course, type, status and date', () => {
    const rows = [
      cls('a', 's1', 'Maryam', '2026-11-01T10:00:00Z', { type: 'TRIAL', status: 'COMPLETED' }),
      cls('b', 's2', 'Yusuf', '2026-11-08T10:00:00Z', {
        course: { id: 'c-n', name: 'Nazra', code: 'NAZRA' },
      }),
      cls('c', 's1', 'Maryam', '2026-11-20T10:00:00Z', { type: 'MAKEUP' }),
    ];
    const base = { child: 'all', course: 'all', type: 'all', status: 'all', from: '', to: '' };
    const ids = (f: Partial<typeof base>) =>
      filterBookings(rows, { ...base, ...f }, 'UTC', now).map((r) => r.id);
    expect(ids({})).toEqual(['a', 'b', 'c']);
    expect(ids({ child: 's1' })).toEqual(['a', 'c']);
    expect(ids({ course: 'c-n' })).toEqual(['b']);
    expect(ids({ type: 'MAKEUP' })).toEqual(['c']);
    expect(ids({ status: 'Completed' })).toEqual(['a']);
    expect(ids({ from: '2026-11-02', to: '2026-11-10' })).toEqual(['b']);
  });

  it('shows every booking in a table with the offer link and filters it', async () => {
    const t = Date.now();
    const api = mockApi({
      'GET /families': { body: envelope([SUMMARY]) },
      'GET /scheduling/families/f1/timetable': {
        body: envelope([
          cls('t1', 's1', 'Maryam', new Date(t - 3 * DAY).toISOString(), {
            type: 'TRIAL',
            status: 'COMPLETED',
          }),
          cls('r1', 's2', 'Yusuf', new Date(t + 2 * DAY).toISOString()),
        ]),
      },
      'GET /billing/offers': { body: envelope([offer('s1', 'c-hifz')]) },
    });
    renderWithProviders(<BookingsScreen />);

    const table = await screen.findByRole('table');
    expect(within(table).getByRole('button', { name: 'Maryam' })).toBeTruthy();
    expect(within(table).getByRole('button', { name: 'Yusuf' })).toBeTruthy();
    expect(
      within(table).getByRole('link', { name: 'Good result — choose a plan' }).getAttribute('href'),
    ).toBe('/parent/continue/out-1');
    // The page asks for a wide window: a year back and six months ahead.
    const q = new URL(api.calls.find((c) => c.url.includes('/timetable'))!.url).searchParams;
    expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBeGreaterThan(500 * DAY);

    await chooseOption(screen.getByLabelText('Type'), 'Trial');
    await waitFor(() =>
      expect(within(screen.getByRole('table')).queryByRole('button', { name: 'Yusuf' })).toBeNull(),
    );

    // A row opens the class detail.
    await userEvent.click(
      within(screen.getByRole('table')).getByRole('button', { name: 'Maryam' }),
    );
    expect(
      within(await screen.findByRole('dialog')).getByRole('heading', { name: 'Maryam' }),
    ).toBeTruthy();
  }, 20_000);
});

const card = (
  id: string,
  startsAt: string,
  courseId: string,
  courseName: string,
): LessonCardListItem => ({
  id,
  submittedAt: startsAt,
  sharedAt: startsAt,
  lockedAt: null,
  homework: `Homework ${id}`,
  student: { displayName: 'x' },
  teacher: { name: 'Ustadh Bilal' },
  class: { startsAt, course: { id: courseId, name: courseName, code: courseName.toUpperCase() } },
  portions: [],
});

describe('Lessons', () => {
  it('merges every child’s cards newest first and filters them', () => {
    const rows = lessonRows(
      [
        { id: 's1', displayName: 'Maryam' },
        { id: 's2', displayName: 'Yusuf' },
      ],
      [
        [card('a', '2026-10-01T12:00:00Z', 'c1', 'Hifz')],
        [card('b', '2026-10-05T12:00:00Z', 'c2', 'Nazra')],
      ],
    );
    expect(rows.map((r) => [r.card.id, r.childName])).toEqual([
      ['b', 'Yusuf'],
      ['a', 'Maryam'],
    ]);
    const base = { child: 'all', course: 'all', from: '', to: '' };
    expect(filterLessons(rows, { ...base, child: 's1' }).map((r) => r.card.id)).toEqual(['a']);
    expect(filterLessons(rows, { ...base, course: 'c2' }).map((r) => r.card.id)).toEqual(['b']);
    expect(filterLessons(rows, { ...base, from: '2026-10-03' }).map((r) => r.card.id)).toEqual([
      'b',
    ]);
  });

  it('lists the cards in a table and opens one in the lesson card dialog', async () => {
    mockApi({
      'GET /families': { body: envelope([SUMMARY]) },
      'GET /families/f1': { body: envelope(DETAIL) },
      'GET /students/s1/lesson-cards': {
        body: envelope([card('lc-1', '2026-10-01T12:00:00Z', 'c1', 'Hifz')]),
      },
      'GET /students/s2/lesson-cards': {
        body: envelope([card('lc-2', '2026-10-05T12:00:00Z', 'c2', 'Nazra')]),
      },
      'GET /lesson-cards/lc-2': {
        body: envelope({
          id: 'lc-2',
          classId: 'k',
          studentId: 's2',
          homework: 'Revise Al-Fatiha',
          parentNote: null,
          aiSummaryDraft: null,
          summaryApprovedAt: null,
          submittedAt: '2026-10-05T12:00:00Z',
          sharedAt: '2026-10-05T12:00:00Z',
          lockedAt: null,
          locked: false,
          student: { id: 's2', displayName: 'Yusuf' },
          teacher: { id: 't', name: 'Ustadh Bilal' },
          portions: [],
          mistakes: [],
          class: {
            startsAt: '2026-10-05T12:00:00Z',
            mushafLayout: 'MADANI_15',
            tajweedColours: false,
          },
        }),
      },
    });
    renderWithProviders(<LessonsScreen />);
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Nazra')).toBeTruthy();
    expect(within(table).getByText('Hifz')).toBeTruthy();

    await chooseOption(screen.getByLabelText('Child'), 'Yusuf');
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Hifz')).toBeNull());

    await userEvent.click(
      within(screen.getByRole('table'))
        .getAllByRole('button')
        .find((b) => b.textContent?.includes('2026') || b.textContent?.includes('Oct'))!,
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Revise Al-Fatiha')).toBeTruthy();
  }, 20_000);
});

describe('Family page', () => {
  it('shows the family details, guardians with roles and verification', async () => {
    mockApi({
      'GET /families': { body: envelope([SUMMARY]) },
      'GET /families/f1': { body: envelope(DETAIL) },
      'GET /families/f1/guardians': { body: envelope(DETAIL.members) },
    });
    renderWithProviders(<FamilyScreen />);
    expect(await screen.findByText('Khan Family')).toBeTruthy();
    expect(screen.getByText('Europe/London')).toBeTruthy();
    expect(screen.getByText('Amina Khan', { selector: 'dd' })).toBeTruthy();
    expect(screen.getByText(/You are a verified guardian/)).toBeTruthy();
    expect(await screen.findByText('omar@example.test')).toBeTruthy();
    expect(screen.getByText('Primary')).toBeTruthy();
    expect(screen.getByText('Not verified')).toBeTruthy();
    expect(screen.getByText('Father')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add a guardian' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Maryam/ }).getAttribute('href')).toBe(
      '/parent/children/s1',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText(/Family name/)).toBeTruthy();
  }, 15_000);
});

describe('Courses page', () => {
  const ENROLMENT = (over: Record<string, unknown>) => ({
    startedAt: null,
    pausedUntil: null,
    currentLessonPosition: 1,
    currentLevel: null,
    teacher: null,
    ...over,
  });
  const ROUTES = (enrolments: unknown[] = []) => ({
    'GET /families': { body: envelope([SUMMARY]) },
    'GET /families/f1': { body: envelope(DETAIL) },
    'GET /courses/enrolments/list': { body: envelope(enrolments) },
    'GET /courses': {
      body: envelope([
        { id: 'c-n', code: 'NAZRA', name: 'Nazra', type: 'NAZRA', description: 'Reading' },
      ]),
    },
    'GET /teacher-changes': { body: envelope([]) },
    'GET /consent/students/s1': { body: envelope({ studentId: 's1', purposes: [] }) },
    'GET /consent/students/s2': { body: envelope({ studentId: 's2', purposes: [] }) },
    'GET /billing/offers': { body: envelope([]) },
  });

  const TWO = [
    ENROLMENT({
      id: 'e1',
      status: 'ACTIVE',
      student: { id: 's1', displayName: 'Maryam', birthYear: 2016 },
      course: { id: 'c-h', code: 'HIFZ', name: 'Hifz' },
      teacher: { id: 't1', user: { name: 'Ustadh Bilal' } },
    }),
    ENROLMENT({
      id: 'e2',
      status: 'TRIAL',
      student: { id: 's2', displayName: 'Yusuf', birthYear: 2018 },
      course: { id: 'c-n', code: 'NAZRA', name: 'Nazra' },
    }),
  ];

  it('lists every course in one table with one "Start a course", narrowed by the child filter', async () => {
    mockApi(ROUTES(TWO));
    renderWithProviders(<CoursesScreen />);
    expect(await screen.findByRole('cell', { name: 'Hifz' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Nazra' })).toBeTruthy();
    expect(screen.getByText('The academy is choosing a teacher')).toBeTruthy();
    // One button for the page, not one per child.
    expect(screen.getAllByRole('button', { name: 'Start a course' })).toHaveLength(1);

    await chooseOption(screen.getByLabelText('Child'), 'Yusuf');
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Hifz' })).toBeNull());
    expect(screen.getByRole('cell', { name: 'Nazra' })).toBeTruthy();
  }, 15_000);

  it('shows ended courses under All (the default), hides them under Current, and names a child with no course', async () => {
    mockApi(
      ROUTES([
        ENROLMENT({
          id: 'e3',
          status: 'CANCELLED',
          student: { id: 's1', displayName: 'Maryam', birthYear: 2016 },
          course: { id: 'c-d', code: 'DUAS', name: 'Masnoon Duas' },
        }),
      ]),
    );
    renderWithProviders(<CoursesScreen />);
    expect(await screen.findByRole('cell', { name: 'Masnoon Duas' })).toBeTruthy();
    expect(screen.getByText(/Yusuf has no course yet/)).toBeTruthy();
    await chooseOption(screen.getByLabelText('Status'), 'Current (trial, active, paused)');
    expect(await screen.findByText('No courses match these filters')).toBeTruthy();
  }, 15_000);

  it('opens "Start a course" with a child picker first, keeping the stacked footer', async () => {
    mockApi(ROUTES());
    renderWithProviders(<CoursesScreen />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Start a course' }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Start a course')).toBeTruthy();
    const book = within(dialog).getByRole('button', { name: 'Book a free trial yourself' });
    expect((book as HTMLButtonElement).disabled).toBe(true);
    const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!;
    expect(footer.className).toContain('flex-col-reverse');

    await chooseOption(within(dialog).getByLabelText(/Child/), 'Yusuf');
    await chooseOption(await within(dialog).findByLabelText(/Course/), 'Nazra');
    expect(
      within(dialog)
        .getByRole('link', { name: /Book a free trial yourself/ })
        .getAttribute('href'),
    ).toBe('/book-trial?course=NAZRA&studentId=s2');
  }, 20_000);

  it('filters by course, status and teacher', async () => {
    mockApi(ROUTES(TWO));
    renderWithProviders(<CoursesScreen />);
    expect(await screen.findByRole('cell', { name: 'Hifz' })).toBeTruthy();

    await chooseOption(screen.getByLabelText('Status'), 'Trial');
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Hifz' })).toBeNull());
    expect(screen.getByRole('cell', { name: 'Nazra' })).toBeTruthy();

    await chooseOption(screen.getByLabelText('Status'), 'All statuses');
    await chooseOption(screen.getByLabelText('Teacher'), 'Ustadh Bilal');
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Nazra' })).toBeNull());
    expect(screen.getByRole('cell', { name: 'Hifz' })).toBeTruthy();

    await chooseOption(screen.getByLabelText('Course'), 'Nazra');
    expect(await screen.findByText('No courses match these filters')).toBeTruthy();
  }, 20_000);
});
