// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, findErrorToast } from '../helpers/render';
import { apiError, mockApi } from '../helpers/fetch-mock';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

async function openKidsMode() {
  const user = userEvent.setup();
  renderWithProviders(<LoginPage />);
  await user.click(await screen.findByRole('button', { name: 'Student' }));
  await user.click(screen.getByRole('button', { name: 'Kids Mode' }));
  return user;
}

describe('Kids PIN sign-in', () => {
  it("signs a child in with the parent's email, their name and PIN, into the student portal", async () => {
    const api = mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHORIZED', 'No session'),
      'POST /auth/kids-pin': {
        body: {
          accessToken: 'tok',
          expiresIn: 900,
          user: { id: 'pin-user', email: null, name: 'Amina', roles: ['CHILD_STUDENT'], status: 'ACTIVE', twoFactorEnabled: false },
        },
      },
    });
    const user = await openKidsMode();
    await user.type(screen.getByLabelText(/Family sign-in/), 'Parent@Example.com');
    await user.type(screen.getByLabelText('Your name'), 'Amina');
    await user.type(screen.getByLabelText('PIN'), '4826');
    await user.click(screen.getByRole('button', { name: /Sign in with my PIN/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/student'));
    expect(api.calls.find((c) => c.url.includes('/auth/kids-pin'))?.body).toMatchObject({
      familyCode: 'parent@example.com',
      childName: 'Amina',
      pin: '4826',
    });
  }, 15_000);

  it('explains a locked PIN', async () => {
    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHORIZED', 'No session'),
      'POST /auth/kids-pin': apiError(423, 'ACCOUNT_LOCKED', 'Too many wrong PINs'),
    });
    const user = await openKidsMode();
    await user.type(screen.getByLabelText(/Family sign-in/), 'parent@example.com');
    await user.type(screen.getByLabelText('Your name'), 'Amina');
    await user.type(screen.getByLabelText('PIN'), '9999');
    await user.click(screen.getByRole('button', { name: /Sign in with my PIN/ }));
    expect(await findErrorToast(/Wait 15 minutes/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  }, 15_000);
});
