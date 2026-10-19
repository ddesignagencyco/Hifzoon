// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams('next=/teacher/timetable'),
  usePathname: () => '/auth/two-factor/setup',
}));

import { postLoginDestination, twoFactorSetupPath } from '@/lib/portal/nav';
import TwoFactorSetupPage from '@/app/auth/two-factor/setup/page';
import { clearAccessToken, setAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  replace.mockReset();
  clearAccessToken();
});

describe('post-sign-in 2FA step (FR-AUTH-01 / M42)', () => {
  it('sends staff without 2FA to the setup step, keeping where they were going', () => {
    expect(postLoginDestination('/teacher/timetable', [Role.TEACHER], false)).toBe('/auth/two-factor/setup?next=%2Fteacher%2Ftimetable');
    expect(postLoginDestination(null, [Role.ADMIN], false)).toBe('/auth/two-factor/setup?next=%2Fadmin');
  });

  it('leaves enrolled staff and families alone', () => {
    expect(postLoginDestination('/teacher/timetable', [Role.TEACHER], true)).toBe('/teacher/timetable');
    expect(postLoginDestination('/parent', [Role.GUARDIAN], false)).toBe('/parent');
    expect(postLoginDestination('/teacher', [Role.TEACHER])).toBe('/teacher');
  });

  it('never nests the setup step inside its own next', () => {
    expect(twoFactorSetupPath('/auth/two-factor/setup?next=/x')).toBe('/auth/two-factor/setup');
    expect(twoFactorSetupPath('https://evil.example')).toBe('/auth/two-factor/setup');
  });

  const me = (twoFactorEnabled: boolean, roles: Role[]) => ({
    id: 'u1', email: 'teacher@hifzoon.test', name: 'Bilal Rahman', roles, status: 'ACTIVE', twoFactorEnabled, timeZone: 'UTC',
  });

  it('shows the QR set-up straight away for unenrolled staff', async () => {
    setAccessToken('t');
    mockApi({
      'GET /auth/me': { body: envelope(me(false, [Role.TEACHER])) },
      'POST /auth/refresh': { body: envelope({ accessToken: 't', expiresIn: 900 }) },
    });
    renderWithProviders(<TwoFactorSetupPage />);
    expect(await screen.findByRole('heading', { name: 'Secure your staff account' })).toBeTruthy();
    expect(screen.getByLabelText(/confirm your current password/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('continues to next when 2FA is already on', async () => {
    setAccessToken('t');
    mockApi({
      'GET /auth/me': { body: envelope(me(true, [Role.TEACHER])) },
      'POST /auth/refresh': { body: envelope({ accessToken: 't', expiresIn: 900 }) },
    });
    renderWithProviders(<TwoFactorSetupPage />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/teacher/timetable'));
  });
});
