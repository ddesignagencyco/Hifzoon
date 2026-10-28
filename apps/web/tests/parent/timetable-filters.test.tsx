// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/parent/timetable',
}));

import { TimetableScreen } from '@/components/parent/TimetableScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FAMILY = { id: 'f1', name: 'Khan Family', currency: 'GBP', timeZone: 'UTC', verified: true, members: [{ userId: 'u1', isPrimary: true, verifiedAt: '2026-01-01T00:00:00Z', relationship: 'MOTHER' }] };
const cls = (id: string, name: string, studentId: string, startsAt: string) => ({
  id, type: 'REGULAR', status: 'SCHEDULED', startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
  mushafLayout: 'MADANI_15', teacherId: 't1', teacher: { user: { name: 'Ustadh Bilal' } }, course: { name: 'Hifz' },
  students: [{ student: { id: studentId, displayName: name } }], canRate: false, rated: false,
});

describe('parent timetable filters', () => {
  it('loads exactly today when "Today" is chosen and filters by child', async () => {
    const soon = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const api = mockApi({
      'GET /families': { body: envelope([FAMILY]) },
      'GET /scheduling/families/f1/timetable': { body: envelope([cls('c1', 'Maryam', 's1', soon), cls('c2', 'Yusuf', 's2', soon)]) },
    });
    const user = userEvent.setup();
    renderWithProviders(<TimetableScreen />);

    await user.click(await screen.findByRole('button', { name: 'Today' }));
    await waitFor(() => {
      const last = api.calls.filter((c) => c.url.includes('/timetable')).at(-1)!;
      const q = new URL(last.url).searchParams;
      expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(24 * 3_600_000);
    });

    // Each child appears in its class row and in the child filter chip.
    expect(await screen.findAllByText('Maryam')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Yusuf' }));
    expect(screen.getAllByText('Maryam')).toHaveLength(1); // only the chip is left
    expect(screen.getAllByText('Yusuf')).toHaveLength(2);
  }, 15_000);
});
