// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, findErrorToast } from '../helpers/render';
import { apiError, envelope, mockApi, type MockCall } from '../helpers/fetch-mock';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img alt={String(props.alt ?? '')} src={String(props.src ?? '')} />,
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import LoginPage from '@/app/login/page';
import { clearAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
  push.mockReset();
});

const ADMIN = {
  id: 'u-admin',
  email: 'admin@hifzoon.test',
  name: 'Admin',
  roles: ['ADMIN'],
  status: 'ACTIVE',
  twoFactorEnabled: true,
  lastActiveAt: null,
};

/** Login answers by what the body carries: no code → challenge, wrong code → invalid, right code → tokens. */
function loginResponder(call: MockCall) {
  const body = call.body as { twoFactorCode?: string };
  if (!body.twoFactorCode) return apiError(401, 'TWO_FACTOR_REQUIRED', 'This account requires a two-factor code');
  if (body.twoFactorCode === '123456' || body.twoFactorCode === 'Rc_8char') {
    return { body: envelope({ accessToken: 'tok', expiresIn: 900, user: ADMIN }) };
  }
  return apiError(401, 'INVALID_TWO_FACTOR_CODE', 'Two-factor code is incorrect');
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByPlaceholderText('name@example.com'), 'admin@hifzoon.test');
  await user.type(screen.getByPlaceholderText('••••••••••••'), 'Hifzoon!Dev2026');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
}

describe('login: two-step 2FA', () => {
  it('asks for a code on TWO_FACTOR_REQUIRED, stays on step 2 for a wrong code, then signs in', async () => {
    const api = mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'POST /auth/login': loginResponder,
      'GET /auth/me': { body: envelope(ADMIN) },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await signIn(user);

    // Step 2 — no error toast for the challenge itself.
    const code = await screen.findByLabelText(/authenticator code/i);
    await user.type(code, '000000');
    await user.click(screen.getByRole('button', { name: /verify & sign in/i }));
    await findErrorToast(/code is not valid/i);
    expect(screen.getByLabelText(/authenticator code/i).getAttribute('aria-invalid')).toBe('true');

    await user.clear(screen.getByLabelText(/authenticator code/i));
    await user.type(screen.getByLabelText(/authenticator code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify & sign in/i }));

    // Straight to the role's portal (post-login destination), not via /dashboard.
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/admin'));
    const logins = api.calls.filter((c) => c.url.endsWith('/auth/login'));
    expect(logins.map((c) => (c.body as { twoFactorCode?: string }).twoFactorCode)).toEqual([undefined, '000000', '123456']);
  }, 15_000); // multi-step sign-in through the real form

  it('accepts a recovery code (letters and symbols) instead of a TOTP', async () => {
    const api = mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'POST /auth/login': loginResponder,
      'GET /auth/me': { body: envelope(ADMIN) },
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);
    await signIn(user);

    await user.click(await screen.findByRole('button', { name: /use a recovery code/i }));
    await user.type(screen.getByLabelText(/recovery code/i), 'Rc_8char');
    await user.click(screen.getByRole('button', { name: /verify & sign in/i }));

    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    const sent = api.calls
      .filter((c) => c.url.endsWith('/auth/login'))
      .map((c) => (c.body as { twoFactorCode?: string }).twoFactorCode);
    expect(sent).toEqual([undefined, 'Rc_8char']);
  }, 15_000); // multi-step sign-in through the real form
});

describe('login: no demo or placeholder sign-in', () => {
  it('offers no seeded demo accounts', async () => {
    mockApi({ 'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session') });
    renderWithProviders(<LoginPage />);
    await screen.findByPlaceholderText('name@example.com');
    expect(screen.queryByText(/demo/i)).toBeNull();
    expect(document.body.textContent).not.toContain('Hifzoon!Dev2026');
  });

  it('explains Kids Mode is not available instead of faking a PIN sign-in', async () => {
    const api = mockApi({ 'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session') });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(await screen.findByRole('button', { name: 'Student' }));
    await user.click(screen.getByRole('button', { name: 'Kids Mode' }));

    expect(screen.getByText(/kids mode sign-in is not available yet/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText('••••')).toBeNull();
    expect(api.calls.some((c) => c.url.endsWith('/auth/login'))).toBe(false);
  });

  it('shows Google / Apple only when the deployment has configured them', async () => {
    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session'),
      'GET /auth/oauth/providers': {
        body: envelope([
          { name: 'google', configured: true },
          { name: 'apple', configured: false },
        ]),
      },
    });
    renderWithProviders(<LoginPage />);
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
  });
});
