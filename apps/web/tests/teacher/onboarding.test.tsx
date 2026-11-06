// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingForm } from '@/components/teacher/OnboardingForm';
import { TeacherOnboardingGate } from '@/components/teacher/TeacherOnboardingGate';
import {
  bioError,
  isOnboardingOpenPath,
  onboardingFileError,
  type OnboardingStatus,
} from '@/lib/api/modules/teacher-onboarding';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { renderWithProviders, findErrorToast } from '../helpers/render';

const replace = vi.fn();
let pathname = '/teacher/timetable';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

let roles = ['TEACHER'];
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    currentUser: { id: 'teacher-1', roles, name: 'Ustadh Test', email: 't@x.test' },
  }),
}));

const STATUS: OnboardingStatus = {
  required: true,
  complete: false,
  completedAt: null,
  missing: ['bio'],
  profile: {
    id: 'p1',
    name: 'Ustadh Test',
    bio: null,
    photoUrl: null,
    introVideoUrl: null,
    recitationSampleUrl: null,
    languages: ['en', 'ur'],
    subjects: ['HIFZ'],
    ageGroups: ['6-9'],
    gender: 'MALE',
    certificates: [],
  },
};

const BIO =
  'Assalamu alaikum. I have taught Quran and tajweed to children for eight years, gently and patiently.';

beforeEach(() => {
  replace.mockReset();
  window.localStorage.clear();
  roles = ['TEACHER'];
});
afterEach(() => vi.restoreAllMocks());

describe('onboarding validation helpers', () => {
  it('requires a bio of 80-1500 characters', () => {
    expect(bioError('short')).toMatch(/at least 80/);
    expect(bioError('a'.repeat(1501))).toMatch(/1500/);
    expect(bioError(BIO)).toBeNull();
  });

  it('checks upload type and size per kind', () => {
    const png = new File(['x'], 'me.png', { type: 'image/png' });
    expect(onboardingFileError('photo', png)).toBeNull();
    expect(
      onboardingFileError('photo', new File(['x'], 'cv.pdf', { type: 'application/pdf' })),
    ).toMatch(/not accepted/);
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    expect(onboardingFileError('photo', big)).toMatch(/too large/);
    expect(
      onboardingFileError('certificate', new File(['x'], 'c.pdf', { type: 'application/pdf' })),
    ).toBeNull();
  });

  it('keeps only the setup page open', () => {
    expect(isOnboardingOpenPath('/teacher/onboarding')).toBe(true);
    expect(isOnboardingOpenPath('/teacher/timetable')).toBe(false);
    expect(isOnboardingOpenPath('/teacher')).toBe(false);
  });
});

