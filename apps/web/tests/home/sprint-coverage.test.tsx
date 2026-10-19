// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { bookingApi } from '@/lib/api/modules/public-booking';
import { schedulingAdminApi } from '@/lib/api/modules/scheduling-admin';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import { CurrencySelect } from '@/components/ui/CurrencySelect';
import { ErrorState } from '@/components/ui/primitives';
import { ApiClientError } from '@/lib/api/http';
import { ConsentMatrix } from '@/components/parent/PrivacyScreen';
import { NotificationChannels } from '@/components/admin/users/UsersConsole';
import type { PrivacySummary } from '@/lib/api/modules/consent';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const slot = (teacherId: string, startsAt: string) => ({
  teacherId,
  teacherName: teacherId,
  startsAt,
  endsAt: startsAt,
  localTime: '',
  visitorZone: 'UTC',
  teacherZone: 'UTC',
});

describe('open slots (backend B11 returns truncated results in teacher order)', () => {
  it('are sorted by start time in every API wrapper', async () => {
    const unsorted = [slot('t2', '2026-10-20T09:00:00Z'), slot('t1', '2026-10-18T09:00:00Z'), slot('t2', '2026-10-19T09:00:00Z')];
    mockApi({ 'GET /scheduling/open-slots': { body: envelope(unsorted) } });
    const q = { from: '2026-10-18', to: '2026-10-25', visitorZone: 'UTC' };
    for (const rows of [await bookingApi.openSlots(q), await schedulingAdminApi.openSlots(q)]) {
      expect(rows.map((s) => s.startsAt)).toEqual(['2026-10-18T09:00:00Z', '2026-10-19T09:00:00Z', '2026-10-20T09:00:00Z']);
    }
  });
});

describe('select value placement', () => {
  it('TimezoneSelect renders the value inside react-select’s own single-value cell, full name + offset', () => {
    const { container } = renderWithProviders(<TimezoneSelect value="Asia/Karachi" onChange={() => {}} />);
    const cell = container.querySelector('.hz-tz-select__single-value');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toContain('Asia/Karachi');
    expect(cell!.className).toContain('[grid-area:1/1/2/3]');
    // "detected" lives in the menu, not the closed control.
    expect(cell!.textContent).not.toContain('detected');
  });

  it('CurrencySelect renders the value inside react-select’s own single-value cell', () => {
    const { container } = renderWithProviders(<CurrencySelect value="GBP" onChange={() => {}} />);
    const cell = container.querySelector('.hz-currency-select__single-value');
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toContain('GBP');
  });
});

describe('ErrorState', () => {
  it('renders 404 as "Not found" without a retry', () => {
    renderWithProviders(<ErrorState error={new ApiClientError('Gone', 404, 'NOT_FOUND')} onRetry={() => {}} />);
    expect(screen.getByText('Not found')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});

describe('Consent history (privacy page)', () => {
  it('lists grant / withdraw events newest first with the reason', async () => {
    const summary = {
      familyId: 'f1',
      students: [{ id: 's1', displayName: 'Zayd', birthYear: 2016 }],
      consents: [
        {
          id: 'c1', familyId: 'f1', studentId: 's1', purpose: 'DATA_COLLECTION', status: 'WITHDRAWN', method: 'SIGNED_FORM',
          policyVersion: '1.0', grantedAt: '2026-01-03T10:00:00Z', withdrawnAt: '2026-03-09T10:00:00Z', grantedByUserId: 'u',
          ip: null, createdAt: '2026-01-03T10:00:00Z', updatedAt: '2026-03-09T10:00:00Z',
          events: [
            { id: 'e1', consentId: 'c1', fromStatus: 'PENDING', toStatus: 'GRANTED', actorId: 'u', reason: null, createdAt: '2026-01-03T10:00:00Z' },
            { id: 'e2', consentId: 'c1', fromStatus: 'GRANTED', toStatus: 'WITHDRAWN', actorId: 'u', reason: 'Moving abroad', createdAt: '2026-03-09T10:00:00Z' },
          ],
        },
      ],
      requests: [],
      openCases: 0,
      generatedAt: '2026-10-17T00:00:00Z',
      exportAvailable: false,
    } as unknown as PrivacySummary;
    renderWithProviders(<ConsentMatrix summary={summary} />);

    await userEvent.setup().click(screen.getByText('History (2)'));
    const items = screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('→'));
    expect(items[0].textContent).toContain('Withdrawn');
    expect(items[0].textContent).toContain('Moving abroad');
    expect(items[1].textContent).toContain('Granted');
  });
});

describe('Admin user drawer: notification channels', () => {
  it('shows each channel and the quiet hours', async () => {
    mockApi({
      'GET /notifications/preferences/u-9': {
        body: envelope({ userId: 'u-9', email: true, whatsapp: false, push: true, quietFrom: '1970-01-01T21:00:00.000Z', quietTo: '1970-01-01T07:00:00.000Z', language: 'en' }),
      },
    });
    renderWithProviders(<NotificationChannels userId="u-9" />);
    expect(await screen.findByText('Whatsapp off')).toBeTruthy();
    expect(screen.getByText('Email on')).toBeTruthy();
    expect(screen.getByText(/Quiet 21:00–07:00 UTC/)).toBeTruthy();
  });

  it('explains that defaults apply when nothing is saved, and access errors are not retried', async () => {
    mockApi({ 'GET /notifications/preferences/u-1': { body: envelope(null) } });
    renderWithProviders(<NotificationChannels userId="u-1" />);
    expect(await screen.findByText(/defaults apply/)).toBeTruthy();
    cleanup();

    mockApi({ 'GET /notifications/preferences/u-2': apiError(403, 'FORBIDDEN', 'Nope') });
    renderWithProviders(<NotificationChannels userId="u-2" />);
    expect(await screen.findByText('You don’t have access to this')).toBeTruthy();
  });
});
