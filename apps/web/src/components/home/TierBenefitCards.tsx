'use client';

import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/landing/Button';
import { PublicLoadState } from '@/components/landing/PublicLoadState';
import type { PlanConfig } from '@/lib/api/client';

/**
 * Tier-based pricing cards for public plans page.
 * Shows teacher tier each plan guarantees, not price (price is hidden until checkout).
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
      {/* Plans Section */}
      <div className="flex flex-wrap justify-center items-stretch gap-6">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="w-full max-w-[420px] md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] rounded-[28px] p-8 flex flex-col justify-between bg-white text-[#10201b] shadow-card border border-[#e6dfd1] transition-all hover:border-[#c49a55]/60"
          >
            <div>
              {/* Tier Badge */}
              {plan.tier && (
                <div className="flex items-center gap-2 mb-4">
                  {plan.tier.badgeIcon && (
                    <span className="text-2xl" aria-hidden>
                      {plan.tier.badgeIcon}
                    </span>
                  )}
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a97f3c]">
                    {plan.tier.name}
                  </span>
                </div>
              )}

              {/* Plan Name */}
              <h3 className="font-fraunces text-[28px] font-normal leading-tight mb-2">
                {plan.name}
              </h3>

              {/* Class Details */}
              <div className="space-y-3 my-6 pt-4 border-t border-[#e6dfd1]">
                <div className="flex items-start gap-3">
                  <span className="text-lg font-semibold text-[#c49a55] shrink-0">✓</span>
                  <div>
                    <p className="font-semibold text-sm text-[#10201b]">
                      {plan.classesPerWeek} live class{plan.classesPerWeek === 1 ? '' : 'es'} per week
                    </p>
                    <p className="text-xs text-[#6b7772] mt-0.5">
                      {plan.classDurationMins} minutes each
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-lg font-semibold text-[#c49a55] shrink-0">✓</span>
                  <div>
                    <p className="font-semibold text-sm text-[#10201b]">
                      {plan.type === 'CIRCLE' ? 'Small group circle' : 'Private 1-on-1'}
                    </p>
                    <p className="text-xs text-[#6b7772] mt-0.5">
                      Matched with {plan.tier?.name.toLowerCase() || 'qualified'} teachers
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-lg font-semibold text-[#c49a55] shrink-0">✓</span>
                  <div>
                    <p className="font-semibold text-sm text-[#10201b]">
                      Synchronized Mushaf & parent portal
                    </p>
                    <p className="text-xs text-[#6b7772] mt-0.5">
                      Track progress, reschedule, message teacher
                    </p>
                  </div>
                </div>
              </div>

              {/* Tier Description */}
              {plan.tier?.description && (
                <p className="text-xs text-[#6b7772] italic mt-4 pt-4 border-t border-[#e6dfd1]">
                  {plan.tier.description}
                </p>
              )}
            </div>

            {/* CTA Button */}
            <Button
              variant="primary"
              className="w-full mt-8 flex items-center justify-center gap-2"
              href="/book-trial"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </Button>
          </article>
        ))}
      </div>

      {/* Info Banner */}
      <div className="bg-[#f3eee4] rounded-[24px] p-8 border border-[#e6dfd1] max-w-2xl mx-auto">
        <h4 className="font-semibold text-[#10201b] mb-3">How it works</h4>
        <ul className="space-y-2 text-sm text-[#3c4a45]">
          <li>✓ Book a free 30-minute trial with a teacher from any tier</li>
          <li>✓ Choose your plan based on the teacher tier and class frequency you need</li>
          <li>✓ Start your lessons with guaranteed-quality, matched instruction</li>
          <li>✓ 14-day guarantee — change teacher or get a full refund</li>
        </ul>
      </div>
    </div>
  );
}
