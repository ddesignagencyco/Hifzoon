// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/billing',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useAuth: () => ({ currentUser: { roles: ['SUPER_ADMIN'] }, isAuthenticated: true, isResolved: true, isLoading: false }),
}));

import { PricingManager } from '@/components/admin/finance/PricingManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PRICES = {
  currency: 'USD',
  tiers: [{ id: 't-senior', code: 'SENIOR', name: 'Senior', badgeIcon: null, active: true, teacherCount: 1 }],
  plans: [
    {
      id: 'p1',
      code: 'C3',
      name: 'Circle, 3 classes/week',
      classesPerWeek: 3,
      classMinutes: 45,
      roomType: 'CIRCLE',
      billingPeriod: 'MONTHLY',
      periodDiscountPercent: 0,
      active: true,
      tierId: null,
      liveSubscriptions: 0,
      prices: [{ amountMinor: 5500 }],
      tierPrices: [{ tierId: 't-senior', amountMinor: 20000 }],
    },
  ],
};

describe('Plans & prices: one Save button per plan row', () => {
  it('saves nothing while typing or leaving a field, then saves the changed prices on Save', async () => {
    const api = mockApi({
      'GET /admin/billing/prices': { body: envelope(PRICES) },
      'PUT /admin/billing/prices': (call) => ({ body: envelope(call.body) }),
    });
    renderWithProviders(<PricingManager />);

    const standard = await screen.findByLabelText('Circle, 3 classes/week standard price in USD');
    const save = screen.getByRole('button', { name: 'Save Circle, 3 classes/week' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(standard, { target: { value: '60' } });
    fireEvent.blur(standard);
    fireEvent.change(screen.getByLabelText('Circle, 3 classes/week tier price in USD'), { target: { value: '' } });
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false);
    expect((save as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(save);
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'PUT')).toHaveLength(2));
    const bodies = api.calls.filter((c) => c.method === 'PUT').map((c) => c.body);
    expect(bodies).toContainEqual({ planId: 'p1', tierId: null, amountMinor: 6000 });
    expect(bodies).toContainEqual({ planId: 'p1', tierId: 't-senior', amountMinor: null });
  });

  it('refuses an invalid price without calling the API, and Undo restores the saved values', async () => {
    const api = mockApi({ 'GET /admin/billing/prices': { body: envelope(PRICES) } });
    renderWithProviders(<PricingManager />);

    const standard = await screen.findByLabelText('Circle, 3 classes/week standard price in USD');
    fireEvent.change(standard, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Circle, 3 classes/week' }));
    expect(await screen.findByText('Enter a price like 71 or 71.50.')).toBeTruthy();
    expect(api.calls.some((c) => c.method === 'PUT')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect((standard as HTMLInputElement).value).toBe('55.00');
  });
});
