// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, renderWithProviders } from '../helpers/render';
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

    await chooseOption(await screen.findByLabelText('When'), 'Today');
    await waitFor(() => {
      const last = api.calls.filter((c) => c.url.includes('/timetable')).at(-1)!;
      const q = new URL(last.url).searchParams;
      expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(24 * 3_600_000);
    });

    // Both children's classes show until the child filter narrows them.
    expect(await screen.findAllByText('Maryam')).toHaveLength(1);
    await chooseOption(screen.getByLabelText('Child'), 'Yusuf');
    await waitFor(() => expect(screen.queryAllByText('Maryam')).toHaveLength(0));
    expect(screen.getAllByText('Yusuf').length).toBeGreaterThanOrEqual(1);
  }, 15_000);
});
