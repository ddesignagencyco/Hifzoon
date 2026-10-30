// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefundForm } from '@/components/admin/finance/BillingForms';
import { mockApi, envelope } from '../helpers/fetch-mock';
import { chooseOption } from '../helpers/render';

const PAYMENT = '01a13f96-725f-7ba3-babc-66dc3d2f2bff';

/** The form picks a payment from `GET /admin/billing/lookups` instead of a pasted id. */
const LOOKUPS = {
  'GET /admin/billing/lookups': {
    status: 200,
    body: envelope({
      subscriptions: [],
      invoices: [],
      payments: [
        {
          id: PAYMENT,
          status: 'SUCCEEDED',
          amountMinor: 5500,
          currency: 'GBP',
          createdAt: '2026-10-15T10:00:00Z',
          invoice: { number: 'INV-1', family: { name: 'Khan Family' } },
          refundedMinor: 2500,
          refundableMinor: 3000,
        },
      ],
    }),
  },
};
const writes = (calls: Array<{ method: string }>) => calls.filter((c) => c.method !== 'GET');
const PAYMENT_LABEL = /Khan Family/;

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
    const api = mockApi(LOOKUPS);
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText('Payment ID is required.')).toBeTruthy();
    expect(screen.getByText('Amount is required.')).toBeTruthy();
    expect(screen.getByText('Reason must be at least 3 characters.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writes(api.calls)).toHaveLength(0);
  });

  it('rejects malformed amounts and amounts above what is left to refund', async () => {
    mockApi(LOOKUPS);
    renderForm();
    await screen.findByText('Select a payment'); // the payment list has loaded
    await chooseOption(screen.getByLabelText(/^payment/i), PAYMENT_LABEL);
    // £30 is left after an earlier £25 refund; the API's balance caps the amount.
    expect(screen.getByText(/Up to £30 can be refunded on this payment/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '12.345' } });
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: 'Duplicate' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText('Enter an amount like 12 or 12.50.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '40' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));
    expect(screen.getByText(/cannot exceed the amount still refundable/i)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirms, then posts minor units with an Idempotency-Key', async () => {
    const api = mockApi({
      ...LOOKUPS,
      'POST /admin/billing/refunds': {
        status: 201,
        body: envelope({ id: 'r1', paymentId: PAYMENT, amountMinor: 1250, reason: 'Duplicate', issuedById: 'u', createdAt: '2026-10-15T10:00:00Z' }),
      },
    });
    renderForm();
    await screen.findByText('Select a payment'); // the payment list has loaded
    await chooseOption(screen.getByLabelText(/^payment/i), PAYMENT_LABEL);
    fireEvent.change(screen.getByLabelText(/refund amount/i), { target: { value: '12.50' } });
    fireEvent.change(screen.getByLabelText(/^reason/i), { target: { value: 'Duplicate' } });
    await userEvent.click(screen.getByRole('button', { name: /review refund/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('£12.50');
    expect(writes(api.calls)).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /^refund /i }));
    await waitFor(() => expect(writes(api.calls)).toHaveLength(1));
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ paymentId: PAYMENT, amountMinor: 1250, reason: 'Duplicate' });
    expect(post.headers.get('Idempotency-Key')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Refund recorded')).toBeTruthy());
  });
});