describe('OnboardingForm', () => {
  it('does not move past "About you" without a valid bio', async () => {
    const user = userEvent.setup();
    renderWithProviders(<OnboardingForm status={STATUS} upload={vi.fn()} />);
    await user.type(screen.getByLabelText(/Your bio/), 'Too short');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await findErrorToast(/at least 80/);
    expect(screen.getByLabelText(/Your bio/)).toBeTruthy();
    // Application fields are shown read-only, never as inputs.
    expect(screen.queryByLabelText(/language/i)).toBeNull();
    expect(screen.getByText(/teaches in en, ur/)).toBeTruthy();
  });

  it('walks the optional steps, uploads a photo and certificate, and submits', async () => {
    const user = userEvent.setup();
    const upload = vi.fn(async (kind: string) => `teacher-profiles/p1/${kind}.bin`);
    const api = mockApi({
      'POST /teachers/me/onboarding': {
        body: envelope({ ...STATUS, complete: true, completedAt: '2026-11-06T10:00:00Z' }),
      },
    });
    renderWithProviders(<OnboardingForm status={STATUS} upload={upload} />);

    await user.type(screen.getByLabelText(/Your bio/), BIO);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Photo (optional): upload one.
    await user.upload(
      screen.getByLabelText('Upload a photo'),
      new File(['png'], 'me.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(upload).toHaveBeenCalledWith('photo', expect.any(File)));
    await user.click(screen.getByRole('button', { name: 'Next (or skip)' }));

    // Video or recitation (optional): skip.
    expect(screen.getByText('Intro video or recitation')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next (or skip)' }));

    // Certificates (optional): add one.
    await user.click(screen.getByRole('button', { name: 'Add a certificate' }));
    await user.upload(
      screen.getByLabelText('Upload file for certificate 1'),
      new File(['%PDF'], 'Ijazah.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText(/Title/) as HTMLInputElement).value).toBe('Ijazah'),
    );
    await user.type(screen.getByLabelText(/Year/), '2015');
    await user.click(screen.getByRole('button', { name: 'Next (or skip)' }));

    expect(screen.getByText('Review and submit')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Submit profile' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/teacher'));
    const call = api.calls.find((c) => c.url.endsWith('/teachers/me/onboarding'));
    expect(call?.body).toEqual({
      bio: BIO,
      photoKey: 'teacher-profiles/p1/photo.bin',
      certificates: [{ key: 'teacher-profiles/p1/certificate.bin', title: 'Ijazah', year: 2015 }],
    });
    expect(window.localStorage.getItem('hifzoon:teacher-profile-complete:teacher-1')).toBe('1');
  });

  it('submits with only a bio', async () => {
    const user = userEvent.setup();
    const api = mockApi({
      'POST /teachers/me/onboarding': { body: envelope({ ...STATUS, complete: true }) },
    });
    renderWithProviders(<OnboardingForm status={STATUS} upload={vi.fn()} />);
    await user.type(screen.getByLabelText(/Your bio/), BIO);
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole('button', { name: /^Next/ }));
    }
    await user.click(screen.getByRole('button', { name: 'Submit profile' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ bio: BIO });
  });
});

describe('TeacherOnboardingGate', () => {
  it('redirects an incomplete teacher from any portal page to setup', async () => {
    pathname = '/teacher/timetable';
    mockApi({ 'GET /teachers/me/onboarding': { body: envelope(STATUS) } });
    renderWithProviders(
      <TeacherOnboardingGate>
        <p>Timetable</p>
      </TeacherOnboardingGate>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/teacher/onboarding'));
    expect(screen.queryByText('Timetable')).toBeNull();
  });

  it('renders the setup page itself without redirecting', async () => {
    pathname = '/teacher/onboarding';
    mockApi({ 'GET /teachers/me/onboarding': { body: envelope(STATUS) } });
    renderWithProviders(
      <TeacherOnboardingGate>
        <p>Setup</p>
      </TeacherOnboardingGate>,
    );
    expect(await screen.findByText('Setup')).toBeTruthy();
    await act(async () => undefined);
    expect(replace).not.toHaveBeenCalled();
  });

  it('lets a completed teacher through and never asks again on this device', async () => {
    pathname = '/teacher/timetable';
    const api = mockApi({
      'GET /teachers/me/onboarding': {
        body: envelope({ ...STATUS, complete: true, completedAt: '2026-11-06T10:00:00Z' }),
      },
    });
    const first = renderWithProviders(
      <TeacherOnboardingGate>
        <p>Timetable</p>
      </TeacherOnboardingGate>,
    );
    expect(await screen.findByText('Timetable')).toBeTruthy();
    await waitFor(() =>
      expect(window.localStorage.getItem('hifzoon:teacher-profile-complete:teacher-1')).toBe('1'),
    );
    first.unmount();
    const calls = api.calls.length;

    renderWithProviders(
      <TeacherOnboardingGate>
        <p>Timetable</p>
      </TeacherOnboardingGate>,
    );
    expect(await screen.findByText('Timetable')).toBeTruthy();
    expect(api.calls.length).toBe(calls);
    expect(replace).not.toHaveBeenCalled();
  });

  it('never gates staff who also hold TEACHER', async () => {
    roles = ['TEACHER', 'ADMIN'];
    pathname = '/teacher';
    const api = mockApi({});
    renderWithProviders(
      <TeacherOnboardingGate>
        <p>Dashboard</p>
      </TeacherOnboardingGate>,
    );
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(api.calls).toHaveLength(0);
  });
});
