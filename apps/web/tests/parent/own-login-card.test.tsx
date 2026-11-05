// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnLoginCard } from '@/components/parent/OwnLoginCard';
import { useFamilyStudents } from '@/hooks/useFamily';
import type { FamilyStudent } from '@/lib/api/modules/families';
import { apiError, envelope, mockApi } from '../helpers/fetch-mock';
import { findErrorToast, findSuccessToast, renderWithProviders } from '../helpers/render';

const year = new Date().getUTCFullYear();
const PASSWORD = 'correct-horse-12';

function child(overrides: Partial<FamilyStudent> = {}): FamilyStudent {
  return {
    id: 'stu-1',
    displayName: 'Zara',
    birthYear: year - 14,
    gender: 'FEMALE',
    language: 'en',
    timeZone: 'Europe/London',
    kidsMode: true,
    userId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    hasOwnLogin: false,
    loginEmail: null,
    ...overrides,
  };
}

/** Renders the card from the family list, the way the settings tab does, so a refetch shows up. */
function Harness() {
  const students = useFamilyStudents('fam-1');
  const student = students.data?.[0];
  return student ? <OwnLoginCard familyId="fam-1" student={student} /> : <p>Loading…</p>;
}

describe('OwnLoginCard (FR-AUTH-03)', () => {
  it('explains the age rule and stays disabled for a child under 13', () => {
    const api = mockApi({});
    renderWithProviders(<OwnLoginCard familyId="fam-1" student={child({ birthYear: year - 10 })} />);

    expect(screen.getByText('Own login')).toBeTruthy();
    expect(screen.getByText('Available from age 13')).toBeTruthy();
    expect(screen.queryByLabelText(/Email/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Create login' }) as HTMLButtonElement).disabled).toBe(true);
    expect(api.calls).toHaveLength(0);
  });

  it('validates with the register page rules before calling the API', async () => {
    const api = mockApi({});
    const user = userEvent.setup();
    renderWithProviders(<OwnLoginCard familyId="fam-1" student={child()} />);

    await user.type(screen.getByLabelText(/Email/), 'zara@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'short');
    expect(screen.getByText(/5\/12 chars minimum/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Create login' }));
    await findErrorToast('Password must be at least 12 characters long.');
    expect(screen.getByLabelText(/^Password/).getAttribute('aria-invalid')).toBe('true');

    await user.clear(screen.getByLabelText(/^Password/));
    await user.type(screen.getByLabelText(/^Password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm password/), 'something-else');
    await user.click(screen.getByRole('button', { name: 'Create login' }));
    await findErrorToast('Passwords do not match.');
    expect(api.calls).toHaveLength(0);
  }, 15000);

  it('creates the login, toasts and then shows who the child is signed in as', async () => {
    let linked = false;
    const api = mockApi({
      'GET /families/fam-1/students': () => ({
        body: envelope([
          linked
            ? child({ userId: 'user-new', kidsMode: false, hasOwnLogin: true, loginEmail: 'zara@example.com' })
            : child(),
        ]),
      }),
      'POST /families/fam-1/students/stu-1/login': () => {
        linked = true;
        return {
          status: 201,
          body: envelope({
            ...child({ userId: 'user-new', kidsMode: false }),
            familyId: 'fam-1',
            hasOwnLogin: true,
            loginEmail: 'zara@example.com',
          }),
        };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(await screen.findByLabelText(/Email/), ' Zara@Example.com ');
    await user.type(screen.getByLabelText(/^Password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm password/), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    await findSuccessToast('Zara can now sign in as zara@example.com.');
    const post = api.calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ email: 'zara@example.com', password: PASSWORD });

    await screen.findByText('Signed in as', { exact: false });
    expect(screen.getByText('zara@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove login' })).toBeTruthy();
  }, 15000);

  it('shows the API error when the email is already in use', async () => {
    mockApi({
      'POST /families/fam-1/students/stu-1/login': apiError(409, 'EMAIL_TAKEN', 'That email address is already in use'),
    });
    const user = userEvent.setup();
    renderWithProviders(<OwnLoginCard familyId="fam-1" student={child()} />);

    await user.type(screen.getByLabelText(/Email/), 'taken@example.com');
    await user.type(screen.getByLabelText(/^Password/), PASSWORD);
    await user.type(screen.getByLabelText(/Confirm password/), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Create login' }));

    await findErrorToast(/already in use/);
  }, 15000);

  it('removes an existing login only after confirmation', async () => {
    const api = mockApi({
      'DELETE /families/fam-1/students/stu-1/login': {
        body: envelope({ ...child({ kidsMode: false }), familyId: 'fam-1', hasOwnLogin: false, loginEmail: null }),
      },
    });
    const user = userEvent.setup();
    renderWithProviders(
      <OwnLoginCard
        familyId="fam-1"
        student={child({ userId: 'user-1', kidsMode: false, hasOwnLogin: true, loginEmail: 'zara@example.com' })}
      />,
    );

    expect(screen.getByText('zara@example.com')).toBeTruthy();
    expect(screen.queryByLabelText(/Email/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Remove login' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(api.calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Remove login' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, remove login' }));

    await findSuccessToast('Zara’s login has been removed.');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.calls.map((c) => c.method)).toEqual(['DELETE']);
    expect(api.calls[0].url).toContain('/families/fam-1/students/stu-1/login');
  }, 15000);
});
