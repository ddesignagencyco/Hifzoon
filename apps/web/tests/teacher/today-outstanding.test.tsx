// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TodayContent } from '@/components/teacher/TodayScreen';
import { AttentionBanners } from '@/components/parent/FamilyDashboard';
import { mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/teacher',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const H = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const zone = 'UTC';

function cls(id: string, offsetMs: number, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'REGULAR',
    status: 'SCHEDULED',
    startsAt: iso(offsetMs),
    endsAt: iso(offsetMs + H / 2),
    roomId: null,
    course: { name: 'Hifz', code: 'HIFZ' },
    students: [{ student: { id: `s-${id}`, displayName: name } }],
    lessonCard: null,
    localStart: null,
    localEnd: null,
    viewerZone: zone,
    ...extra,
  };
}

const owed = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    classId: `past-${i}`,
    classType: 'REGULAR',
    startsAt: iso(-(i + 1) * 24 * H),
    endsAt: iso(-(i + 1) * 24 * H + H / 2),
    course: { id: 'c1', name: 'Noorani Qaida' },
    student: { id: `st-${i}`, displayName: `Owed ${i}` },
  }));

describe('Today: compact dashboard', () => {
  it('links each stat tile to its page and caps "Needs your attention" at three rows a group', async () => {
    mockApi({
      'GET /scheduling/teachers/t1/timetable': { body: [] },
      'GET /teacher/lesson-cards/outstanding': { body: owed(5) },
      'GET /trials/awaiting-result': {
        body: [
          { id: 'tr-1', type: 'TRIAL', status: 'COMPLETED', startsAt: iso(-2 * H), endsAt: iso(-H), roomId: null, course: null, students: [{ student: { id: 'a', displayName: 'Amina' } }] },
          { id: 'tr-2', type: 'TRIAL', status: 'NO_SHOW_TEACHER', startsAt: iso(-5 * H), endsAt: iso(-4 * H), roomId: null, course: null, students: [{ student: { id: 'b', displayName: 'Bilal' } }] },
        ],
      },
      'GET /practice-sessions/to-review': { body: [] },
    });
    renderWithProviders(<TodayContent teacherId="t1" zone={zone} activeStudents={4} />);
    const attention = await screen.findByRole('region', { name: 'Cards due' });
    expect(within(attention).getAllByRole('listitem')).toHaveLength(3);
    expect(within(attention).getByRole('link', { name: /View all/ }).getAttribute('href')).toBe('/teacher/lesson-cards?status=due');
    // A trial marked "Teacher absent" has no result to record.
    const trials = screen.getByRole('region', { name: 'Trial results due' });
    expect(within(trials).getByText('Amina')).toBeTruthy();
    expect(within(trials).queryByText('Bilal')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Practice to review' })).toBeNull();

    expect(screen.getByRole('link', { name: /Cards due/ }).getAttribute('href')).toBe('/teacher/lesson-cards?status=due');
    expect(screen.getByRole('link', { name: /Classes today/ }).getAttribute('href')).toBe('/teacher/timetable');
    expect(screen.getByRole('link', { name: /Trial results due/ }).getAttribute('href')).toBe('/teacher/trials?status=due');
    expect(screen.getByRole('link', { name: /Practice to review/ }).getAttribute('href')).toBe('/teacher/practice');
    expect(screen.getByRole('link', { name: /Active students/ }).getAttribute('href')).toBe('/teacher/students');

    await userEvent.setup().click(within(trials).getByRole('button', { name: /Record result for Amina/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('hides "Needs your attention" when nothing is waiting and shows one-line empty notes', async () => {
    mockApi({
      'GET /scheduling/teachers/t1/timetable': { body: [] },
      'GET /teacher/lesson-cards/outstanding': { body: [] },
      'GET /trials/awaiting-result': { body: [] },
      'GET /practice-sessions/to-review': { body: [] },
    });
    renderWithProviders(<TodayContent teacherId="t1" zone={zone} activeStudents={0} />);
    expect(await screen.findByText('No classes today.')).toBeTruthy();
    expect(screen.getByText('Nothing scheduled in the next seven days.')).toBeTruthy();
    expect(screen.queryByText('Needs your attention')).toBeNull();
  });

  it('lists only today’s classes under Today, and at most five coming up', async () => {
    const tomorrow = 30 * H; // always another calendar day in UTC
    mockApi({
      'GET /scheduling/teachers/t1/timetable': {
        body: [
          cls('now', -10 * 60_000, 'Live Student', { status: 'LIVE' }),
          ...Array.from({ length: 7 }, (_, i) => cls(`up-${i}`, tomorrow + i * 24 * H, `Upcoming ${i}`)),
        ],
      },
      'GET /teacher/lesson-cards/outstanding': { body: [] },
      'GET /trials/awaiting-result': { body: [] },
      'GET /practice-sessions/to-review': { body: [] },
    });
    renderWithProviders(<TodayContent teacherId="t1" zone={zone} activeStudents={1} />);
    expect(await screen.findByText('Live Student')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Rejoin class/ })).toBeTruthy();
    expect(screen.getAllByText(/^Upcoming \d$/)).toHaveLength(5);
    expect(screen.getByRole('link', { name: /Full timetable/ }).getAttribute('href')).toBe('/teacher/timetable');
  });
});

describe('Family overview: weekly times banner', () => {
  it('asks the family to choose weekly times when the plan needs them', async () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    mockApi({
      'GET /billing/offers': { body: [] },
      'GET /billing/family': {
        body: {
          invoices: [],
          subscriptions: [
            {
              id: 'sub-1',
              familyId: 'f1',
              status: 'ACTIVE',
              plan: { name: 'Hifz 3x', classesPerWeek: 3 },
              setup: { timesNeeded: true },
            },
            {
              id: 'sub-2',
              familyId: 'f1',
              status: 'ACTIVE',
              plan: { name: 'Qaida 2x', classesPerWeek: 2 },
              setup: { scheduleError: 'slot taken' },
            },
          ],
        },
      },
    });
    renderWithProviders(<AttentionBanners familyId="f1" />);
    expect(await screen.findByText(/Hifz 3x now has 3 classes a week/)).toBeTruthy();
    expect(screen.getByText(/couldn’t book the weekly times you chose for Qaida 2x/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Choose times' })).toHaveLength(2);
  });
});
