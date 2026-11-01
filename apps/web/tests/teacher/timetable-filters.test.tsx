// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/teacher/timetable',
}));

import { TimetableScreen } from '@/components/teacher/TimetableScreen';
import { ClassDetailModal } from '@/components/teacher/ClassDetailModal';
import { clearAccessToken, setAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

const cls = (id: string, name: string, studentId: string, startsAt: string, status = 'SCHEDULED') => ({
  id, type: 'REGULAR', status, startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
  mushafLayout: 'MADANI_15', course: { id: 'c', name: 'Hifz' }, localStart: startsAt, localEnd: startsAt, viewerZone: 'UTC',
  students: [{ student: { id: studentId, displayName: name } }],
});

describe('teacher timetable filters', () => {
  it('shows only today in "Today" and filters by student', async () => {
    setAccessToken('t');
    const soon = new Date(Date.now() + 60 * 60_000).toISOString();
    const api = mockApi({
      'GET /auth/me': { body: envelope({ id: 'u-t', email: 'teacher@hifzoon.test', name: 'Bilal', roles: [Role.TEACHER], status: 'ACTIVE', twoFactorEnabled: true, timeZone: 'UTC' }) },
      'POST /auth/refresh': { body: envelope({ accessToken: 't', expiresIn: 900 }) },
      'GET /teachers/me': { body: envelope({ id: 'tp1', user: { id: 'u-t', name: 'Bilal', email: null, timeZone: 'UTC' } }) },
      'GET /courses/enrolments/list': { body: envelope([]) },
      'GET /scheduling/teachers/tp1/timetable': { body: envelope([cls('a', 'Maryam', 's1', soon), cls('b', 'Yusuf', 's2', soon)]) },
    });
    const user = userEvent.setup();
    renderWithProviders(<TimetableScreen />);

    await chooseOption(await screen.findByLabelText('Show'), 'Today');
    await waitFor(() => {
      const last = api.calls.filter((c) => c.url.includes('/timetable')).at(-1)!;
      const q = new URL(last.url).searchParams;
      expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(24 * 3_600_000);
    });
    await chooseOption(await screen.findByLabelText('Student'), 'Yusuf');
    await waitFor(() => expect(screen.queryAllByText('Maryam')).toHaveLength(0));
  }, 15_000);
});

describe('class detail dialog', () => {
  it('offers no cancel or reschedule once the class has started', () => {
    const started = new Date(Date.now() - 5 * 60_000).toISOString();
    renderWithProviders(<ClassDetailModal cls={cls('a', 'Maryam', 's1', started) as never} zone="UTC" onClose={() => undefined} />);
    expect(screen.queryByRole('button', { name: /cancel class/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reschedule/i })).toBeNull();
  });
});
