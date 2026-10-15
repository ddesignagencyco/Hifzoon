// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancelSubscriptionModal, PauseSubscriptionModal } from '@/components/billing/SubscriptionModals';
import type { FamilySubscription } from '@/lib/api/modules/billing-family';
import { mockApi, envelope, apiError } from '../helpers/fetch-mock';
import { findErrorToast, renderWithProviders } from '../helpers/render';

const SUB: FamilySubscription = {
  id: 'sub-1',
  familyId: 'fam',
  planId: 'plan',
  currency: 'GBP',
  status: 'ACTIVE',
  providerSubscriptionId: 'fake',
  currentPeriodStart: '2026-10-01T00:00:00Z',
  currentPeriodEnd: '2026-10-31T00:00:00Z',
  pausedUntil: null,
  cancelAtPeriodEnd: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  plan: { code: 'ONE_3X', name: 'One-to-one, 3 classes/week', classesPerWeek: 3 },
};

const renderWithClient = (ui: React.ReactElement) => renderWithProviders(ui);

describe('CancelSubscriptionModal', () => {
  it('defaults to cancelling at period end and explains the consequence', async () => {
    const api = mockApi({
      'POST /billing/subscriptions/sub-1/cancel': { body: envelope({ ...SUB, cancelAtPeriodEnd: true }) },
      'GET /billing/family': { body: envelope({ subscriptions: [], invoices: [] }) },
    });
    const onClose = vi.fn();
    renderWithClient(<CancelSubscriptionModal subscription={SUB} onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/You will not be billed again/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const call = api.calls.find((c) => c.url.includes('/cancel'));
    expect(call?.method).toBe('POST');
    expect(call?.body).toEqual({ atPeriodEnd: true });
  });

  it('cancels immediately only after the family picks that option', async () => {
    const api = mockApi({
      'POST /billing/subscriptions/sub-1/cancel': { body: envelope({ ...SUB, status: 'CANCELLED' }) },
      'GET /billing/family': { body: envelope({ subscriptions: [], invoices: [] }) },
    });
    renderWithClient(<CancelSubscriptionModal subscription={SUB} onClose={() => undefined} />);

    await userEvent.click(screen.getByRole('radio', { name: /Immediately/ }));
    expect(screen.getByText(/cannot be resumed/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel now' }));

    await waitFor(() => expect(api.calls.some((c) => c.url.includes('/cancel'))).toBe(true));
    expect(api.calls.find((c) => c.url.includes('/cancel'))?.body).toEqual({ atPeriodEnd: false });
  });

  it('keeps the dialog open when the backend refuses', async () => {
    mockApi({
      'POST /billing/subscriptions/sub-1/cancel': apiError(409, 'CONFLICT', 'Subscription is already cancelled'),
      'GET /billing/family': { body: envelope({ subscriptions: [], invoices: [] }) },
    });
    const onClose = vi.fn();
    renderWithClient(<CancelSubscriptionModal subscription={SUB} onClose={onClose} />);

    const button = screen.getByRole('button', { name: 'Cancel at period end' });
    await userEvent.click(button);
    await findErrorToast('Subscription is already cancelled');
    // The failure is a toast only — nothing is rendered inside the dialog body.
    expect(screen.getByRole('dialog').textContent).not.toContain('Subscription is already cancelled');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('does not call the API when the family keeps the subscription', async () => {
    const api = mockApi({});
    const onClose = vi.fn();
    renderWithClient(<CancelSubscriptionModal subscription={SUB} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Keep subscription' }));
    expect(onClose).toHaveBeenCalled();
    expect(api.calls).toHaveLength(0);
  });
});

describe('PauseSubscriptionModal', () => {
  it('blocks out-of-range pauses client-side and sends a valid one', async () => {
    const api = mockApi({
      'POST /billing/subscriptions/sub-1/pause': {
        body: envelope({ ...SUB, status: 'PAUSED', pausedUntil: '2026-10-25T00:00:00Z' }),
      },
      'GET /billing/family': { body: envelope({ subscriptions: [], invoices: [] }) },
    });
    const onClose = vi.fn();
    renderWithClient(<PauseSubscriptionModal subscription={SUB} onClose={onClose} />);

    const input = screen.getByLabelText(/Pause for/);
    await userEvent.clear(input);
    await userEvent.type(input, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Pause subscription' }));
    await findErrorToast('Choose between 1 and 30 days.');
    // The field is marked invalid (red label) instead of showing inline error text.
    expect(screen.getByText(/Pause for/, { selector: 'label' }).className).toContain('text-red');
    expect(api.calls).toHaveLength(0);

    await userEvent.clear(input);
    await userEvent.type(input, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Pause subscription' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.calls.find((c) => c.url.includes('/pause'))?.body).toEqual({ days: 10 });
  });
});
