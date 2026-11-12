'use client';

import React from 'react';
import { formatMoney } from '@/components/ui/primitives';
import { useTeacherPrices } from '@/hooks/useBilling';
import { BILLING_CURRENCY, periodLabel } from '@/lib/api/modules/billing-family';
import { cn } from '@/lib/utils';

export const PRICE_CONFIRMED_NOTE =
  'Confirmed at checkout. Sibling and promo discounts may lower it.';

/**
 * "From $X / month" for one teacher (their tier price, else the standard price), with a
 * "See plans" disclosure listing each plan. Shown on the public teacher pages and the
 * booking slot picker so a family knows the cost before the trial.
 *
 * Prices are in USD (Stripe shows the family their local currency at checkout). Renders
 * nothing until the prices are known, and nothing when no plan has a price: a missing price
 * is better than a wrong one.
 */
export function TeacherPriceTag({
  teacherId,
  tone = 'light',
  compact = false,
  className,
}: {
  /** Teacher **profile** id. */
  teacherId: string;
  /** `dark` on the green hero of the profile page. */
  tone?: 'light' | 'dark';
  /** Only the "From" line (the slot picker's teacher headings). */
  compact?: boolean;
  className?: string;
}) {
  const currency = BILLING_CURRENCY;
  const prices = useTeacherPrices(teacherId);
  const data = prices.data;
  if (!data || data.fromMonthlyMinor === null) return null;

  const strong = tone === 'dark' ? 'text-white' : 'text-[#10201b]';
  const muted = tone === 'dark' ? 'text-[#c4d3cd]' : 'text-[#6b7772]';
  const from = (
    <>
      From{' '}
      <span className={cn('font-semibold tabular-nums', strong)}>
        {formatMoney(data.fromMonthlyMinor, currency)}
      </span>{' '}
      / month
    </>
  );

  if (compact) {
    return (
      <span
        className={cn('text-[11px] font-normal', muted, className)}
        title={PRICE_CONFIRMED_NOTE}
      >
        {from}
      </span>
    );
  }

  return (
    <div className={cn('text-xs', muted, className)} data-testid="teacher-price">
      <p>
        {from} <span className="text-[11px]">· confirmed at checkout</span>
      </p>
      <details className="mt-1 group">
        <summary
          className={cn(
            'cursor-pointer select-none text-[11px] font-semibold underline underline-offset-2 w-fit',
            tone === 'dark' ? 'text-[#c49a55]' : 'text-[#1c4c3e]',
          )}
        >
          See plans
        </summary>
        <ul className="mt-2 space-y-1.5">
          {data.plans.map((plan) => (
            <li key={plan.planId} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>
                <span className={cn('font-semibold', strong)}>{plan.name}</span> ·{' '}
                {plan.classesPerWeek} × {plan.classMinutes} min a week
              </span>
              <span className="tabular-nums">
                <span className={cn('font-semibold', strong)}>
                  {formatMoney(plan.monthlyMinor, currency)}
                </span>{' '}
                / month
                {plan.months > 1 && (
                  <span className="block text-[11px] text-right">
                    {formatMoney(plan.periodPriceMinor, currency)} per{' '}
                    {periodLabel(plan.billingPeriod)}
                    {plan.periodDiscountPercent > 0 && ` (save ${plan.periodDiscountPercent}%)`}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px]">{PRICE_CONFIRMED_NOTE}</p>
      </details>
    </div>
  );
}
