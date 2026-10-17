// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../helpers/render';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

let pathname = '/admin';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

import { PostEditor } from '@/components/admin/content/PostEditor';
import { Qualifications } from '@/components/admin/teachers/ApplicationDetailView';
import { materialsToPairs } from '@/components/admin/courses/CoursesAdmin';
import { PlanName } from '@/components/admin/trials/TrialsWorkspace';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';
import { StaffTwoFactorNotice } from '@/components/portal/PortalShell';
import { PORTALS, navForRoles, postLoginDestination } from '@/lib/portal/nav';
import { clearAccessToken } from '@/lib/api/client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearAccessToken();
});

const user = (roles: Role[], twoFactorEnabled = false) => ({
  id: 'u-1',
  email: 'staff@hifzoon.test',
  name: 'Staff Member',
  roles,
  status: 'ACTIVE',
  twoFactorEnabled,
  lastActiveAt: null,
  language: 'en',
  timeZone: 'UTC',
});

/** Signs the given user in through the session-restore path useAuth uses. */
function session(u: ReturnType<typeof user>, extra: Record<string, unknown> = {}) {
  return mockApi({
    'POST /auth/refresh': { body: envelope({ accessToken: 'tok', expiresIn: 900, user: u }) },
    'GET /auth/me': { body: envelope(u) },
    ...extra,
  });
}

describe('CMS post editor', () => {
  it('marks the slug field when the API reports a duplicate (409)', async () => {
    session(user([Role.ADMIN]), { 'POST /content-admin': apiError(409, 'CONFLICT', 'Unique constraint failed', { fields: ['slug'] }) });
    const u = userEvent.setup();
    renderWithProviders(<PostEditor post={null} open onClose={() => {}} />);

    await u.type(screen.getByLabelText(/^title/i), 'Ramadan timetable');
    await u.type(screen.getByLabelText(/^body/i), 'Classes move for Ramadan.');
    await u.click(screen.getByRole('button', { name: /save|create/i }));

    const slug = screen.getByLabelText(/^slug/i);
    await vi.waitFor(() => expect(slug.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getAllByText(/slug is already used/i).length).toBeGreaterThan(0);
  });
});

describe('Teacher application qualifications', () => {
  it('labels the /apply-teacher keys and shows booleans as Yes / No', () => {
    renderWithProviders(<Qualifications value={{ yearsExp: '5-8', isHafiz: true, hasSanad: false, qiraat: 'Hafs' }} />);
    expect(screen.getByText('Years of teaching experience')).toBeTruthy();
    expect(screen.getByText('Hafiz / Hafiza')).toBeTruthy();
    expect(screen.getByText('Holds a sanad / ijazah')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
    expect(screen.queryByText(/Ishafiz|Yearsexp/)).toBeNull();
  });
});

describe('Course admin lesson materials', () => {
  it('turns stored materials into display pairs and ignores non-objects', () => {
    expect(materialsToPairs({ workbook: 'Noorani Qaida page 1', audio: 'https://x.test/a.mp3', empty: '' })).toEqual([
      ['workbook', 'Noorani Qaida page 1'],
      ['audio', 'https://x.test/a.mp3'],
    ]);
    expect(materialsToPairs(null)).toEqual([]);
    expect(materialsToPairs(['a'])).toEqual([]);
  });
});

describe('Trial outcome plan', () => {
  it('shows the plan name instead of its id', async () => {
    mockApi({
      'GET /billing/plans': {
        body: envelope([{ id: 'plan-9', code: 'C3', name: 'Circle, 3 classes/week', classesPerWeek: 3, classMinutes: 30, roomType: 'CIRCLE', billingPeriod: 'MONTHLY', active: true, prices: [] }]),
      },
    });
    renderWithProviders(<PlanName planId="plan-9" />);
    expect(await screen.findByText('Circle, 3 classes/week')).toBeTruthy();
  });
});

describe('Examiner accounts', () => {
  it('see only the overview in the supervisor portal', () => {
    const items = navForRoles(PORTALS.supervisor, [Role.EXAMINER]).map((i) => i.label);
    expect(items).toEqual(['Overview']);
    expect(navForRoles(PORTALS.supervisor, [Role.SUPERVISOR])).toHaveLength(5);
    expect(postLoginDestination('/supervisor/cases', [Role.EXAMINER])).toBe('/supervisor');
  });

  it('get an examiner message instead of "Supervisor access only"', async () => {
    session(user([Role.EXAMINER]));
    renderWithProviders(<SupervisorRoleGate>secret</SupervisorRoleGate>);
    expect(await screen.findByText('No assessments assigned yet')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });
});

describe('Staff 2FA reminder (FR-AUTH-01)', () => {
  it('shows for staff without 2FA, linking to account security', async () => {
    pathname = '/admin';
    session(user([Role.ADMIN], false));
    renderWithProviders(<StaffTwoFactorNotice />);
    const link = await screen.findByRole('link', { name: /set up 2fa/i });
    expect(link.getAttribute('href')).toBe('/account/security');
  });

  it('is hidden for enrolled staff, for families, and on the security page itself', async () => {
    pathname = '/admin';
    session(user([Role.ADMIN], true));
    const a = renderWithProviders(<StaffTwoFactorNotice />);
    await vi.waitFor(() => expect(a.queryClient.getQueryData(['auth', 'me'])).toBeTruthy());
    expect(screen.queryByRole('link', { name: /set up 2fa/i })).toBeNull();
    cleanup();

    session(user([Role.GUARDIAN], false));
    const b = renderWithProviders(<StaffTwoFactorNotice />);
    await vi.waitFor(() => expect(b.queryClient.getQueryData(['auth', 'me'])).toBeTruthy());
    expect(screen.queryByRole('link', { name: /set up 2fa/i })).toBeNull();
    cleanup();

    pathname = '/account/security';
    session(user([Role.TEACHER], false));
    const c = renderWithProviders(<StaffTwoFactorNotice />);
    await vi.waitFor(() => expect(c.queryClient.getQueryData(['auth', 'me'])).toBeTruthy());
    expect(screen.queryByRole('link', { name: /set up 2fa/i })).toBeNull();
  });
});
