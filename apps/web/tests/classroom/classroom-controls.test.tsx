// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { ClassroomRoom } from '@/components/classroom/ClassroomRoom';

const CID = 'class-1';
const STARTS = new Date(Date.now() - 5 * 60_000).toISOString();
const ENDS = new Date(Date.now() + 25 * 60_000).toISOString();

function routes(page: number | null) {
  return {
    [`GET /classroom/classes/${CID}/state`]: {
      body: envelope({
        classId: CID, status: 'SCHEDULED', startsAt: STARTS, endsAt: ENDS, layout: 'MADANI_15', tajweedColours: false,
        page, highlight: null, serverTime: new Date().toISOString(),
        participants: [{ userId: 'u-t', displayName: 'Ustadh Hamza', role: 'TEACHER', joinedAt: STARTS }],
      }),
    },
    [`POST /classroom/classes/${CID}/token`]: {
      body: envelope({ sub: 'u-t', cid: CID, role: 'TEACHER', studentId: null, token: 'tok', url: 'fake://room/x', expiresAt: ENDS }),
    },
    [`POST /classroom/classes/${CID}/page`]: { body: envelope({ page: 1, layout: 'MADANI_15' }) },
    [`GET /classroom/classes/${CID}/recording/consent`]: { body: envelope({ allowed: true, students: [], missing: [] }) },
    [`GET /classroom/classes/${CID}/attendance`]: {
      body: envelope({ classId: CID, participants: [], summary: { studentsPresent: 0, guardiansPresent: 0, averageMinutes: 0, stillConnected: 0 } }),
    },
    [`GET /classes/${CID}/mistakes`]: { body: envelope([]) },
    'GET /mushaf/layouts': { body: envelope([]) },
    'GET /mushaf/pages/MADANI_15/1': {
      body: envelope({ layout: 'MADANI_15', page: 1, lines: [], surahStart: 1, ayahStart: 1, licensed: true, source: 't', cachedUntil: ENDS }),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('classroom: the teacher’s page reaches everyone', () => {
  it('publishes page 1 once the teacher joins a room with no page yet', async () => {
    const api = mockApi(routes(null));
    const user = userEvent.setup();
    renderWithProviders(<ClassroomRoom classId={CID} viewer="teacher" />);
    await user.click(await screen.findByRole('button', { name: 'Join class' }));
    await waitFor(() => {
      const posts = api.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/page'));
      expect(posts).toHaveLength(1);
      expect(posts[0].body).toEqual({ page: 1 });
    });
  }, 15_000);

  it('does not overwrite a page the class already has', async () => {
    const api = mockApi(routes(7));
    const user = userEvent.setup();
    renderWithProviders(<ClassroomRoom classId={CID} viewer="teacher" />);
    await user.click(await screen.findByRole('button', { name: 'Join class' }));
    await screen.findByRole('button', { name: /leave/i });
    expect(api.calls.some((c) => c.method === 'POST' && c.url.endsWith('/page'))).toBe(false);
  }, 15_000);
});

describe('classroom: meeting view controls', () => {
  it('hides and shows the video strip and the side panel', async () => {
    mockApi(routes(1));
    const user = userEvent.setup();
    renderWithProviders(<ClassroomRoom classId={CID} viewer="student" />);
    await screen.findByRole('button', { name: 'Hide videos' });

    await user.click(screen.getByRole('button', { name: 'Hide videos' }));
    expect(screen.getByRole('button', { name: 'Show videos' })).toBeTruthy();

    const panel = screen.getByRole('complementary', { name: 'Classroom panel' });
    expect(panel.hidden).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Hide panel' }));
    expect(screen.getByLabelText('Classroom panel', { selector: 'aside' }).hidden).toBe(true);
  }, 15_000);
});
