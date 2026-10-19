// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { mockApi } from '../helpers/fetch-mock';
import { Role } from '@/lib/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/parent/billing',
  useSearchParams: () => new URLSearchParams(),
}));

import { billingEnabled } from '@/lib/features';
import { PORTALS, navForRoles } from '@/lib/portal/nav';
import ParentBillingPage from '@/app/parent/billing/page';
import CheckoutSuccessPage from '@/app/parent/billing/checkout/success/page';
import CheckoutCancelledPage from '@/app/parent/billing/checkout/cancelled/page';
import AdminBillingPage from '@/app/admin/billing/page';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const labels = (portal: keyof typeof PORTALS, roles: Role[]) => navForRoles(PORTALS[portal], roles).map((i) => i.label);

describe('billingEnabled()', () => {
  it('is off when the flag is unset, "false" or anything but "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', '');
    expect(billingEnabled()).toBe(false);
    for (const value of ['false', 'TRUE', '1', 'yes', ' true']) {
      vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', value);
      expect(billingEnabled()).toBe(false);
    }
  });

  it('is on only for the string "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    expect(billingEnabled()).toBe(true);
  });
});

describe('portal nav with billing off', () => {
  it('drops Billing from the family and admin sidebars but keeps payroll', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'false');
    const parent = labels('parent', [Role.GUARDIAN]);
    expect(parent).not.toContain('Billing');
    expect(parent).toEqual(['Overview', 'Children', 'Timetable', 'Messages', 'Privacy & consent', 'Notifications']);
    const admin = labels('admin', [Role.SUPER_ADMIN]);
    expect(admin).not.toContain('Billing');
    expect(admin).toContain('Payroll');
  });

  it('shows Billing again when the flag is "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'true');
    expect(labels('parent', [Role.GUARDIAN])).toContain('Billing');
    expect(labels('admin', [Role.ADMIN])).toContain('Billing');
  });
});

describe('/parent/billing with billing off', () => {
  it('shows the "not available yet" notice instead of plans, subscribe or checkout', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'false');
    const api = mockApi({});
    renderWithProviders(<ParentBillingPage />);
    expect(screen.getByText("Billing isn't available yet")).toBeTruthy();
    expect(screen.getByText(/the academy will contact you about fees/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /subscribe|choose plan|pay/i })).toBeNull();
    // Nothing billing-related is fetched.
    expect(api.calls).toHaveLength(0);
  });

  it('turns the checkout return pages into the same notice', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'false');
    mockApi({});
    renderWithProviders(<CheckoutSuccessPage />);
    expect(screen.getByText("Billing isn't available yet")).toBeTruthy();
    expect(screen.queryByText('Payment submitted')).toBeNull();
    cleanup();
    renderWithProviders(<CheckoutCancelledPage />);
    expect(screen.getByText("Billing isn't available yet")).toBeTruthy();
    expect(screen.queryByText('Payment cancelled')).toBeNull();
  });

  it('replaces the admin billing console too', () => {
    vi.stubEnv('NEXT_PUBLIC_BILLING_ENABLED', 'false');
    const api = mockApi({});
    renderWithProviders(<AdminBillingPage />);
    expect(screen.getByText("Billing isn't available yet")).toBeTruthy();
    expect(screen.queryByText('Billing operations')).toBeNull();
    expect(api.calls).toHaveLength(0);
  });
});
