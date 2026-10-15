'use client';

import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { formatMoney } from '@/components/ui/primitives';
import type { PlanConfig } from '@/lib/api/client';
import { Currency } from '@/lib/types';

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUAL: 'year',
  YEARLY: 'year',
  WEEKLY: 'week',
};

/** Prices are shown in US dollars only. */
export const DISPLAY_CURRENCY = Currency.USD;

/** The stored USD price of a plan (minor units, from its `prices` USD row), or null when none is set. */
export function planPrice(plan: PlanConfig): number | null {
  const value = plan.pricesMinor?.[DISPLAY_CURRENCY];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Plan cards priced from `GET /billing/plans` in US dollars — the amount the academy
 * actually charges, never a converted estimate.
 */
export function PlanPriceGrid({
  plans,
  isLoading,
}: {
  plans: PlanConfig[];
  isLoading?: boolean;
}) {
  if (isLoading && plans.length === 0) {
    return (
      <div role="status" className="flex justify-center items-center gap-2 py-16 text-sm text-[#6b7772]">
        <Loader2 className="w-4 h-4 animate-spin text-[#c49a55]" aria-hidden /> Loading plans…
      </div>
    );
  }
  if (plans.length === 0) {
    return <p className="text-center text-sm text-[#6b7772] py-16">No plans are currently offered.</p>;
  }

  const isBaseline = plans.every((p) => p.source === 'baseline');

  return (
    <>
      {isBaseline && (
        <p role="status" className="mb-6 rounded-2xl border border-[#e6dfd1] bg-[#f6ecd9] px-4 py-3 text-xs text-[#3c4a45] text-center">
          Live pricing is temporarily unavailable. Prices shown are indicative, in US dollars only.
        </p>
      )}
      {/* Centred, wrapping row: any number of plans sits in the middle (1 / 2 / 3 per row). */}
      <div className="flex flex-wrap justify-center items-stretch gap-6">
        {plans.map((plan) => {
          const amount = planPrice(plan);
          const period = PERIOD_LABEL[(plan.billingPeriod ?? 'MONTHLY').toUpperCase()] ?? plan.billingPeriod?.toLowerCase() ?? 'month';
          return (
            <article
              key={plan.id}
              className="w-full max-w-[400px] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] rounded-[28px] p-7 md:p-8 flex flex-col justify-between bg-white text-[#10201b] shadow-card border border-[#e6dfd1]"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2 text-[#a97f3c]">
                  {plan.type === 'CIRCLE' ? 'Small circle' : '1-on-1'}
                </p>
                <h3 className="font-fraunces text-[22px] font-medium leading-tight mb-1">{plan.name}</h3>
                {plan.recommendedFor && <p className="text-xs mb-4 text-[#6b7772]">{plan.recommendedFor}</p>}

                <div className="my-5">
                  {amount !== null ? (
                    <>
                      <span className="font-fraunces text-[40px] md:text-[46px] font-normal leading-none tracking-tight">
                        {formatMoney(amount, DISPLAY_CURRENCY)}
                      </span>
                      <span className="text-sm font-sans ml-1 text-[#6b7772]">/ {period}</span>
                    </>
                  ) : (
                    <p className="text-sm text-[#6b7772]">Not yet priced in USD.</p>
                  )}
                </div>

                <p className="text-xs font-semibold pb-4 mb-5 border-b text-[#143a2f] border-[#f3eee4]">
                  {plan.classesPerWeek} classes/week · {plan.classDurationMins} min
                </p>

                <ul className="space-y-3 mb-8 text-xs">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 shrink-0 stroke-[2.5] mt-0.5 text-[#143a2f]" aria-hidden />
                      <span className="text-[#3c4a45]">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <Button variant="green" href="/book-trial" className="w-full text-sm font-semibold">
                  Start with a free trial
                </Button>
                <p className="text-[11px] text-center mt-3 text-[#6b7772]">Free 30-minute evaluation first</p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
