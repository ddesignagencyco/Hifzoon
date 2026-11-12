// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import type { TimetableEntry } from '@/lib/api/modules/scheduling-family';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/parent/timetable',
}));

import { TimetableScreen, sortForTimetable } from '@/components/parent/TimetableScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FAMILY = {
  id: 'f1',
  name: 'Khan Family',
  currency: 'GBP',
  timeZone: 'UTC',
  members: [{ isPrimary: true, verifiedAt: '2026-01-01T00:00:00Z', relationship: 'MOTHER' }],
};
const cls = (id: string, name: string, startsAt: string, type = 'REGULAR') =>
  ({
    id,
    type,
    status: 'SCHEDULED',
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    mushafLayout: 'MADANI_15',
    teacherId: 't1',
    teacher: { user: { name: 'Ustadh Bilal' } },
    course: { id: 'c1', name: 'Hifz', code: 'HIFZ' },
    students: [{ student: { id: 's1', displayName: name } }],
    canRate: false,
    rated: false,
  }) as unknown as TimetableEntry;

describe('parent timetable', () => {
  it('opens on "All" (the past 30 days and the next four weeks)', async () => {
    const api = mockApi({
      'GET /families': { body: envelope([FAMILY]) },
      'GET /scheduling/families/f1/timetable': { body: envelope([]) },
    });
    renderWithProviders(<TimetableScreen />);
    const when = await screen.findByLabelText('When');
    expect(when.closest('div')?.parentElement?.textContent).toContain('All');
    await waitFor(() => {
      const call = api.calls.find((c) => c.url.includes('/timetable'))!;
      const q = new URL(call.url).searchParams;
      expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(58 * 86_400_000);
    });
  });

  it('opens the class detail from a row, while Cancel opens only the cancel dialog', async () => {
    const later = new Date(Date.now() + 3 * 86_400_000).toISOString();
    mockApi({
      'GET /families': { body: envelope([FAMILY]) },
      'GET /scheduling/families/f1/timetable': {
        body: envelope([cls('c1', 'Maryam', later, 'TRIAL')]),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<TimetableScreen />);

    await user.click(await screen.findByRole('button', { name: /Class details: Maryam/ }));
    const detail = await screen.findByRole('dialog');
    expect(within(detail).getByRole('heading', { name: 'Maryam' })).toBeTruthy();
    expect(within(detail).getByText('Ustadh Bilal')).toBeTruthy();
    expect(within(detail).getAllByText('Trial').length).toBeGreaterThan(0);
    await user.click(within(detail).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // The row's own buttons do not bubble up to the row.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialogs = await screen.findAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(within(dialogs[0]).getByText('Cancel this class?')).toBeTruthy();
  }, 15_000);

  it('lists upcoming classes first, then past ones newest first', () => {
    const now = Date.parse('2026-11-06T12:00:00Z');
    const rows = [
      cls('past-old', 'A', '2026-10-01T10:00:00Z'),
      cls('next', 'B', '2026-11-07T10:00:00Z'),
      cls('past-new', 'C', '2026-11-05T10:00:00Z'),
      cls('later', 'D', '2026-11-20T10:00:00Z'),
    ];
    expect(sortForTimetable(rows, 'all', now).map((r) => r.id)).toEqual([
      'next',
      'later',
      'past-new',
      'past-old',
    ]);
    expect(sortForTimetable(rows, 'past', now).map((r) => r.id)).toEqual([
      'later',
      'next',
      'past-new',
      'past-old',
    ]);
    expect(sortForTimetable(rows, 'today', now).map((r) => r.id)).toEqual([
      'past-old',
      'past-new',
      'next',
      'later',
    ]);
  });
});
