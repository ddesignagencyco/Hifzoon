// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/components/layout/Footer', () => ({ Footer: () => null }));

import { PolicyPage } from '@/components/content/PolicyPage';

const DRAFT_LABEL = 'Draft — pending legal review (CR-13)';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PolicyPage', () => {
  it('renders the published CMS policy when one exists', async () => {
    const api = mockApi({
      'GET /content/privacy-policy': {
        body: envelope({
          id: 'c1',
          type: 'LANDING',
          slug: 'privacy-policy',
          locale: 'en',
          title: 'Hifzoon Privacy Notice',
          body: 'We only collect what we need.',
          countryCode: null,
          city: null,
          meta: null,
          publishedAt: '2026-09-01T00:00:00.000Z',
        }),
      },
    });
    renderWithProviders(<PolicyPage slug="privacy-policy" />);

    expect(await screen.findByRole('heading', { name: 'Hifzoon Privacy Notice' })).toBeTruthy();
    expect(screen.getByText('We only collect what we need.')).toBeTruthy();
    expect(screen.queryByText(DRAFT_LABEL)).toBeNull();
    expect(api.calls[0].url).toContain('/content/privacy-policy');
  });

  it('falls back to the labelled built-in draft when the CMS has no policy (404)', async () => {
    mockApi({ 'GET /content/refund-policy': apiError(404, 'NOT_FOUND', 'Not found') });
    renderWithProviders(<PolicyPage slug="refund-policy" />);

    expect(await screen.findByText(DRAFT_LABEL)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Refund & Reschedule Terms' })).toBeTruthy();
    expect(screen.getByText(/Last updated/)).toBeTruthy();
    // FR-SCH-04: the default 4-hour notice drives the make-up credit rule.
    expect(screen.getByText(/at least 4 hours before it starts/)).toBeTruthy();
  });
});
