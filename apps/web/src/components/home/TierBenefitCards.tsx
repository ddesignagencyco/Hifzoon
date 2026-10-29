'use client';

import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { PublicLoadState } from '@/components/landing/PublicLoadState';
import type { PlanConfig } from '@/lib/api/client';

const PERIOD_LABEL: Record<string, string> = {
  MONTHLY: 'Billed monthly',
  QUARTERLY: 'Billed quarterly',
  HALF_YEARLY: 'Billed every 6 months',
};

/**
 * Public plan cards. The catalogue sells the teacher tier a plan guarantees and never a
 * price; a signed-in family sees the price in their own currency before subscribing.
 */
export function TierBenefitCards({
  plans,
  isLoading,
  isError,
  onRetry,
}: {
  plans: PlanConfig[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  if (plans.length === 0) {
    return (
      <PublicLoadState
        isLoading={Boolean(isLoading)}
        isError={Boolean(isError)}
        isEmpty
        onRetry={onRetry}
        what="plans"
        emptyText="No plans are currently offered."
      >
        {null}
      </PublicLoadState>
    );
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap justify-center items-stretch gap-6">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="w-full max-w-[420px] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] rounded-[28px] p-7 md:p-8 flex flex-col justify-between bg-white text-[#10201b] shadow-card border border-[#e6dfd1] transition-all hover:border-[#c49a55]/60"
          >
            <div>
              <div className="flex items-center gap-2 mb-3 min-h-[24px]">
                {plan.tier?.badgeIcon && (
                  <span className="text-xl leading-none" aria-hidden>
                    {plan.tier.badgeIcon}
                  </span>
                )}
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a97f3c]">
                  {plan.tier ? `${plan.tier.name} teacher` : plan.type === 'CIRCLE' ? 'Small circle' : '1-on-1'}
                </span>
              </div>

              <h3 className="font-fraunces text-[24px] font-medium leading-tight">{plan.name}</h3>
              {plan.tier?.description && (
                <p className="text-sm text-[#6b7772] mt-2 leading-relaxed">{plan.tier.description}</p>
              )}

              <ul className="space-y-2.5 mt-6 pt-5 border-t border-[#e6dfd1] text-sm">
                {[
                  `${plan.classesPerWeek} live class${plan.classesPerWeek === 1 ? '' : 'es'} per week, ${plan.classDurationMins} minutes each`,
                  plan.type === 'CIRCLE' ? 'Small group circle' : 'Private 1-on-1 lessons',
                  'Synchronized Mushaf and parent reporting',
                  PERIOD_LABEL[(plan.billingPeriod ?? 'MONTHLY').toUpperCase()] ?? 'Billed monthly',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#c49a55] mt-0.5 shrink-0" aria-hidden />
                    <span className="text-[#3c4a45]">{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Button variant="green" className="w-full mt-8 gap-2" href="/book-trial">
              Book a free trial
              <ArrowRight className="w-4 h-4" aria-hidden />
            </Button>
          </article>
        ))}
      </div>

      <div className="bg-[#f3eee4] rounded-[24px] p-6 md:p-8 border border-[#e6dfd1] max-w-2xl mx-auto">
        <h4 className="font-semibold text-[#10201b] mb-3">How it works</h4>
        <ol className="space-y-2 text-sm text-[#3c4a45] list-decimal pl-5">
          <li>Book up to three 30-minute trial sessions in your first week.</li>
          <li>Pick the plan whose teacher tier and class frequency suit your child.</li>
          <li>Your price is shown in your own currency before you confirm.</li>
        </ol>
      </div>
    </div>
  );
}
