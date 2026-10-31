// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsForm } from '@/components/admin/system/SettingsEditor';
import { SettingDescriptor } from '@/lib/api/modules/settings';
import { mockApi, envelope } from '../helpers/fetch-mock';

const SETTINGS: SettingDescriptor[] = [
  { key: 'billing.invoice_due_days', type: 'number', value: 7 },
  { key: 'billing.currency', type: 'string', value: 'GBP' },
  { key: 'platform.trial.enabled', type: 'boolean', value: true },
  { key: 'platform.contact.email', type: 'string' },
];

function renderForm(canEdit: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsForm settings={SETTINGS} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

describe('SettingsForm', () => {
  it('is read-only for admins (no save bar, disabled inputs)', () => {
    mockApi({});
    renderForm(false);
    expect((screen.getByLabelText('Days to pay an invoice') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Free trials can be booked/) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /save changes/i })).toBeNull();
  });

  it('saves only the changed keys, typed, after confirmation', async () => {
    const api = mockApi({
      'PATCH /admin/settings': (call) => ({ body: envelope((call.body as { patch: object }).patch) }),
      'GET /admin/settings': { body: envelope(SETTINGS) },
    });
    renderForm(true);

    const save = screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText('No unsaved changes.')).toBeTruthy();

    const due = screen.getByLabelText('Days to pay an invoice');
    await userEvent.clear(due);
    await userEvent.type(due, '10');
    await userEvent.click(screen.getByLabelText(/^Free trials can be booked/));
    expect(screen.getByText('2 unsaved changes')).toBeTruthy();

    await userEvent.click(save);
    const dialog = await screen.findByRole('dialog');
    // The confirm dialog names changes in plain words, never by raw key.
    expect(within(dialog).getByText('Days to pay an invoice')).toBeTruthy();
    expect(within(dialog).queryByText('billing.invoice_due_days')).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: /save 2 changes/i }));
    await waitFor(() => expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true));
    const patch = api.calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ patch: { 'billing.invoice_due_days': 10, 'platform.trial.enabled': false } });
  });

  it('flags invalid numbers and disables save; reset restores server values', async () => {
    mockApi({});
    renderForm(true);
    const due = screen.getByLabelText('Days to pay an invoice') as HTMLInputElement;
    await userEvent.clear(due);
    await userEvent.type(due, '-3');
    expect(screen.getByText('Cannot be negative.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /save changes/i }) as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(due.value).toBe('7');
    expect(screen.getByText('No unsaved changes.')).toBeTruthy();
  });
});
