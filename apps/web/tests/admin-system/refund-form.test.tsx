// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefundForm } from '@/components/admin/finance/BillingForms';
import { mockApi, envelope } from '../helpers/fetch-mock';

const PAYMENT = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RefundForm />
    </QueryClientProvider>,
  );
}

describe('RefundForm', () => {
  it('blocks submission and shows DTO errors for empty input', async () => {
    const api = mockApi({});
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText('Payment ID is required.')).toBeTruthy();
    expect(screen.getByText('Amount is required.')).toBeTruthy();
    expect(screen.getByText('Reason must be at least 3 characters.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  it('rejects malformed amounts, non-UUID ids and amounts above the stated balance', async () => {
    mockApi({});
    renderForm();
    fireEvent.change(screen.getByLabelText(/payment id/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '12.345' } });
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: 'Duplicate' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText('Payment ID must be a UUID.')).toBeTruthy();
    expect(screen.getByText('Enter an amount like 12 or 12.50.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/payment id/i), { target: { value: PAYMENT } });
    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText(/refundable balance/i), { target: { value: '30' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText(/cannot exceed the amount still refundable/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirms, then posts minor units with an Idempotency-Key', async () => {
    const api = mockApi({
      'POST /admin/billing/refunds': {
        status: 201,
        body: envelope({ id: 'r1', paymentId: PAYMENT, amountMinor: 1250, reason: 'Duplicate', issuedById: 'u', createdAt: '2026-10-15T10:00:00Z' }),
      },
    });
    renderForm();
    fireEvent.change(screen.getByLabelText(/payment id/i), { target: { value: PAYMENT } });
    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: 'Duplicate' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('1250 minor units');
    expect(api.calls).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /^refund /i }));
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(api.calls[0].body).toEqual({ paymentId: PAYMENT, amountMinor: 1250, reason: 'Duplicate' });
    expect(api.calls[0].headers.get('Idempotency-Key')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Refund recorded')).toBeTruthy());
  });
});
