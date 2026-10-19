// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
}));

import { UserDrawer } from '@/components/admin/users/UsersConsole';
import { PlanName } from '@/components/admin/trials/TrialsWorkspace';
import { CaseDetailView } from '@/components/cases/CaseDetailView';
import { clearAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

const USER_ID = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';
const CASE_ID = '9c0e5d7a-1b2c-4d3e-8f90-a1b2c3d4e5f6';
const SUBJECT_ID = '5b6c7d8e-9f01-4a2b-8c3d-4e5f6a7b8c9d';
const CLASS_ID = '7e8f9a0b-1c2d-4e3f-9a4b-5c6d7e8f9a0b';

/** No UUID-shaped text anywhere in the rendered page. */
function expectNoUuidText() {
  expect(document.body.textContent ?? '').not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
}

describe('Raw ids are not shown', () => {
  it('the account drawer shows the name and email, with the user id only behind "Copy reference"', () => {
    renderWithProviders(
      <UserDrawer
        target={{ userId: USER_ID, name: 'Amina Yusuf', email: 'amina@hifzoon.test', context: 'Guardian · Yusuf family' }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Amina Yusuf').length).toBeGreaterThan(0);
    expect(screen.getByText('amina@hifzoon.test')).toBeTruthy();
    expect(screen.queryByText(USER_ID)).toBeNull();
    expectNoUuidText();
    const copy = screen.getByRole('button', { name: 'Copy user reference' });
    expect(copy.textContent).toContain('Copy reference');
  });

  it('a trial outcome plan that is not in the catalogue does not fall back to its id', async () => {
    mockApi({ 'GET /billing/plans': { body: envelope([]) } });
    renderWithProviders(<PlanName planId={USER_ID} />);
    expect(await screen.findByText('Plan no longer offered')).toBeTruthy();
    expectNoUuidText();
  });

  it('a safeguarding case shows the class by course and time, not the subject user id', async () => {
    mockApi({
      [`GET /cases/${CASE_ID}`]: {
        body: envelope({
          id: CASE_ID,
          type: 'SAFEGUARDING',
          status: 'OPEN',
          ownerId: null,
          openedById: USER_ID,
          subjectUserId: SUBJECT_ID,
          classId: CLASS_ID,
          summary: 'Learner mentioned something worrying during class.',
          dueAt: '2026-10-20T10:00:00Z',
          alertedAt: '2026-10-19T10:00:00Z',
          closedAt: null,
          createdAt: '2026-10-19T10:00:00Z',
          updatedAt: '2026-10-19T10:00:00Z',
          notes: [],
          owner: null,
          openedBy: { id: USER_ID, name: 'Ustadh Bilal' },
          class: { id: CLASS_ID, startsAt: '2026-10-19T09:00:00Z', course: { name: 'Hifz Programme' } },
          sla: { dueAt: '2026-10-20T10:00:00Z', breached: false, minutesRemaining: 600 },
        }),
      },
      'GET /cases': { body: envelope([]) },
    });
    renderWithProviders(<CaseDetailView id={CASE_ID} backHref="/safeguarding" />);
    expect(await screen.findByText(/Hifz Programme ·/)).toBeTruthy();
    expect(screen.getAllByText('Ustadh Bilal').length).toBeGreaterThan(0);
    expect(screen.queryByText(SUBJECT_ID)).toBeNull();
    expectNoUuidText();
    expect(screen.getByRole('button', { name: 'Copy subject user reference' })).toBeTruthy();
  }, 15_000);
});
