// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ userId: 'u-1' }),
  usePathname: () => '/teachers/u-1',
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt={String(props.alt ?? '')} src={String(props.src ?? '')} />,
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import { fetchTeachers } from '@/lib/api/client';
import { TeacherCard } from '@/components/home/TeacherCard';
import TeacherProfilePage from '@/app/teachers/[userId]/page';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE = 'https://cdn.test/recitations/fatiha.mp3';

const LIST_ROW = {
  id: 'tp-1',
  userId: 'u-1',
  bio: 'Hifz and Tajweed.',
  photoUrl: null,
  introVideoUrl: null,
  recitationSampleUrl: SAMPLE,
  gender: 'MALE',
  languages: ['en'],
  subjects: ['HIFZ'],
  ageGroups: ['6-9'],
  publicRatingAvg: null,
  user: { name: 'Ustadh Bilal Rahman' },
};

const DETAIL = {
  id: 'tp-1',
  bio: 'Hifz and Tajweed.',
  photoUrl: null,
  introVideoUrl: null,
  recitationSampleUrl: SAMPLE,
  gender: 'MALE',
  languages: ['en'],
  subjects: ['HIFZ'],
  ageGroups: ['6-9'],
  publicRatingAvg: null,
  user: { name: 'Ustadh Bilal Rahman', timeZone: 'Europe/London' },
};

const RATING = { body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }) };

describe('fetchTeachers recitation sample (§7.4)', () => {
  it('maps an http(s) recitationSampleUrl to audioSampleUrl', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([LIST_ROW]) } });
    const [t] = await fetchTeachers();
    expect(t.audioSampleUrl).toBe(SAMPLE);
  });

  it('omits a missing or non-http(s) sample rather than inventing one', async () => {
    mockApi({
      'GET /teachers/public': {
        body: envelope([
          { ...LIST_ROW, id: 'a', recitationSampleUrl: null },
          { ...LIST_ROW, id: 'b', recitationSampleUrl: 'javascript:alert(1)' },
          { ...LIST_ROW, id: 'c', recitationSampleUrl: 'recitations/key.webm' },
        ]),
      },
    });
    const teachers = await fetchTeachers();
    expect(teachers.map((t) => t.audioSampleUrl)).toEqual([undefined, undefined, undefined]);
    expect(teachers.every((t) => !('audioSampleUrl' in t))).toBe(true);
  });
});

describe('TeacherCard play button', () => {
  it('plays the live teacher sample and toggles to pause', async () => {
    mockApi({ 'GET /teachers/public': { body: envelope([LIST_ROW]) }, 'GET /quality/teachers/tp-1/rating': RATING });
    const [teacher] = await fetchTeachers();

    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const created: string[] = [];
    class FakeAudio {
      constructor(src: string) {
        created.push(src);
      }
      play = play;
      pause = pause;
      addEventListener() {}
    }
    vi.stubGlobal('Audio', FakeAudio);

    const user = userEvent.setup();
    renderWithProviders(<TeacherCard teacher={teacher} />);
    await user.click(screen.getByRole('button', { name: 'Play recitation by Ustadh Bilal Rahman' }));
    expect(created).toEqual([SAMPLE]);
    expect(play).toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Pause recitation by Ustadh Bilal Rahman' }));
    expect(pause).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('has no play button when the API gave no sample', () => {
    mockApi({ 'GET /quality/teachers/tp-1/rating': RATING });
    renderWithProviders(
      <TeacherCard
        teacher={{ id: 'tp-1', userId: 'u-1', name: 'Ustadh Bilal Rahman', gender: 'MALE', languages: [], specializations: [], source: 'api' }}
      />,
    );
    expect(screen.queryByRole('button', { name: /recitation by/i })).toBeNull();
  });
});

describe('/teachers/[userId] recitation player', () => {
  it('shows "Listen to a recitation" with an audio player for the API sample', async () => {
    mockApi({ 'GET /teachers/public/u-1': { body: envelope(DETAIL) }, 'GET /quality/teachers/tp-1/rating': RATING });
    const { container } = renderWithProviders(<TeacherProfilePage />);
    expect(await screen.findByRole('heading', { name: 'Listen to a recitation' })).toBeTruthy();
    const audio = container.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe(SAMPLE);
    expect(audio?.hasAttribute('controls')).toBe(true);
    expect(audio?.getAttribute('aria-label')).toBe('Recitation sample by Ustadh Bilal Rahman');
  });

  it('shows no player when the sample is missing or not an http(s) link', async () => {
    mockApi({
      'GET /teachers/public/u-1': { body: envelope({ ...DETAIL, recitationSampleUrl: 'javascript:alert(1)', introVideoUrl: 'javascript:alert(2)' }) },
      'GET /quality/teachers/tp-1/rating': RATING,
    });
    const { container } = renderWithProviders(<TeacherProfilePage />);
    expect(await screen.findByRole('heading', { name: 'Ustadh Bilal Rahman' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Listen to a recitation' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Introduction' })).toBeNull();
    expect(container.querySelector('audio')).toBeNull();
  });
});
