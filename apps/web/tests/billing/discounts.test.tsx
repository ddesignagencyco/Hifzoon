// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../helpers/render';
import { envelope, mockApi } from '../helpers/fetch-mock';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/parent/billing',
  useSearchParams: () => new URLSearchParams(),
}));

import { PlanPriceTag, PromoCodeField, QuoteLines } from '@/components/billing/Discounts';
import { FamilyBillingScreen } from '@/components/billing/FamilyBillingScreen';
import { periodSavingLine } from '@/components/home/TierBenefitCards';
import { promoBody, promoState } from '@/components/admin/finance/PromoCodesManager';
import { PriceQuote, discountLabel, periodSaving } from '@/lib/api/modules/billing-family';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const QUOTE: PriceQuote = {
  currency: 'GBP',
  monthlyMinor: 10_000,
  months: 3,
  listMinor: 30_000,
  periodDiscountPercent: 10,
  periodDiscountMinor: 3_000,
  periodPriceMinor: 27_000,
  sibling: null,
  promo: {
    promoCodeId: 'p1',
    code: 'WELCOME25',
    percentOff: 25,
    amountOffMinor: null,
    amountMinor: 6_750,
  },
  applied: 'PROMO',
  extraDiscountMinor: 6_750,
  finalMinor: 20_250,
};

describe('discount helpers', () => {
  it('shows a period saving only when the plan has one', () => {
    expect(
      periodSaving({ amountMinor: 27_000, listMinor: 30_000, periodDiscountPercent: 10 }),
    ).toEqual({
      beforeMinor: 30_000,
      savingMinor: 3_000,
      percent: 10,
    });
    expect(
      periodSaving({ amountMinor: 4_900, listMinor: 4_900, periodDiscountPercent: 0 }),
    ).toBeNull();
    expect(periodSaving({ amountMinor: 4_900 })).toBeNull();
  });

  it('names the discount a quote took', () => {
    expect(discountLabel(QUOTE)).toBe('Promo WELCOME25 (25%)');
    expect(
      discountLabel({ ...QUOTE, applied: 'SIBLING', sibling: { percent: 10, amountMinor: 1 } }),
    ).toBe('Sibling discount (10%)');
    expect(discountLabel({ ...QUOTE, applied: null })).toBeNull();
  });

  it('advertises the saving on the public plan cards as a percentage, never a price', () => {
    expect(periodSavingLine({ billingPeriod: 'QUARTERLY', periodDiscountPercent: 10 })).toBe(
      'Save 10% by paying for 3 months',
    );
    expect(periodSavingLine({ billingPeriod: 'MONTHLY', periodDiscountPercent: 10 })).toBeNull();
    expect(periodSavingLine({ billingPeriod: 'HALF_YEARLY', periodDiscountPercent: 0 })).toBeNull();
  });

  it('turns the admin promo form into an API body, refusing bad values', () => {
    const form = {
      code: ' spring-25 ',
      kind: 'amount' as const,
      percent: '',
      amount: '5.50',
      maxRedemptions: '100',
      expiresOn: '2026-12-31',
      active: true,
      planIds: [],
    };
    expect(promoBody(form).body).toEqual({
      code: 'SPRING-25',
      percentOff: null,
      amountOffMinor: 550,
      maxRedemptions: 100,
      expiresAt: '2026-12-31T23:59:59.000Z',
      active: true,
      appliesToPlanIds: [],
    });
    expect(promoBody({ ...form, kind: 'percent', percent: '60' }).error).toMatch(/1 to 50/);
    expect(promoBody({ ...form, code: 'x' }).error).toMatch(/3–40/);
  });

  it('says whether a code is usable now', () => {
    const base = {
      id: 'p',
      code: 'X',
      percentOff: 10,
      amountOffMinor: null,
      currency: null,
      maxRedemptions: 2,
      redeemedCount: 0,
      expiresAt: null,
      active: true,
      appliesToPlanIds: [],
      createdAt: '2026-11-01',
    };
    const now = new Date('2026-11-06');
    expect(promoState(base, now).label).toBe('Live');
    expect(promoState({ ...base, redeemedCount: 2 }, now).label).toBe('Used up');
    expect(promoState({ ...base, expiresAt: '2026-11-01T00:00:00Z' }, now).label).toBe('Expired');
    expect(promoState({ ...base, active: false }, now).label).toBe('Off');
  });
});

