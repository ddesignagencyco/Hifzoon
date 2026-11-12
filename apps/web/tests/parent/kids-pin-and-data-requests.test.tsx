// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KidsPinCard } from '@/components/parent/KidsPinCard';
import { DataRequestsQueue } from '@/components/admin/data-requests/DataRequestsQueue';
import { FamilyStudent, kidsPinProblem } from '@/lib/api/modules/families';
import { validateRejectionReason } from '@/lib/api/modules/data-requests-admin';
import { mockApi } from '../helpers/fetch-mock';
import { renderWithProviders } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const child = (over: Partial<FamilyStudent> = {}): FamilyStudent =>
  ({
    id: 'stu-1',
    displayName: 'Amina',
    birthYear: 2019,
    gender: 'FEMALE',
    language: 'en',
    timeZone: 'Europe/London',
    kidsMode: true,
    userId: null,
    createdAt: '2026-01-01T00:00:00Z',
    hasOwnLogin: false,
    hasKidsPin: false,
    ...over,
  }) as FamilyStudent;

describe('kids PIN rules (web mirror of the API)', () => {
  it('takes 4–6 digits and refuses repeated or counting PINs', () => {
    expect(kidsPinProblem('4826')).toBeNull();
    expect(kidsPinProblem('12')).toMatch(/4 to 6/);
    expect(kidsPinProblem('1234')).toMatch(/harder to guess/);
    expect(kidsPinProblem('7777')).toMatch(/harder to guess/);
  });
});

describe('<KidsPinCard>', () => {
  it('sets a PIN for a child in kids mode', async () => {
    const api = mockApi({ 'PUT /families/fam-1/students/stu-1/kids-pin': { body: child({ hasKidsPin: true }) } });
    renderWithProviders(<KidsPinCard familyId="fam-1" student={child()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^PIN/), '4826');
    await user.type(screen.getByLabelText(/Repeat the PIN/), '4826');
    await user.click(screen.getByRole('button', { name: 'Set PIN' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(api.calls.find((c) => c.method === 'PUT')?.body).toEqual({ pin: '4826' });
  });

  it('refuses a weak or mismatched PIN without calling the API', async () => {
    const api = mockApi({});
    renderWithProviders(<KidsPinCard familyId="fam-1" student={child()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^PIN/), '1111');
    await user.type(screen.getByLabelText(/Repeat the PIN/), '1111');
    await user.click(screen.getByRole('button', { name: 'Set PIN' }));
    expect(await screen.findByText(/harder to guess/)).toBeTruthy();
    expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });

  it('offers change and remove once a PIN exists, and nothing for a child with their own login', () => {
    mockApi({});
    const { unmount } = renderWithProviders(<KidsPinCard familyId="fam-1" student={child({ hasKidsPin: true })} />);
    expect(screen.getByRole('button', { name: 'Change PIN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove PIN' })).toBeTruthy();
    unmount();

    renderWithProviders(<KidsPinCard familyId="fam-1" student={child({ hasOwnLogin: true, userId: 'u' })} />);
    expect(screen.getByText(/has their own login/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set PIN' })).toBeNull();
  });

  it('asks for kids mode first', () => {
    mockApi({});
    renderWithProviders(<KidsPinCard familyId="fam-1" student={child({ kidsMode: false })} />);
    expect(screen.getByText(/Turn on kids mode/)).toBeTruthy();
  });
});

describe('<DataRequestsQueue>', () => {
  const rows = [
    {
      id: 'dr-1',
      reference: '0190AAAA',
      type: 'DELETE',
      status: 'REQUESTED',
      requestedAt: '2026-10-01T00:00:00Z',
      dueAt: '2026-10-31T00:00:00Z',
      completedAt: null,
      rejectionReason: null,
      overdue: true,
      family: { id: 'f1', name: 'Khan family' },
      student: null,
    },
  ];

  it('lists open requests with an overdue flag and refuses one with a reason', async () => {
    const api = mockApi({
      'GET /admin/data-requests': { body: rows },
      'POST /admin/data-requests/dr-1/reject': { body: { id: 'dr-1', status: 'REJECTED', rejectionReason: 'Duplicate request' } },
    });
    renderWithProviders(<DataRequestsQueue />);
    expect(await screen.findByText(/Khan family/)).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Refuse…' }));
    await user.type(screen.getByLabelText(/Reason for the family/), 'Duplicate request');
    await user.click(screen.getByRole('button', { name: 'Refuse request' }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'POST')).toBe(true));
    expect(api.calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Duplicate request' });
  });

  it('needs a real reason', () => {
    expect(validateRejectionReason(' x ')).toMatch(/why/);
    expect(validateRejectionReason('Open safeguarding case')).toBeNull();
  });
});
