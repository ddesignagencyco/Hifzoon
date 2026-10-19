// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
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
});

describe('login page feedback', () => {
  it('shows a wrong-password failure as an error toast, not inline text', async () => {
    mockApi({
      'POST /auth/refresh': apiError(401, 'UNAUTHORIZED', 'No session'),
      'POST /auth/login': apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.'),
    });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(await screen.findByPlaceholderText('name@example.com'), 'parent@example.com');
    await user.type(screen.getByPlaceholderText('••••••••••••'), 'WrongPassword!2026');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const toast = await findErrorToast(/invalid email or password/i);
    expect(toast).toBeTruthy();
    // The message lives only in the toast — nothing in the form body repeats it.
    expect(screen.getAllByText(/invalid email or password/i)).toHaveLength(1);
    expect(push).not.toHaveBeenCalled();
  }, 15_000);

  it('toasts client-side validation and marks the fields invalid without visible inline text', async () => {
    mockApi({ 'POST /auth/refresh': apiError(401, 'UNAUTHORIZED', 'No session') });
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.click(await screen.findByRole('button', { name: /sign in/i }));

    await findErrorToast('Please fix the highlighted fields');
    const email = screen.getByPlaceholderText('name@example.com');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.className).toContain('border-red');
    // Field messages remain only for screen readers.
    expect(screen.getByText('Please enter a valid email address.').className).toContain('sr-only');
  });
});
