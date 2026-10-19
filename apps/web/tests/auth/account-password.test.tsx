// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
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

describe('Account security → Password', () => {
  it('emails a reset link to the signed-in account', async () => {
    setAccessToken('t');
    const api = mockApi({
      'GET /auth/me': { body: envelope({ id: 'u1', email: 'parent@hifzoon.test', name: 'Ayesha Khan', roles: [Role.GUARDIAN], status: 'ACTIVE', twoFactorEnabled: false, timeZone: 'UTC' }) },
      'POST /auth/refresh': { body: envelope({ accessToken: 't', expiresIn: 900 }) },
      'GET /auth/sessions': { body: envelope([]) },
      'GET /auth/oauth/providers': { body: envelope([]) },
      'POST /auth/forgot-password': { status: 202, body: envelope(null) },
    });
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);
    await user.click(await screen.findByRole('button', { name: 'Email me a reset link' }));
    expect(await screen.findByText(/We sent a reset link to parent@hifzoon\.test/)).toBeTruthy();
    const call = api.calls.find((c) => c.url.endsWith('/auth/forgot-password'));
    expect(call?.body).toEqual({ email: 'parent@hifzoon.test' });
  }, 15_000);
});
