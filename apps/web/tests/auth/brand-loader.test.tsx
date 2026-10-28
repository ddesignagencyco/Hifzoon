// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { apiError, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/parent',
  useSearchParams: () => new URLSearchParams(),
}));

import { BrandLoader } from '@/components/ui/BrandLoader';
import { LoadingState } from '@/components/ui/primitives';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { clearAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

const ring = (el: HTMLElement) => el.querySelector('.hifzoon-splash-ring');

describe('BrandLoader', () => {
  it('fullscreen: fixed overlay with the logo ring and wordmark', () => {
    render(<BrandLoader variant="fullscreen" />);
    const status = screen.getByRole('status', { name: 'Loading Hifzoon' });
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.className).toContain('fixed');
    expect(ring(status)).not.toBeNull();
    expect(status.querySelector('img')?.getAttribute('src')).toContain('logo.png');
    expect(status.textContent).toContain('Hifzoon');
  });

  it('page: fills the content area and shows the label under the logo', () => {
    render(<BrandLoader variant="page" label="Loading course…" />);
    const status = screen.getByRole('status', { name: 'Loading course…' });
    expect(status.className).toContain('min-h-[60vh]');
    expect(ring(status)).not.toBeNull();
    expect(screen.getByText('Loading course…').className).not.toContain('sr-only');
  });

  it('section: compact ring; a hidden label stays in the DOM for assistive tech', () => {
    render(<BrandLoader variant="section" hideLabel />);
    const status = screen.getByRole('status', { name: 'Loading…' });
    expect(status.className).toContain('py-10');
    expect(status.querySelector('.w-12.h-12')).not.toBeNull();
    expect(screen.getByText('Loading…').className).toContain('sr-only');
  });

  it('LoadingState renders the section brand loader with its label and className', () => {
    render(<LoadingState label="Loading invoices…" className="min-h-screen" />);
    const status = screen.getByRole('status', { name: 'Loading invoices…' });
    expect(status.dataset.variant).toBe('section');
    expect(status.className).toContain('min-h-screen');
    expect(ring(status)).not.toBeNull();
    expect(screen.getByText('Loading invoices…')).toBeTruthy();
  });
});

describe('ProtectedRoute', () => {
  it('shows the brand loader (not technical session copy) while the session is checked', () => {
    mockApi({ 'POST /auth/refresh': apiError(401, 'UNAUTHENTICATED', 'No session') });
    renderWithProviders(<ProtectedRoute>secret</ProtectedRoute>);
    const status = screen.getByRole('status', { name: 'Loading…' });
    // Same overlay as the first-load splash, so the two read as one loader.
    expect(status.dataset.variant).toBe('fullscreen');
    expect(ring(status)).not.toBeNull();
    expect(screen.queryByText(/Verifying secure session/i)).toBeNull();
    expect(screen.queryByText(/authentication tokens/i)).toBeNull();
    expect(screen.queryByText('secret')).toBeNull();
  });
});
