'use client';

import React, { useState } from 'react';
import { Check, Loader2, Coins } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { formatMoney, CurrencySelect } from '@/components/ui/primitives';
import type { PlanConfig } from '@/lib/api/client';
import { Currency } from '@/lib/types';

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUAL: 'year',
  YEARLY: 'year',
  WEEKLY: 'week',
};

/** Default currency shown across the site. */
export const DISPLAY_CURRENCY = Currency.USD;

/** The stored price of a plan for the chosen currency (minor units), or null when none is set. */
export function planPrice(plan: PlanConfig, currency: Currency = DISPLAY_CURRENCY): number | null {
  const value = plan.pricesMinor?.[currency];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Plan cards priced from `GET /billing/plans` with interactive currency dropdown selector.
 * Directly displays database prices for the selected currency without conversion surprises.
 */
export function PlanPriceGrid({
  plans,
  isLoading,
  initialCurrency = Currency.USD,
}: {
  plans: PlanConfig[];
  isLoading?: boolean;
  initialCurrency?: Currency;
}) {
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(initialCurrency);

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

      {/* Currency Selector Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 pb-5 border-b border-[#e6dfd1]">
        <div>
          <h3 className="font-fraunces text-xl text-[#10201b]">Tuition &amp; Membership Options</h3>
          <p className="text-xs text-[#6b7772] mt-0.5">
            Select your local billing currency to view exact rates without foreign conversion fees
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <label htmlFor="tuition-currency-picker" className="text-xs font-semibold text-[#10201b] uppercase tracking-wider whitespace-nowrap">
            Currency:
          </label>
          <div className="w-full sm:w-56">
            <CurrencySelect
              id="tuition-currency-picker"
              value={selectedCurrency}
              onChange={(val) => setSelectedCurrency(val as Currency)}
            />
          </div>
        </div>
      </div>

      {/* Centred, wrapping row: any number of plans sits in the middle (1 / 2 / 3 per row). */}
      <div className="flex flex-wrap justify-center items-stretch gap-6">
        {plans.map((plan) => {
          const amount = planPrice(plan, selectedCurrency);
          const period = PERIOD_LABEL[(plan.billingPeriod ?? 'MONTHLY').toUpperCase()] ?? plan.billingPeriod?.toLowerCase() ?? 'month';
          return (
            <article
              key={plan.id}
              className="w-full max-w-[400px] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] rounded-[28px] p-7 md:p-8 flex flex-col justify-between bg-white text-[#10201b] shadow-card border border-[#e6dfd1] transition-all hover:border-[#c49a55]/60"
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
                        {formatMoney(amount, selectedCurrency)}
                      </span>
                      <span className="text-sm font-sans ml-1 text-[#6b7772]">/ {period}</span>
                    </>
                  ) : (
                    <div className="py-2 space-y-1">
                      <p className="text-sm font-semibold text-[#10201b]">Not yet priced in {selectedCurrency}</p>
                      <p className="text-xs text-[#6b7772]">Select USD or contact admissions for custom billing.</p>
                    </div>
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