describe('price display', () => {
  it('shows the before and after price and the saving on a prepaid plan', () => {
    render(
      <PlanPriceTag
        price={{ amountMinor: 27_000, listMinor: 30_000, periodDiscountPercent: 10 }}
        currency="GBP"
        period="quarter"
      />,
    );
    expect(screen.getByText('£300')).toBeTruthy();
    expect(screen.getByText(/£270/)).toBeTruthy();
    expect(screen.getByText(/Save £30 \(10%\) by paying for the quarter/)).toBeTruthy();
  });

  it('shows a plain price on a monthly plan', () => {
    render(
      <PlanPriceTag
        price={{ amountMinor: 4_900, listMinor: 4_900, periodDiscountPercent: 0 }}
        currency="GBP"
        period="month"
      />,
    );
    expect(screen.getByText(/£49/)).toBeTruthy();
    expect(screen.queryByText(/Save/)).toBeNull();
  });

  it('breaks a quote down line by line, ending on the total each period', () => {
    render(<QuoteLines quote={QUOTE} currency="GBP" period="quarter" promoEntered />);
    const lines = screen.getByLabelText('Price breakdown');
    expect(within(lines).getByText('3 months at £100')).toBeTruthy();
    expect(within(lines).getByText('Paying for the quarter (10%)')).toBeTruthy();
    expect(within(lines).getByText('−£30')).toBeTruthy();
    expect(within(lines).getByText('Promo WELCOME25 (25%)')).toBeTruthy();
    expect(within(lines).getByText('−£67.50')).toBeTruthy();
    expect(screen.getByTestId('quote-total').textContent).toBe('£202.50');
  });

  it('explains why an entered code is unused when the sibling discount is larger', () => {
    render(
      <QuoteLines
        quote={{
          ...QUOTE,
          applied: 'SIBLING',
          sibling: { percent: 30, amountMinor: 8_100 },
          extraDiscountMinor: 8_100,
          finalMinor: 18_900,
        }}
        currency="GBP"
        period="quarter"
        promoEntered
      />,
    );
    expect(screen.getByText(/sibling discount is larger than WELCOME25/)).toBeTruthy();
  });
});

describe('promo code field', () => {
  it('applies the typed code upper-cased, on the button or Enter', () => {
    const onApply = vi.fn();
    render(<PromoCodeField applied={null} onApply={onApply} onClear={vi.fn()} error={null} />);
    const input = screen.getByLabelText('Promo code');
    fireEvent.change(input, { target: { value: 'welcome25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onApply).toHaveBeenNthCalledWith(1, 'WELCOME25');
    expect(onApply).toHaveBeenNthCalledWith(2, 'WELCOME25');
  });

  it('shows the server’s reason for a rejected code', () => {
    render(
      <PromoCodeField
        applied="OLD"
        onApply={vi.fn()}
        onClear={vi.fn()}
        error="This promo code has expired."
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('This promo code has expired.');
    expect(screen.getByLabelText('Promo code').getAttribute('aria-invalid')).toBe('true');
  });

  it('lets the family remove an applied code', () => {
    const onClear = vi.fn();
    render(<PromoCodeField applied="WELCOME25" onApply={vi.fn()} onClear={onClear} error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(onClear).toHaveBeenCalled();
  });
  it('lets the family remove a rejected code, which would otherwise block payment', () => {
    const onClear = vi.fn();
    render(
      <PromoCodeField applied="BADCODE" onApply={vi.fn()} onClear={onClear} error="This promo code does not exist." />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove code/ }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('choosing a plan on the family billing page', () => {
  const PLAN = {
    id: 'plan-q',
    code: 'Q',
    name: 'Quarterly 2x',
    classesPerWeek: 2,
    classMinutes: 30,
    roomType: 'ONE_TO_ONE',
    billingPeriod: 'QUARTERLY',
    periodDiscountPercent: 10,
    tier: null,
  };
  const PRICE = {
    id: 'pp',
    planId: 'plan-q',
    currency: 'USD',
    amountMinor: 27_000,
    monthlyMinor: 10_000,
    months: 3,
    listMinor: 30_000,
    periodDiscountPercent: 10,
    periodDiscountMinor: 3_000,
    createdAt: '',
    updatedAt: '',
  };

  function setup() {
    return mockApi({
      'GET /families': {
        body: envelope([
          { id: 'fam-1', name: 'Ali', country: 'GB', currency: 'USD', createdAt: '', members: [] },
        ]),
      },
      'GET /billing/family': { body: envelope({ subscriptions: [], invoices: [] }) },
      'GET /billing/family/payments': { body: envelope([]) },
      'GET /billing/offers': { body: envelope([]) },
      'GET /billing/plans': { body: envelope([PLAN]) },
      'GET /billing/plans/plan-q/price': { body: envelope(PRICE) },
      'POST /billing/subscribe': {
        body: envelope({ id: 'sub-1', checkoutUrl: null, firstInvoice: null }),
      },
    });
  }

  // A plan bought here linked no child, teacher or weekly times, so the family still could
  // not book regular classes. The dialog now leads into the start flow instead.
  it('never subscribes blind: the plan leads to choosing a child, teacher and times', async () => {
    const api = setup();
    renderWithProviders(<FamilyBillingScreen />);

    // Every price is in USD, whatever the family's country.
    expect(await screen.findByText(/Save (US)?\$30 \(10%\)/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Start this plan' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog)
        .getByRole('link', { name: /Choose child, teacher and times/ })
        .getAttribute('href'),
    ).toBe('/parent/start?plan=plan-q');
    expect(within(dialog).getByRole('link', { name: 'Browse teachers' }).getAttribute('href')).toBe(
      '/teachers',
    );
    expect(within(dialog).queryByRole('button', { name: /Continue to payment/ })).toBeNull();
    expect(within(dialog).queryByLabelText('Promo code')).toBeNull();
    expect(api.calls.some((c) => c.method === 'POST' && c.url.includes('/billing/subscribe'))).toBe(
      false,
    );
  });
});
