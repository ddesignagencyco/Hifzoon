// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import { NavBadge } from '@/components/portal/NavBadges';
import { countPracticeAttention, markPracticeSeen } from '@/lib/practice-seen';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'IN_PROGRESS' as const,
  sessionCount: 1,
  lastReview: null as { at: string; by: string | null } | null,
  ...over,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe('Practice badge count', () => {
  it('counts practice not started and replies not opened since, once each', () => {
    const rows = [
      row('new', { status: 'ASSIGNED', sessionCount: 0 }),
      row('replied', { lastReview: { at: '2026-11-06T10:00:00Z', by: 'T' } }),
      row('both', { status: 'ASSIGNED', sessionCount: 0, lastReview: { at: '2026-11-06T10:00:00Z', by: 'T' } }),
      row('old-reply', { lastReview: { at: '2026-10-01T10:00:00Z', by: 'T' } }),
      row('practising'),
      row('expired', { status: 'EXPIRED', sessionCount: 0 }),
    ];
    expect(countPracticeAttention(rows, {}, NOW)).toBe(3);
    expect(countPracticeAttention(rows, { replied: Date.parse('2026-11-06T11:00:00Z') }, NOW)).toBe(2);
    // A newer reply after it was opened is new again.
    expect(countPracticeAttention(rows, { replied: Date.parse('2026-11-06T09:00:00Z') }, NOW)).toBe(3);
    expect(countPracticeAttention(undefined, {}, NOW)).toBeUndefined();
  });
});

describe('<NavBadge> for families and students', () => {
  it('Practice: drops a reply once its practice is opened', async () => {
    const at = new Date(Date.now() - 3_600_000).toISOString();
    mockApi({
      'GET /practice-assignments': {
        body: envelope([row('a1', { lastReview: { at, by: 'T' } }), row('a2', { status: 'ASSIGNED', sessionCount: 0 })]),
      },
    });
    renderWithProviders(<NavBadge kind="practiceAttention" viewerUserId="u-1" />);
    expect((await screen.findByText('2')).textContent).toBe('2 practice to do or replies to read');
    act(() => markPracticeSeen('a1'));
    expect(await screen.findByText('1')).toBeTruthy();
  });

  it('Mistakes (student): the number of open mistakes', async () => {
    const m = (id: string, over: Record<string, unknown> = {}) => ({
      id,
      surah: 1,
      ayah: 2,
      wordIndex: 0,
      type: 'VOWEL_HARAKAH',
      tajweedRule: null,
      source: 'CLASS',
      confirmed: true,
      dismissedAt: null,
      resolvedAt: null,
      occurredAt: '2026-11-01T10:00:00Z',
      lessonCardId: null,
      classId: 'c1',
      ...over,
    });
    mockApi({
      'GET /courses/enrolments/list': { body: envelope([{ id: 'e1', student: { id: 'st-1', displayName: 'Demo' } }]) },
      'GET /students/st-1/mistakes': {
        body: envelope([m('m1'), m('m2'), m('fixed', { resolvedAt: '2026-11-02T10:00:00Z' }), m('ai', { confirmed: false })]),
      },
    });
    renderWithProviders(<NavBadge kind="openMistakesStudent" viewerUserId="u-1" />);
    expect((await screen.findByText('2')).textContent).toBe('2 open mistakes to practise');
  });
});
