// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/account/security',
}));

import AccountSecurityPage from '@/app/account/security/page';
import { clearAccessToken, setAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

function baseRoutes(extra: Parameters<typeof mockApi>[0] = {}) {
  return {
    'GET /auth/me': { body: envelope({ id: 'u1', email: 'parent@hifzoon.test', name: 'Ayesha Khan', roles: [Role.GUARDIAN], status: 'ACTIVE', twoFactorEnabled: false, timeZone: 'UTC' }) },
    'POST /auth/refresh': { body: envelope({ accessToken: 't', expiresIn: 900 }) },
    'GET /auth/sessions': { body: envelope([]) },
    'GET /auth/oauth/providers': { body: envelope([]) },
    ...extra,
  } as Parameters<typeof mockApi>[0];
}

describe('Account security → Password', () => {
  it('changes the password while signed in and reports the other sessions ended (M69)', async () => {
    setAccessToken('t');
    const api = mockApi(baseRoutes({ 'POST /auth/change-password': { body: envelope({ otherSessionsRevoked: 2 }) } }));
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);
    await user.type(await screen.findByLabelText('Current password'), 'old-password-123');
    await user.type(screen.getByLabelText('New password'), 'new-password-456');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/signed out of 2 other sessions/)).toBeTruthy();
    const call = api.calls.find((c) => c.url.endsWith('/auth/change-password'));
    expect(call?.body).toEqual({ currentPassword: 'old-password-123', newPassword: 'new-password-456' });
  }, 15_000);

  it('validates locally and shows the API error for a wrong current password', async () => {
    setAccessToken('t');
    const api = mockApi(
      baseRoutes({ 'POST /auth/change-password': apiError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect') }),
    );
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);
    await user.type(await screen.findByLabelText('Current password'), 'wrong-password-1');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Use at least 12 characters/)).toBeTruthy();
    expect(api.calls.some((c) => c.url.endsWith('/auth/change-password'))).toBe(false);

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'new-password-456');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-password-456');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Current password is incorrect')).toBeTruthy();
  }, 15_000);

  it('still emails a link for accounts that sign in with a provider', async () => {
    setAccessToken('t');
    const api = mockApi(baseRoutes({ 'POST /auth/forgot-password': { status: 202, body: envelope(null) } }));
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);
    await user.click(await screen.findByRole('button', { name: /Email me a link to set a password/ }));
    expect(await screen.findByText(/We sent a link to parent@hifzoon\.test/)).toBeTruthy();
    const call = api.calls.find((c) => c.url.endsWith('/auth/forgot-password'));
    expect(call?.body).toEqual({ email: 'parent@hifzoon.test' });
  }, 15_000);
});
