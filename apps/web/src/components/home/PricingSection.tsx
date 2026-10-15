'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ShieldCheck, Clock, Moon } from 'lucide-react';
import { Currency } from '@/lib/types';
import { PRICING_DATA } from '@/lib/data/mock-data';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

interface PricingSectionProps {
  currentCurrency?: Currency;
  onCurrencyChange?: (c: Currency) => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({
  currentCurrency = Currency.USD,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | '3months' | '6months'>('monthly');

  const billingTabs = [
    { id: 'monthly', label: 'Monthly' },
    { id: '3months', label: '3 months', badge: '−10%' },
    { id: '6months', label: '6 months', badge: '−15%' },
  ];

  const discountMultiplier =
    billingCycle === '3months' ? 0.9 : billingCycle === '6months' ? 0.85 : 1.0;

  // Synced with header selected currency
  const currencyConfig = PRICING_DATA[currentCurrency] || PRICING_DATA[Currency.USD];

  const plans = [
    {
      id: 'starter',
      eyebrow: '1-ON-1',
      name: 'Starter Pace',
      subtitle: 'Qaida beginners or busy adults',
      baseUsd: 48,
      cadence: '2 classes a week · 30 min',
      popular: false,
      features: [
        '8 private live classes a month',
        'Dedicated vetted teacher',
        'Synchronized Mushaf with mistake tagging',
        'Parent portal with audio notes',
        'Free rescheduling up to 4 hours ahead',
      ],
    },
    {
      id: 'standard',
      eyebrow: '1-ON-1',
      name: 'Standard Momentum',
      subtitle: 'Nazra & Tajweed mastery',
      baseUsd: 69,
      cadence: '3 classes a week · 30 min',
      popular: false,
      features: [
        '12 private live classes a month',
        'Lesson cards & monthly report card',
        'Daily practice between lessons',
        'Spaced-repetition retention tracking',
        'Sibling linking with 15% off',
      ],
    },
    {
      id: 'intensive',
      eyebrow: '1-ON-1',
      name: 'Hifz Intensive',
      subtitle: 'Active memorization & Muraja’ah',
      baseUsd: 135,
      cadence: '5 classes a week · 45 min',
      popular: true,
      features: [
        '20 extended classes for Sabaq, Sabqi & Manzil',
        '604-page Hifz heatmap & milestones',
        'Quarterly oral exams, external examiner',
        'Direct messaging with teacher',
        'Hifz completion certificate',
      ],
    },
    {
      id: 'circle',
      eyebrow: 'SMALL HALQA',
      name: 'Group Circle',
      subtitle: 'Peer learning in cohorts of 6–8',
      baseUsd: 38,
      cadence: '3 classes a week · 45 min',
      popular: false,
      features: [
        '12 group sessions a month',
        'Grouped strictly by age & level',
        'Turn-based recitation queue',
        'Shared Mushaf & teacher pointer',
        'Most affordable way to start',
      ],
    },
  ];

  return (
    <section id="pricing" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Eyebrow centered>Transparent Tuition</Eyebrow>
          <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] mt-3 break-normal">
            Simple monthly plans, no contracts
          </h2>
          <p className="mt-4 text-[16.5px] md:text-[18.5px] text-[#3c4a45] leading-relaxed">
            Pause for family travel or cancel anytime. Every plan includes the synchronized Mushaf and full parent reporting.
          </p>
        </div>

        {/* Billing PillTabs Only (Currency is synced with header) */}
        <div className="flex items-center justify-center mb-6">
          <PillTabs
            items={billingTabs}
            activeId={billingCycle}
            onChange={(id) => setBillingCycle(id as any)}
          />
        </div>

        {/* Sibling Concession Line */}
        <div className="text-center text-xs md:text-sm text-[#a97f3c] font-medium mb-12">
          Sibling concession: 15% off automatically for each additional child.
        </div>

        {/* 4 Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch pt-4">
          {plans.map((plan) => {
            const convertedPrice = Math.round(
              plan.baseUsd * currencyConfig.rateMultiplier * discountMultiplier
            );
            const isPopular = plan.popular;

            return (
              <div
                key={plan.id}
                className={`rounded-[28px] p-7 md:p-8 flex flex-col justify-between transition-all relative ${
                  isPopular
                    ? 'bg-[#0f2c24] text-white shadow-large lg:-mt-4 lg:mb-4 border border-[#143a2f] z-10'
                    : 'bg-white text-[#10201b] shadow-card border border-[#e6dfd1]'
                }`}
              >
                {/* Most Chosen Gold Badge */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#c49a55] text-[#0a1f19] text-[11px] font-bold uppercase tracking-wider py-1 px-3.5 rounded-full shadow-sm">
                    MOST CHOSEN
                  </div>
                )}

                <div>
                  {/* Plan Type Eyebrow */}
                  <div
                    className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-2 ${
                      isPopular ? 'text-[#c49a55]' : 'text-[#a97f3c]'
                    }`}
                  >
                    {plan.eyebrow}
                  </div>

                  {/* Plan Name */}
                  <h3
                    className={`font-fraunces text-[22px] font-medium leading-tight mb-1 truncate ${
                      isPopular ? 'text-white' : 'text-[#10201b]'
                    }`}
                  >
                    {plan.name}
                  </h3>

                  {/* Subtitle */}
                  <p
                    className={`text-xs mb-6 min-h-[32px] ${
                      isPopular ? 'text-[#c4d3cd]' : 'text-[#6b7772]'
                    }`}
                  >
                    {plan.subtitle}
                  </p>

                  {/* Price */}
                  <div className="mb-4">
                    <span
                      className={`font-fraunces text-[46px] md:text-[54px] font-normal leading-none tracking-tight ${
                        isPopular ? 'text-white' : 'text-[#10201b]'
                      }`}
                    >
                      {currencyConfig.symbol}
                      {convertedPrice}
                    </span>
                    <span
                      className={`text-sm font-sans ml-1 ${
                        isPopular ? 'text-[#c4d3cd]' : 'text-[#6b7772]'
                      }`}
                    >
                      / month
                    </span>
                  </div>

                  {/* Cadence */}
                  <div
                    className={`text-xs font-semibold pb-5 mb-5 border-b ${
                      isPopular
                        ? 'text-white/80 border-white/10'
                        : 'text-[#143a2f] border-[#f3eee4]'
                    }`}
                  >
                    {plan.cadence}
                  </div>

                  {/* 5 Checks */}
                  <div className="space-y-3 mb-8 text-xs">
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2.5">
                        <Check
                          className={`w-4 h-4 shrink-0 stroke-[2.5] mt-0.5 ${
                            isPopular ? 'text-[#c49a55]' : 'text-[#143a2f]'
                          }`}
                        />
                        <span
                          className={isPopular ? 'text-[#c4d3cd]' : 'text-[#3c4a45]'}
                        >
                          {feat}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div>
                  <Button
                    variant={isPopular ? 'gold' : 'green'}
                    size="default"
                    href={`/book-trial?plan=${plan.id}`}
                    className="w-full text-sm font-semibold"
                  >
                    Start free trial
                  </Button>
                  <p
                    className={`text-[11px] text-center mt-3 ${
                      isPopular ? 'text-white/60' : 'text-[#6b7772]'
                    }`}
                  >
                    1 week risk-free · no card
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3 Sand Guarantee Cards Below */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
          <div className="bg-[#f3eee4] rounded-[24px] p-6 border border-[#e6dfd1] flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#1c4c3e] shrink-0 shadow-2xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[15px] text-[#10201b]">
                14-day satisfaction guarantee
              </h4>
              <p className="mt-1 text-xs text-[#6b7772] leading-relaxed">
                Change teacher or get a full refund in your first 14 days.
              </p>
            </div>
          </div>

          <div className="bg-[#f3eee4] rounded-[24px] p-6 border border-[#e6dfd1] flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#1c4c3e] shrink-0 shadow-2xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[15px] text-[#10201b]">
                4-hour reschedule courtesy
              </h4>
              <p className="mt-1 text-xs text-[#6b7772] leading-relaxed">
                Reschedule in the parent portal and keep a make-up credit.
              </p>
            </div>
          </div>

          <div className="bg-[#f3eee4] rounded-[24px] p-6 border border-[#e6dfd1] flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#1c4c3e] shrink-0 shadow-2xs">
              <Moon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-[15px] text-[#10201b]">
                Ramadan &amp; break flexibility
              </h4>
              <p className="mt-1 text-xs text-[#6b7772] leading-relaxed">
                Shift class times for Ramadan and school breaks, keep your slot.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
