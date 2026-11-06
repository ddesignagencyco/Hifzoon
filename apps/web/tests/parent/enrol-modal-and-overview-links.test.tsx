// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

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

import { EnrolModal } from '@/components/parent/ChildCourses';
import { ParentOverview } from '@/components/parent/ParentOverview';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COURSES = [
  { id: 'c-2', code: 'NAZRA', name: 'Nazra', type: 'NAZRA', description: 'Reading the Quran' },
];

describe('"Start a course" dialog footer', () => {
  it('stacks full-width with the primary action on top on small screens, a row from md up', async () => {
    mockApi({
      'GET /courses': { body: envelope(COURSES) },
      'GET /courses/enrolments/list': { body: envelope([]) },
    });
    renderWithProviders(<EnrolModal studentId="s1" displayName="Maryam" onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const footer = cancel.parentElement!;
    // column-reverse puts the last action (Book a trial) on top while keeping tab order.
    expect(footer.className).toContain('flex-col-reverse');
    expect(footer.className).toContain('md:flex-row');
    const book = within(dialog).getByRole('button', { name: 'Book a free trial yourself' });
    expect([...footer.children].at(-1)).toBe(book);
    for (const el of footer.children) expect(el.className).toMatch(/w-full md:w-auto/);

    // Disabled until a course is chosen, and says why.
    expect((book as HTMLButtonElement).disabled).toBe(true);
    expect(book.getAttribute('aria-describedby')).toBe('enrol-course-needed');
    expect(await within(dialog).findByText(/Choose a course to book a trial/)).toBeTruthy();

    await chooseOption(await within(dialog).findByLabelText(/Course/), 'Nazra');
    const link = within(dialog).getByRole('link', { name: /Book a free trial yourself/ });
    expect(link.getAttribute('href')).toBe('/book-trial?course=NAZRA&studentId=s1');
    expect(link.className).toMatch(/w-full md:w-auto/);
  }, 15_000);
});

describe('"Start a course" dialog: start now with a teacher', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('offers "Choose a teacher and start now" for the chosen course, inside the same stacked footer', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    mockApi({
      'GET /courses': { body: envelope(COURSES) },
      'GET /courses/enrolments/list': { body: envelope([]) },
    });
    renderWithProviders(<EnrolModal studentId="s1" displayName="Maryam" onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog');
    const footer = within(dialog).getByRole('button', { name: 'Cancel' }).parentElement!;
    expect(footer.className).toContain('flex-col-reverse');

    const disabled = within(dialog).getByRole('button', { name: 'Choose a teacher and start now' });
    expect((disabled as HTMLButtonElement).disabled).toBe(true);

    await chooseOption(await within(dialog).findByLabelText(/Course/), 'Nazra');
    const start = within(dialog).getByRole('link', { name: 'Choose a teacher and start now' });
    expect(start.getAttribute('href')).toBe('/parent/start?student=s1&course=c-2');
    expect(start.className).toMatch(/w-full md:w-auto/);
    // The free trial stays the primary action, on top when stacked.
    expect([...footer.children].at(-1)?.textContent).toMatch(/Book a free trial yourself/);
  }, 15_000);
});

describe('Parent overview', () => {
  it('links each course to the child’s Courses tab and on to the Courses and Lessons pages', async () => {
    const summary = {
      id: 'f1',
      name: 'Khan Family',
      country: 'GB',
      currency: 'GBP',
      createdAt: '2026-01-01T00:00:00Z',
      members: [{ isPrimary: true, verifiedAt: '2026-01-02T00:00:00Z', relationship: 'MOTHER' }],
    };
    mockApi({
      'GET /families': { body: envelope([summary]) },
      'GET /families/f1': {
        body: envelope({
          ...summary,
          billingName: null,
          timeZone: 'UTC',
          members: [],
          students: [
            {
              id: 's1',
              displayName: 'Maryam',
              birthYear: 2016,
              gender: 'FEMALE',
              language: 'en',
              timeZone: 'UTC',
              kidsMode: false,
            },
          ],
        }),
      },
      'GET /parent/students/s1/dashboard': {
        body: envelope({
          student: { id: 's1', displayName: 'Maryam', age: 10 },
          weekTrend: [],
          streak: null,
          attendance: { attendanceRate: null, bookedClasses: 0, attendedClasses: 0 },
          memorisation: { pagesTracked: 0, openMistakes: 0 },
          recentLessonCards: [
            {
              id: 'lc-1',
              homework: null,
              parentNote: null,
              class: { startsAt: '2026-11-01T10:00:00Z', course: { name: 'Hifz' } },
            },
          ],
          upcomingClasses: [],
          awaitingTeacher: [],
          teachers: [
            {
              enrolmentId: 'e1',
              status: 'ACTIVE',
              course: { name: 'Hifz' },
              teacher: { id: 't1', name: 'Ustadh Bilal' },
              teacherPhotoUrl: null,
            },
          ],
          hifzGoal: null,
          badges: [],
        }),
      },
      'GET /teacher-changes': { body: envelope([]) },
      'GET /courses/enrolments/e1/next-lesson': { body: envelope({ lesson: null }) },
    });
    renderWithProviders(<ParentOverview />);
    const course = await screen.findByRole('link', { name: 'Hifz' });
    expect(course.getAttribute('href')).toBe('/parent/children/s1?tab=courses');
    expect(screen.getByRole('link', { name: 'All courses' }).getAttribute('href')).toBe(
      '/parent/courses',
    );
    expect(screen.getByRole('link', { name: 'All lesson cards' }).getAttribute('href')).toBe(
      '/parent/lessons',
    );
    // Links inside the card stay usable above the card-wide link.
    expect(screen.getByRole('link', { name: 'Ustadh Bilal' }).className).toContain('z-10');
  }, 15_000);
});
