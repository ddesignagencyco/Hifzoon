// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseCreateForm } from '@/components/cases/CaseCreateForm';
import { mockApi, apiError } from '../helpers/fetch-mock';
import { findErrorToast, renderWithProviders } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CaseCreateForm errors go to toasts', () => {
  it('shows a failed open-case request as an error toast, not inline', async () => {
    const msg = 'Case service is unavailable';
    const api = mockApi({ 'POST /cases': apiError(503, 'UNAVAILABLE', msg) });
    const onCreated = vi.fn();
    renderWithProviders(<CaseCreateForm onCreated={onCreated} />);

    await userEvent.type(screen.getByLabelText(/summary/i), 'Learner disclosed something concerning in class.');
    await userEvent.click(screen.getByRole('button', { name: 'Open case' }));

    const toast = await findErrorToast(msg);
    expect(api.calls).toHaveLength(1);
    expect(onCreated).not.toHaveBeenCalled();
    // The message exists only in the toast — nothing rendered inside the form.
    expect(screen.getAllByText(msg)).toHaveLength(1);
    expect(toast.contains(screen.getByText(msg))).toBe(true);
    // Input is kept so the user can retry.
    expect((screen.getByLabelText(/summary/i) as HTMLTextAreaElement).value).toContain('Learner disclosed');
  });

  it('toasts the first validation problem and marks the field without inline text', async () => {
    const api = mockApi({});
    renderWithProviders(<CaseCreateForm onCreated={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/summary/i), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Open case' }));

    const toast = await findErrorToast(/at least 10 characters/i);
    expect(api.calls).toHaveLength(0);
    const visible = screen.getAllByText(/at least 10 characters/i).filter((el) => !el.classList.contains('sr-only'));
    expect(visible).toHaveLength(1);
    expect(toast.contains(visible[0])).toBe(true);
  });
});
