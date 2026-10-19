// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findSuccessToast, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ currentUser: { id: 'u-t1', name: 'Ustadh Bilal', timeZone: 'Europe/London' } }),
}));

import { ProfileScreen } from '@/components/teacher/ProfileScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ME = {
  id: 'tp-1',
  hiringStatus: 'APPROVED',
  readyToMatch: true,
  safeguardingTrainingCompletedAt: null,
  bio: 'Hifz teacher',
  photoUrl: null,
  introVideoUrl: null,
  recitationSampleUrl: 'https://cdn.test/fatiha.mp3',
  qualifications: null,
  languages: ['en'],
  subjects: ['HIFZ'],
  ageGroups: ['6-9'],
  gender: 'MALE',
  ratingAvg: '0',
  ratingCount: 0,
  pendingProfileChanges: { bio: 'Pending bio' },
  user: { id: 'u-t1', name: 'Ustadh Bilal', email: 'b@test', timeZone: 'Europe/London' },
  availability: [],
};

const COURSES = [
  { id: 'c1', code: 'HIFZ', name: 'Hifz', type: 'HIFZ', description: 'Memorise.', levels: [] },
  { id: 'c2', code: 'TAJWEED', name: 'Tajweed', type: 'TAJWEED', description: 'Rules.', levels: [] },
];

function routes(extra: Record<string, unknown> = {}) {
  return {
    'GET /teachers/me': { body: envelope(ME) },
    'GET /teachers/public/u-t1': { body: envelope({ ...ME, publicRatingAvg: null }) },
    'GET /courses': { body: envelope(COURSES) },
    'GET /courses/enrolments/list': { body: envelope([]) },
    'GET /quality/teachers/tp-1/rating': { body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }) },
    ...extra,
  } as Parameters<typeof mockApi>[0];
}

describe('ProfileScreen', () => {
  it('prefills from GET /teachers/me and shows its pending changes', async () => {
    mockApi(routes());
    renderWithProviders(<ProfileScreen />);
    expect(await screen.findByText(/Awaiting review: Bio\./)).toBeTruthy();
    expect((screen.getByLabelText('Recitation sample link') as HTMLInputElement).value).toBe('https://cdn.test/fatiha.mp3');
    expect((screen.getByLabelText('English') as HTMLInputElement).checked).toBe(true);
    expect((await screen.findByLabelText(/^Hifz/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/^Tajweed/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('6-9') as HTMLInputElement).checked).toBe(true);
  });

  it('sends only the changed lists and shows the staged set the API returns', async () => {
    let meAfter = ME;
    const api = mockApi(
      routes({
        'GET /teachers/me': () => ({ body: envelope(meAfter) }),
        'PATCH /teachers/me/profile': () => {
          meAfter = { ...ME, pendingProfileChanges: { bio: 'Pending bio', subjects: ['HIFZ', 'TAJWEED'] } } as typeof ME;
          return { body: envelope({ id: 'tp-1', pendingProfileChanges: meAfter.pendingProfileChanges }) };
        },
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ProfileScreen />);
    await user.click(await screen.findByLabelText(/^Tajweed/));
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));

    await findSuccessToast('Profile changes sent for approval.');
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ changes: { subjects: ['HIFZ', 'TAJWEED'] } });
    await waitFor(() => expect(screen.getByText(/Awaiting review: Bio, Subjects\./)).toBeTruthy());
  });
});
