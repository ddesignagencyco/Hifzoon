// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvailabilityEditor } from '@/components/teacher/AvailabilityEditor';
import { ProfileForm } from '@/components/teacher/ProfileForm';
import { PayslipsScreen } from '@/components/teacher/PayslipsScreen';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { renderWithProviders, findErrorToast } from '../helpers/render';

const SLOTS = [
  { weekday: 1, startTime: '16:00', endTime: '20:00' },
  { weekday: 3, startTime: '16:00', endTime: '20:00' },
];

describe('AvailabilityEditor', () => {
  it('renders saved ranges per weekday in the account zone', () => {
    render(<AvailabilityEditor initialSlots={SLOTS} zone="Europe/London" onSave={() => undefined} />);
    expect(screen.getByText('Europe/London')).toBeTruthy();
    expect((screen.getByLabelText('Monday range 1 start') as HTMLInputElement).value).toBe('16:00');
    expect((screen.getByLabelText('Wednesday range 1 end') as HTMLInputElement).value).toBe('20:00');
    expect(screen.queryByLabelText('Tuesday range 1 start')).toBeNull();
  });

  it('blocks an overlapping range and does not call onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<AvailabilityEditor initialSlots={SLOTS} zone="UTC" onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Add a time range on Monday' }));
    const start = screen.getByLabelText('Monday range 2 start') as HTMLInputElement;
    // Default suggestion follows the last range (20:00–21:00); make it overlap instead.
    expect(start.value).toBe('20:00');
    await user.clear(start);
    await user.type(start, '19:00');
    await user.click(screen.getByRole('button', { name: 'Save availability' }));

    expect(onSave).not.toHaveBeenCalled();
    await findErrorToast('Fix the highlighted time ranges before saving.');
    // The row reason stays available to assistive tech only; the control is marked invalid.
    expect(screen.getByText(/Overlaps 16:00–20:00 on the same day/).className).toContain('sr-only');
    expect(start.getAttribute('aria-invalid')).toBe('true');
  });

  it('flags an end time before the start', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<AvailabilityEditor initialSlots={[{ weekday: 2, startTime: '10:00', endTime: '12:00' }]} zone="UTC" onSave={onSave} />);
    const end = screen.getByLabelText('Tuesday range 1 end');
    await user.clear(end);
    await user.type(end, '09:00');
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('End time must be after the start time.')).toBeTruthy();
  });

  it('serialises a valid week to the exact DTO and requires at least one slot', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<AvailabilityEditor initialSlots={SLOTS} zone="UTC" onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Remove Wednesday range 1' }));
    await user.click(screen.getByRole('button', { name: 'Add a time range on Sunday' }));
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(onSave).toHaveBeenCalledWith({
      slots: [
        { weekday: 0, startTime: '16:00', endTime: '17:00' },
        { weekday: 1, startTime: '16:00', endTime: '20:00' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Remove Monday range 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove Sunday range 1' }));
    await user.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await findErrorToast('Add at least one available time range.');
  });
});

describe('ProfileForm', () => {
  const initial = {
    bio: 'Old bio',
    photoUrl: '',
    introVideoUrl: 'https://cdn.test/intro.mp4',
    recitationSampleUrl: '',
    languages: ['en'],
    subjects: ['HIFZ'],
    ageGroups: ['6-9'],
    qualifications: [],
  };
  const subjects = [
    { value: 'HIFZ', label: 'Hifz', description: 'HIFZ' },
    { value: 'TAJWEED', label: 'Tajweed', description: 'TAJWEED' },
  ];

  it('submits only the changed fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProfileForm initial={initial} subjectOptions={subjects} onSubmit={onSubmit} />);
    // `fireEvent.change` keeps this fast under a loaded full-suite run (per-key typing timed out).
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'I teach Hifz with patience.' } });
    fireEvent.change(screen.getByLabelText('Photo link'), { target: { value: 'https://cdn.test/me.jpg' } });
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(onSubmit).toHaveBeenCalledWith({ bio: 'I teach Hifz with patience.', photoUrl: 'https://cdn.test/me.jpg' });
  });

  it('prefills languages, subjects and age groups and sends only the lists that changed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProfileForm initial={initial} subjectOptions={subjects} onSubmit={onSubmit} />);
    expect((screen.getByLabelText('English') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/^Hifz/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('6-9') as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByLabelText('Urdu'));
    await user.click(screen.getByLabelText(/^Tajweed/));
    // Toggling an age group off and on again is no change.
    await user.click(screen.getByLabelText('6-9'));
    await user.click(screen.getByLabelText('6-9'));
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(onSubmit).toHaveBeenCalledWith({ languages: ['en', 'ur'], subjects: ['HIFZ', 'TAJWEED'] });
  });

  it('keeps values already on the profile that are not in the offered lists', () => {
    render(
      <ProfileForm
        initial={{ ...initial, languages: ['en', 'sw'], subjects: ['QAIDAH'], ageGroups: ['adult'] }}
        subjectOptions={subjects}
        onSubmit={() => undefined}
      />,
    );
    expect((screen.getByLabelText('Swahili') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('QAIDAH') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('adult') as HTMLInputElement).checked).toBe(true);
  });

  it('sends a cleared link as null', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ProfileForm initial={initial} subjectOptions={subjects} onSubmit={onSubmit} />);
    await user.clear(screen.getByLabelText('Introduction video link'));
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(onSubmit).toHaveBeenCalledWith({ introVideoUrl: null });
  });

  it('validates links and refuses an unchanged form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<ProfileForm initial={initial} subjectOptions={subjects} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await findErrorToast('Nothing has changed yet.');

    fireEvent.change(screen.getByLabelText('Recitation sample link'), { target: { value: 'youtube' } });
    await user.click(screen.getByRole('button', { name: 'Submit for approval' }));
    expect(onSubmit).not.toHaveBeenCalled();
    await findErrorToast('Enter a full link, starting with https://');
    expect(screen.getByLabelText('Recitation sample link').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('PayslipsScreen', () => {
  const renderWithClient = (ui: React.ReactElement) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  };

  it('renders payslips with totals and expandable line items', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /payroll/my-payslips': {
        body: envelope([
          {
            id: 'p1', periodId: 'pp1', teacherId: 't', grossMinor: 3000, deductionsMinor: 0, bonusesMinor: 0, netMinor: 3000,
            status: 'PAID', paidAt: '2026-10-05T10:00:00Z', payoutReference: 'BACS-77', createdAt: '', updatedAt: '',
            period: { startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-09-30T00:00:00.000Z', status: 'PAID' },
            lines: [
              { kind: 'CLASS', amountMinor: 1500, note: 'REGULAR class', classId: 'k1' },
              { kind: 'CLASS', amountMinor: 1500, note: 'TRIAL class', classId: 'k2' },
            ],
          },
        ]),
      },
    });
    renderWithClient(<PayslipsScreen />);
    await user.click(await screen.findByText(/Sep 2026|September 2026|1 Sep/));
    expect(await screen.findByText('Payout reference BACS-77')).toBeTruthy();
    const table = within(screen.getByRole('dialog')).getByRole('table');
    expect(within(table).getByText('REGULAR class')).toBeTruthy();
    expect(within(table).getAllByText(/15[.,]00/)).toHaveLength(2);
  });

  it('shows the empty and error states', async () => {
    mockApi({ 'GET /payroll/my-payslips': { body: envelope([]) } });
    const { unmount } = renderWithClient(<PayslipsScreen />);
    expect(await screen.findByText('No payslips yet')).toBeTruthy();
    unmount();

    mockApi({ 'GET /payroll/my-payslips': apiError(500, 'INTERNAL', 'Payroll is down') });
    renderWithProviders(<PayslipsScreen />);
    await findErrorToast('Payroll is down');
    expect(screen.getByRole('button', { name: /Retry/ })).toBeTruthy();
    // The failure is a toast, not body text.
    expect(screen.getAllByText('Payroll is down')).toHaveLength(1);
  });
});
