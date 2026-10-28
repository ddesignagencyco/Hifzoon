// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/teachers',
}));

import { ApplicationDetailView } from '@/components/admin/teachers/ApplicationDetailView';
import { validateProfileChanges } from '@/lib/api/modules/teacher';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('application files (backend B31)', () => {
  it('plays the recitation and opens documents through their signed links', async () => {
    mockApi({
      'GET /teachers/applications/a1': {
        body: envelope({
          id: 'a1', applicantName: 'Hafiz Usman', email: 'u@example.com', phone: null, country: 'PK', qualifications: null,
          recitationAudioUrl: 'recitations/2026/0b4e8f2a-1111-4222-8333-944455556666.webm',
          recitationAudioDownloadUrl: 'http://localhost:9000/hifzoon/recitations/x.webm?X-Amz-Signature=abc',
          status: 'SUBMITTED', userId: null, steps: [],
          documents: [{ id: 'd1', type: 'ID', fileUrl: 'documents/2026/0b4e8f2a-1111-4222-8333-944455556667.pdf', downloadUrl: 'http://localhost:9000/hifzoon/documents/x.pdf?X-Amz-Signature=def', verified: false }],
        }),
      },
    });
    renderWithProviders(<ApplicationDetailView applicationId="a1" backHref="/admin/teachers" />);
    // The visible link plus the <audio> element's own fallback link.
    const downloads = await screen.findAllByRole('link', { name: 'Download recitation' });
    expect(downloads.every((d) => d.getAttribute('href')?.includes('X-Amz-Signature=abc'))).toBe(true);
    expect(document.querySelector('audio')?.getAttribute('src')).toContain('X-Amz-Signature=abc');
    expect(screen.getByRole('link', { name: 'Open file' }).getAttribute('href')).toContain('X-Amz-Signature=def');
    expect(screen.queryByText(/Stored privately/)).toBeNull();
  }, 15_000);
});

describe('profile links (backend S21)', () => {
  it('allows http in development but only https in production', () => {
    expect(validateProfileChanges({ photoUrl: 'http://localhost/p.jpg' }).photoUrl).toBeUndefined();
    vi.stubEnv('NODE_ENV', 'production');
    expect(validateProfileChanges({ photoUrl: 'http://example.com/p.jpg' }).photoUrl).toMatch(/https/);
    expect(validateProfileChanges({ photoUrl: 'https://example.com/p.jpg' }).photoUrl).toBeUndefined();
    expect(validateProfileChanges({ introVideoUrl: 'javascript:alert(1)' }).introVideoUrl).toBeTruthy();
  });
});
