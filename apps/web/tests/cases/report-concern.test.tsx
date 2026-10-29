// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findSuccessToast, renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';
import { ReportConcernScreen } from '@/components/portal/ReportConcernScreen';
import { ProfileChangesQueue } from '@/components/admin/teachers/ProfileChangesQueue';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportConcernScreen (M56)', () => {
  it('sends a complaint and shows the reference and the new report in the list', async () => {
    let mine: unknown[] = [];
    const api = mockApi({
      'GET /cases/mine': () => ({ body: envelope(mine) }),
      'POST /cases/report': () => {
        mine = [{ reference: 'AB12CD34', type: 'COMPLAINT', status: 'OPEN', receivedAt: '2026-10-29T10:00:00Z', closedAt: null }];
        return { status: 201, body: envelope({ reference: 'AB12CD34', receivedAt: '2026-10-29T10:00:00Z' }) };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<ReportConcernScreen />);
    expect(await screen.findByText('No reports yet')).toBeTruthy();

    await user.click(screen.getByText('A complaint about a class or the service'));
    await user.type(screen.getByLabelText(/What happened\?/), 'too short');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/at least 10 characters/)).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);

    await user.type(screen.getByLabelText(/What happened\?/), ' — the class started 20 minutes late');
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    await findSuccessToast(/Reference AB12CD34/);
    expect(api.calls.find((c) => c.method === 'POST')?.body).toMatchObject({ type: 'COMPLAINT' });
    expect(await screen.findByText('Received · reference AB12CD34')).toBeTruthy();
    expect(await screen.findAllByText('AB12CD34')).toHaveLength(1);
  }, 15_000);
});

describe('ProfileChangesQueue (M54, #7)', () => {
  it('shows before/after, flags credentials verified on approval, and rejects with a reason', async () => {
    const api = mockApi({
      'GET /teachers/profile-changes': {
        body: envelope([
          {
            profileId: 'tp1',
            teacherName: 'Ustadh Bilal',
            submittedAt: '2026-10-28T09:00:00Z',
            changes: {
              bio: 'New bio',
              qualifications: [{ type: 'CERTIFICATE', title: 'Ijazah in Hafs', issuer: 'Jamia', documentUrl: 'https://docs.test/ijazah.pdf', verified: false }],
            },
            current: { bio: 'Old bio', qualifications: [] },
          },
        ]),
      },
      'POST /teachers/profiles/tp1/review': { body: envelope({ id: 'tp1', pendingProfileChanges: null }) },
    });
    const user = userEvent.setup();
    renderWithProviders(<ProfileChangesQueue />);
    expect(await screen.findByText('Ustadh Bilal')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(screen.getByText('Old bio')).toBeTruthy();
    expect(screen.getByText('New bio')).toBeTruthy();
    expect(screen.getByText('Verified on approval')).toBeTruthy();
    expect(screen.getByRole('link', { name: /View document/ }).getAttribute('href')).toBe('https://docs.test/ijazah.pdf');

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.type(screen.getByLabelText('Reason for the teacher'), 'Please upload a clearer scan');
    await user.click(screen.getByRole('button', { name: 'Reject changes' }));
    await findSuccessToast(/were rejected/);
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ approve: false, reason: 'Please upload a clearer scan' });
  }, 15_000);
});
