// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, findErrorToast } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/account/security',
}));

import AccountSecurityPage from '@/app/account/security/page';
import { clearAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

const SESSION = {
  id: 'sess-1',
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 Test Browser',
  lastActiveAt: '2026-10-15T09:00:00.000Z',
  expiresAt: '2026-10-22T09:00:00.000Z',
  createdAt: '2026-10-14T09:00:00.000Z',
  staff: false,
};

describe('account security (portal screen)', () => {
  it('renders without the public site chrome and lists sessions in a table', async () => {
    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHORIZED', 'No session'),
      'GET /auth/sessions': { body: envelope([SESSION]) },
    });
    renderWithProviders(<AccountSecurityPage />);

    expect(screen.getByRole('heading', { level: 1, name: /security & sessions/i })).toBeTruthy();
    expect(await screen.findByText('203.0.113.7')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    // No marketing header/footer inside the page itself.
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });

  it('tells guardians and students that 2FA is for staff accounts', async () => {
    mockApi({
      'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: GUARDIAN }) },
      'GET /auth/me': { body: envelope(GUARDIAN) },
      'GET /auth/sessions': { body: envelope([]) },
    });
    renderWithProviders(<AccountSecurityPage />);

    expect(await screen.findByText(/available for teacher and staff accounts only/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /set up two-factor/i })).toBeNull();
  });

  it('rejects a wrong password with a toast and never starts 2FA setup', async () => {
    const api = mockApi({
      'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: TEACHER }) },
      'GET /auth/me': { body: envelope(TEACHER) },
      'GET /auth/sessions': { body: envelope([]) },
      'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect'),
      'POST /auth/two-factor/setup': { status: 201, body: envelope(SETUP) },
    });
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);

    await user.click(await screen.findByRole('button', { name: /set up two-factor/i }));
    await user.type(screen.getByLabelText(/confirm your current password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    await findErrorToast(/password is not correct/i);
    expect(api.calls.some((c) => c.url.endsWith('/auth/two-factor/setup'))).toBe(false);
    // The re-auth check must not touch the current session's refresh cookie.
    expect(api.calls.find((c) => c.url.endsWith('/auth/login'))).toBeTruthy();
  });

  it('shows a QR code and the secret key after a correct password', async () => {
    const api = mockApi({
      'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: TEACHER }) },
      'GET /auth/me': { body: envelope(TEACHER) },
      'GET /auth/sessions': { body: envelope([]) },
      'POST /auth/login': { body: envelope({ accessToken: 'throwaway', expiresIn: 900, user: TEACHER }) },
      'POST /auth/logout': { status: 204 },
      'POST /auth/two-factor/setup': { status: 201, body: envelope(SETUP) },
    });
    const user = userEvent.setup();
    renderWithProviders(<AccountSecurityPage />);

    await user.click(await screen.findByRole('button', { name: /set up two-factor/i }));
    await user.type(screen.getByLabelText(/confirm your current password/i), 'Hifzoon!Dev2026');
    await user.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByAltText(/qr code for your authenticator app/i)).toBeTruthy();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy();
    expect(screen.getByText('rc-one')).toBeTruthy();
    // The throwaway verification session is revoked with its own token.
    const logout = api.calls.find((c) => c.url.endsWith('/auth/logout'));
    expect(logout?.headers.get('Authorization')).toBe('Bearer throwaway');
  });
});

const BASE_USER = {
  language: 'en',
  timeZone: 'Europe/London',
  status: 'ACTIVE',
  twoFactorEnabled: false,
  lastActiveAt: null,
};
const GUARDIAN = { ...BASE_USER, id: 'u-guardian', email: 'parent@hifzoon.test', name: 'Ayesha Khan', roles: ['GUARDIAN'] };
const TEACHER = { ...BASE_USER, id: 'u-teacher', email: 'teacher@hifzoon.test', name: 'Ustadh Bilal', roles: ['TEACHER'] };
const SETUP = {
  otpauthUrl: 'otpauth://totp/Hifzoon:teacher%40hifzoon.test?secret=JBSWY3DPEHPK3PXP&issuer=Hifzoon',
  secret: 'JBSWY3DPEHPK3PXP',
  recoveryCodes: ['rc-one', 'rc-two'],
};
