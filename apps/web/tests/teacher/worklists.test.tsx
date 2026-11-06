// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LessonCardsContent, parseLessonCardStatus } from '@/components/teacher/LessonCardsScreen';
import { TrialResultsContent } from '@/components/teacher/TrialResultsScreen';
import { buildLessonCardRows, buildTrialRows, pastWindows } from '@/components/teacher/teacher-worklists';
import type { TimetableClass } from '@/lib/api/modules/teacher-schedule';
import { mockApi } from '../helpers/fetch-mock';
import { chooseOption, renderWithProviders } from '../helpers/render';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/teacher/lesson-cards',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const H = 3_600_000;
const D = 24 * H;
const NOW = Date.parse('2026-11-06T12:00:00Z');

function cls(id: string, startsAt: number, extra: Partial<TimetableClass> = {}): TimetableClass {
  return {
    id,
    type: 'REGULAR',
    status: 'COMPLETED',
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + H / 2).toISOString(),
    roomId: null,
    course: { name: 'Hifz', code: 'HIFZ' },
    students: [{ student: { id: `s-${id}`, displayName: `Student ${id}` } }],
    lessonCard: null,
    localStart: null,
    localEnd: null,
    viewerZone: 'UTC',
    ...extra,
  };
}

const owedRow = (classId: string, startsAt: number, name = `Owed ${classId}`) => ({
  classId,
  classType: 'REGULAR',
  startsAt: new Date(startsAt).toISOString(),
  endsAt: new Date(startsAt + H / 2).toISOString(),
  course: { id: 'c1', name: 'Noorani Qaida' },
  student: { id: `st-${classId}`, displayName: name },
});

describe('buildLessonCardRows', () => {
  it('lists owed cards, written and locked cards, and old completed classes with no card', () => {
    const rows = buildLessonCardRows(
      [
        cls('owed', NOW - D, { students: [{ student: { id: 'x', displayName: 'X' } }] }),
        cls('written', NOW - 10 * H, { lessonCard: { id: 'l1', state: 'SUBMITTED' } }),
        cls('locked', NOW - 5 * D, { lessonCard: { id: 'l2', state: 'SHARED' } }),
        cls('old', NOW - 20 * D),
        cls('recent-no-card', NOW - 2 * D), // inside the 7-day window and not owed: nothing to write
        cls('cancelled', NOW - 2 * D, { status: 'CANCELLED_FAMILY' }),
        cls('future', NOW + D, { status: 'SCHEDULED' }),
      ],
      [owedRow('owed', NOW - D)],
      NOW,
    );
    expect(rows.map((r) => [r.classId, r.status])).toEqual([
      ['written', 'written'],
      ['owed', 'due'],
      ['locked', 'locked'],
      ['old', 'due'],
    ]);
  });
});

describe('buildTrialRows', () => {
  it('marks waiting trials due (or teacher absent) and other ended trials recorded', () => {
    const waiting = cls('t-wait', NOW - D, { type: 'TRIAL' });
    const absent = cls('t-absent', NOW - 2 * D, { type: 'TRIAL', status: 'NO_SHOW_TEACHER' });
    const rows = buildTrialRows(
      [
        waiting,
        absent,
        cls('t-done', NOW - 3 * D, { type: 'TRIAL' }),
        cls('t-cancel', NOW - 4 * D, { type: 'TRIAL', status: 'CANCELLED_TEACHER' }),
        cls('reg', NOW - D),
      ],
      [waiting, absent],
      NOW,
    );
    expect(rows.map((r) => [r.key, r.status])).toEqual([
      ['t-wait', 'due'],
      ['t-absent', 'absent'],
      ['t-done', 'recorded'],
    ]);
  });
});

describe('pastWindows', () => {
  it('splits a long range into 30-day windows, newest first', () => {
    const w = pastWindows(NOW, 65);
    expect(w).toHaveLength(3);
    expect(w[0].to).toBe(new Date(NOW).toISOString());
    expect(w[1].to).toBe(w[0].from);
  });
});

describe('parseLessonCardStatus', () => {
  it('reads ?status=due and falls back to All', () => {
    expect(parseLessonCardStatus('due')).toBe('due');
    expect(parseLessonCardStatus('bogus')).toBe('ALL');
    expect(parseLessonCardStatus(null)).toBe('ALL');
  });
});

describe('<LessonCardsContent>', () => {
  const now = Date.now();
  const timetable = Array.from({ length: 12 }, (_, i) =>
    cls(`w${i}`, now - (i + 3) * D, {
      lessonCard: { id: `lc${i}`, state: 'SHARED' },
      course: i % 2 ? { name: 'Tajweed', code: 'TJ' } : { name: 'Hifz', code: 'HIFZ' },
    }),
  );

  it('pages the cards and filters by status, opening the composer from each row', async () => {
    mockApi({
      'GET /teacher/lesson-cards/outstanding': { body: [owedRow('due-1', now - D, 'Yusuf')] },
      'GET /scheduling/teachers/t1/timetable': { body: timetable },
    });
    renderWithProviders(<LessonCardsContent teacherId="t1" zone="UTC" />);
    expect(await screen.findByText('Yusuf')).toBeTruthy();
    // 13 rows at 10 a page: a header row plus ten.
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Write lesson card/ }).getAttribute('href')).toBe('/teacher/classroom/due-1/lesson-card');

    await chooseOption(screen.getByLabelText('Status'), 'Card due');
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(rows[1]).getAllByText('Card due').length).toBeGreaterThan(0);
  });

  it('opens on the status from the link', async () => {
    mockApi({
      'GET /teacher/lesson-cards/outstanding': { body: [owedRow('due-1', now - D, 'Yusuf')] },
      'GET /scheduling/teachers/t1/timetable': { body: timetable },
    });
    renderWithProviders(<LessonCardsContent teacherId="t1" zone="UTC" initialStatus="due" />);
    expect(await screen.findByText('Yusuf')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });
});

describe('<TrialResultsContent>', () => {
  it('lists trials with their status and opens the result form', async () => {
    const now = Date.now();
    const waiting = cls('t-wait', now - D, { type: 'TRIAL', students: [{ student: { id: 'a', displayName: 'Amina' } }] });
    mockApi({
      'GET /trials/awaiting-result': { body: [waiting] },
      'GET /scheduling/teachers/t1/timetable': {
        body: [waiting, cls('t-done', now - 3 * D, { type: 'TRIAL', students: [{ student: { id: 'b', displayName: 'Bilal' } }] })],
      },
    });
    renderWithProviders(<TrialResultsContent teacherId="t1" zone="UTC" />);
    expect(await screen.findByText('Amina')).toBeTruthy();
    // The badge shows in its column, and under the name on a phone.
    expect(screen.getAllByText('Result due').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Recorded').length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('button', { name: /Record result/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
