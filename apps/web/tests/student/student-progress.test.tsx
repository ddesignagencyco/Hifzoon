// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { progressTitle, StudentProgress } from '@/components/student/StudentProgress';
import { navForRoles, PORTALS } from '@/lib/portal/nav';
import { Role } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const enrolment = (code: string, name: string, level: { id: string; name: string; position: number }) => ({
  id: `e-${code}`, status: 'ACTIVE', startedAt: null, pausedUntil: null, currentLessonPosition: 3,
  student: { id: 's1', displayName: 'Yusuf', birthYear: 2011 },
  course: { id: `c-${code}`, code, name },
  currentLevel: level,
  teacher: { id: 't', user: { name: 'Ustadh Omar' } },
});
const HIFZ = enrolment('HIFZ', 'Hifz', { id: 'h3', name: 'Revision mastery', position: 3 });
const QAIDA = enrolment('QAIDA', 'Noorani Qaida', { id: 'q2', name: 'Letter forms', position: 2 });
const catalogue = [
  {
    id: 'c-QAIDA', code: 'QAIDA', name: 'Noorani Qaida', description: '', levels: [
      { id: 'q1', name: 'Beginner', position: 1, lessons: [{ id: 'l1' }, { id: 'l2' }] },
      { id: 'q2', name: 'Letter forms', position: 2, lessons: [{ id: 'l3' }, { id: 'l4' }, { id: 'l5' }, { id: 'l6' }] },
      { id: 'q3', name: 'Word reading', position: 3, lessons: [{ id: 'l7' }] },
    ],
  },
];

function routes(rows: unknown[]) {
  return {
    'GET /courses/enrolments/list': { body: envelope(rows) },
    'GET /courses': { body: envelope(catalogue) },
    'GET /hifz/students/s1/pages': { body: envelope([]) },
    'GET /students/s1/lesson-cards': { body: envelope([]) },
    'GET /students/s1/mistakes': { body: envelope([]) },
  };
}

describe('student progress page', () => {
  it('is "My progress" in the student menu', () => {
    expect(navForRoles(PORTALS.student, [Role.STUDENT]).map((i) => i.label)).toContain('My progress');
  });

  it('names the page after the course', () => {
    expect(progressTitle([HIFZ] as never)).toBe('Hifz progress');
    expect(progressTitle([QAIDA] as never)).toBe('Noorani Qaida progress');
    expect(progressTitle([HIFZ, QAIDA] as never)).toBe('My progress');
  });

  it('shows the Mushaf map for Hifz and the level ladder for Qaida', async () => {
    mockApi(routes([HIFZ, QAIDA]));
    const user = userEvent.setup();
    renderWithProviders(<StudentProgress />);

    expect(await screen.findByRole('heading', { name: 'My progress' })).toBeTruthy();
    expect(await screen.findByText('Hifz tracker not set up yet')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Noorani Qaida' }));
    expect(await screen.findByText('Lesson 3 of 4')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.queryByText('Hifz tracker not set up yet')).toBeNull();
  }, 15_000);
});
