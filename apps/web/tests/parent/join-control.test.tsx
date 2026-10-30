// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { JoinControl } from '@/components/parent/TimetableScreen';
import type { TimetableEntry } from '@/lib/api/modules/scheduling-family';

afterEach(cleanup);

const START = Date.parse('2026-10-19T16:00:00Z');
const entry = (status: string) =>
  ({
    id: 'cls-1',
    status,
    startsAt: '2026-10-19T16:00:00Z',
    endsAt: '2026-10-19T16:30:00Z',
    students: [{ student: { id: 's1', displayName: 'Yusuf' } }],
  }) as unknown as TimetableEntry;

describe('Timetable "Join to watch"', () => {
  it('offers joining as the child or watching once the room is open (10 minutes before start)', () => {
    render(<JoinControl entry={entry('SCHEDULED')} zone="UTC" now={START - 5 * 60_000} />);
    expect(screen.getByRole('link', { name: /join as yusuf/i }).getAttribute('href')).toBe('/parent/classroom/cls-1?as=s1');
    expect(screen.getByRole('link', { name: /watch only/i }).getAttribute('href')).toBe('/parent/classroom/cls-1?as=watch');
  });

  it('says when the room opens before that', () => {
    render(<JoinControl entry={entry('SCHEDULED')} zone="UTC" now={START - 60 * 60_000} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/join opens at/i).textContent).toMatch(/15:50|3:50/);
  });

  it('shows nothing for cancelled classes or after the class', () => {
    const { container } = render(<JoinControl entry={entry('CANCELLED_FAMILY')} zone="UTC" now={START} />);
    expect(container.textContent).toBe('');
    cleanup();
    const after = render(<JoinControl entry={entry('SCHEDULED')} zone="UTC" now={START + 60 * 60_000} />);
    expect(after.container.textContent).toBe('');
  });
});
