// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ userId: 'u-missing' }),
  usePathname: () => '/teachers',
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt={String(props.alt ?? '')} src={String(props.src ?? '')} />,
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import { PublicLoadState } from '@/components/landing/PublicLoadState';
import { TeacherCard } from '@/components/home/TeacherCard';
import TeachersPage from '@/app/teachers/page';
import TeacherProfilePage from '@/app/teachers/[userId]/page';
import { NotificationsCenter } from '@/components/portal/NotificationsCenter';
import type { TeacherProfile } from '@/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TEACHER: TeacherProfile = {
  id: 'tp-1',
  userId: 'u-1',
  name: 'Ustadh Bilal Rahman',
  gender: 'MALE',
  photoUrl: null,
  bio: 'Hifz and Tajweed.',
  languages: ['English'],
  specializations: ['HIFZ'],
  ageGroups: ['6-9'],
  rating: 4.8, // seed-only `publicRatingAvg` — must not be shown
  source: 'api',
};

describe('PublicLoadState', () => {
  it('shows loading, a retryable error, an honest empty message, then the content', async () => {
    const retry = vi.fn();
    const { rerender } = renderWithProviders(
      <PublicLoadState isLoading isError={false} isEmpty what="plans">content</PublicLoadState>,
    );
    expect(screen.getByRole('status').textContent).toContain('Loading plans');

    rerender(<PublicLoadState isLoading={false} isError isEmpty onRetry={retry} what="plans">content</PublicLoadState>);
    expect(screen.getByRole('alert').textContent).toContain("couldn't load the plans");
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalled();

    rerender(<PublicLoadState isLoading={false} isError={false} isEmpty what="plans" emptyText="None offered.">content</PublicLoadState>);
    expect(screen.getByText('None offered.')).toBeTruthy();

    rerender(<PublicLoadState isLoading={false} isError={false} isEmpty={false} what="plans">content</PublicLoadState>);
    expect(screen.getByText('content')).toBeTruthy();
  });
});

describe('TeacherCard', () => {
  it('shows the live rating with its count and links to the public profile', async () => {
    mockApi({
      'GET /quality/teachers/tp-1/rating': {
        body: envelope({ teacherId: 'tp-1', average: 4.6, count: 23, distribution: [] }),
      },
    });
    renderWithProviders(<TeacherCard teacher={TEACHER} />);
    expect(await screen.findByText('4.6')).toBeTruthy();
    expect(screen.getByText(/23 family ratings/)).toBeTruthy();
    expect(screen.queryByText('4.8')).toBeNull();
    expect(screen.getByRole('link', { name: TEACHER.name }).getAttribute('href')).toBe('/teachers/u-1');
    expect(screen.getByRole('link', { name: /request a trial/i }).getAttribute('href')).toBe('/book-trial?teacher=tp-1');
  });

  it('hides the rating until a family has rated', async () => {
    const api = mockApi({
      'GET /quality/teachers/tp-1/rating': { body: envelope({ teacherId: 'tp-1', average: null, count: 0, distribution: [] }) },
    });
    renderWithProviders(<TeacherCard teacher={TEACHER} />);
    await vi.waitFor(() => expect(api.calls.length).toBe(1));
    expect(screen.queryByText(/family rating/)).toBeNull();
  });
});

describe('/teachers directory', () => {
  it('shows a retryable error instead of invented teachers when the API fails', async () => {
    mockApi({ 'GET /teachers/public': apiError(500, 'INTERNAL_ERROR', 'Internal server error') });
    renderWithProviders(<TeachersPage />);
    expect((await screen.findByRole('alert')).textContent).toContain("couldn't load the teachers");
    expect(screen.queryAllByRole('article')).toHaveLength(0);
  });

  it('filters by teaching language', async () => {
    mockApi({
      'GET /teachers/public': {
        body: envelope([
          { id: 'a', userId: 'ua', bio: null, photoUrl: null, gender: 'MALE', languages: ['en'], subjects: ['HIFZ'], ageGroups: [], user: { name: 'Teacher A' } },
          { id: 'b', userId: 'ub', bio: null, photoUrl: null, gender: 'FEMALE', languages: ['ur'], subjects: ['TAJWEED'], ageGroups: [], user: { name: 'Teacher B' } },
        ]),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<TeachersPage />);
    expect(await screen.findByText('Teacher A')).toBeTruthy();
    expect(screen.getByText('Teacher B')).toBeTruthy();

    await user.click(screen.getByLabelText('Teaching language'));
    await user.click(await screen.findByRole('option', { name: 'Urdu' }));
    expect(screen.queryByText('Teacher A')).toBeNull();
    expect(screen.getByText('Teacher B')).toBeTruthy();
  });
});

describe('/teachers/[userId]', () => {
  it('explains a profile that is not public (404) instead of an error', async () => {
    mockApi({ 'GET /teachers/public/u-missing': apiError(404, 'NOT_FOUND', 'Teacher not found') });
    renderWithProviders(<TeacherProfilePage />);
    expect(await screen.findByText(/not taking new students/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /see all teachers/i }).getAttribute('href')).toBe('/teachers');
  });
});

describe('Notifications inbox', () => {
  it('loads the newest 100 in one page (the API ignores paging) and tones delivery status', async () => {
    const api = mockApi({
      'GET /notifications?page=1&limit=100': {
        body: envelope(
          [
            { id: 'n1', type: 'CLASS_REMINDER', channel: 'WHATSAPP', status: 'READ', sentAt: '2026-10-16T08:00:00.000Z', createdAt: '2026-10-16T07:59:00.000Z', payload: {} },
            { id: 'n2', type: 'CLASS_REMINDER', channel: 'EMAIL', status: 'FAILED', sentAt: null, createdAt: '2026-10-15T07:59:00.000Z', payload: {} },
          ],
          { requestId: 'r', pagination: { page: 1, limit: 100, total: 240, totalPages: 3 } },
        ),
      },
      'GET /notifications/preferences': { body: envelope(null) },
    });
    renderWithProviders(<NotificationsCenter />);

    expect(await screen.findByText('Latest 2 of 240 notifications')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getAllByText(/^Sent /)).toHaveLength(1);
    const list = api.calls.filter((c) => /\/notifications\?/.test(c.url));
    expect(list).toHaveLength(1);
    expect(list[0].url).toContain('limit=100');
  });
});
