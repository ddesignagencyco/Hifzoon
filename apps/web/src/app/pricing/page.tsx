'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Check, 
  CalendarCheck, 
  ShieldCheck, 
  Clock, 
  Moon,
  ArrowRight
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Currency } from '@/lib/types';
import { PLANS_CONFIG, PRICING_DATA, FAQS_DATA } from '@/lib/data/mock-data';
import { usePlans } from '@/hooks';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

export default function PricingPage() {
  const { plans, isLoading } = usePlans();
  const [currency, setCurrency] = useState<Currency>(Currency.USD);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | '3MONTHS' | '6MONTHS'>('MONTHLY');
  const [siblingCount, setSiblingCount] = useState<number>(1);

  const curInfo = PRICING_DATA[currency] || PRICING_DATA[Currency.USD];
  const cycleDiscount = billingCycle === '3MONTHS' ? 0.90 : billingCycle === '6MONTHS' ? 0.85 : 1.0;

  const billingTabs = [
    { id: 'MONTHLY', label: 'Monthly' },
    { id: '3MONTHS', label: '3 Months', badge: '−10%' },
    { id: '6MONTHS', label: '6 Months', badge: '−15%' },
  ];

  // 15% discount on additional children
  const calculateTotal = (basePrice: number) => {
    const discountedBase = Math.round(basePrice * curInfo.rateMultiplier * cycleDiscount);
    if (siblingCount === 1) return discountedBase;
    const additionalChildren = siblingCount - 1;
    const discountedChildPrice = Math.round(discountedBase * 0.85);
    return discountedBase + (additionalChildren * discountedChildPrice);
  };

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header currentCurrency={currency} onCurrencyChange={setCurrency} />

      <main className="flex-1">
        {/* Full-Width Header: green-900 with star pattern */}
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 px-6 sm:px-8 lg:px-10 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
            aria-hidden="true"
          />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Transparent Tuition &amp; Sibling Policy
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Every tuition plan includes dedicated 1-on-1 instruction with verified scholars, synchronized Mushaf, daily recitation coach, and monthly report cards.
            </p>

            {/* Billing Cycle Selector Only */}
            <div className="pt-8 flex justify-center">
              <PillTabs
                items={billingTabs}
                activeId={billingCycle}
                onChange={(id) => setBillingCycle(id as any)}
                dark
              />
            </div>
          </div>
        </section>

        {/* Main Content Area */}
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-10 py-16">
          {/* Sibling Concession Banner */}
          <div className="bg-[#f6ecd9] rounded-[24px] p-6 border border-[#e6dfd1] mb-12 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-fraunces text-lg text-[#10201b] font-medium">
                Enrolling Multiple Children?
              </h3>
              <p className="text-xs sm:text-sm text-[#3c4a45] mt-0.5">
                Each additional sibling receives an automatic 15% tuition concession.
              </p>
            </div>

            {/* Sibling Counter */}
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-[#e6dfd1] shadow-2xs">
              <span className="text-xs font-semibold text-[#10201b]">Children:</span>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setSiblingCount(count)}
                    className={`w-7 h-7 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      siblingCount === count
                        ? 'bg-[#143a2f] text-white shadow-xs'
                        : 'text-[#3c4a45] hover:bg-[#f3eee4]'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 4 Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch mb-20">
            {PLANS_CONFIG.map((plan) => {
              const totalPrice = calculateTotal(plan.baseUsdPrice);
              const isPopular = plan.popular;

              return (
                <div
                  key={plan.id}
                  className={`rounded-[28px] p-7 md:p-8 flex flex-col justify-between transition-all relative ${
                    isPopular
                      ? 'bg-[#0f2c24] text-white shadow-large border border-[#143a2f] z-10'
                      : 'bg-white text-[#10201b] shadow-card border border-[#e6dfd1]'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#c49a55] text-[#0a1f19] text-[11px] font-bold uppercase tracking-wider py-1 px-3.5 rounded-full shadow-sm">
                      MOST CHOSEN
                    </div>
                  )}

                  <div>
                    <div
                      className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-2 ${
                        isPopular ? 'text-[#c49a55]' : 'text-[#a97f3c]'
                      }`}
                    >
                      {plan.type === 'CIRCLE' ? 'SMALL HALQA' : '1-ON-1'}
                    </div>

                    <h3
                      className={`font-fraunces text-[22px] font-medium leading-tight mb-1 truncate ${
                        isPopular ? 'text-white' : 'text-[#10201b]'
                      }`}
                    >
                      {plan.name}
                    </h3>

                    <p
                      className={`text-xs mb-6 min-h-[32px] ${
                        isPopular ? 'text-[#c4d3cd]' : 'text-[#6b7772]'
                      }`}
                    >
                      {plan.recommendedFor}
                    </p>

                    <div className="mb-4">
                      <span
                        className={`font-fraunces text-[44px] md:text-[50px] font-normal leading-none tracking-tight ${
                          isPopular ? 'text-white' : 'text-[#10201b]'
                        }`}
                      >
                        {curInfo.symbol}{totalPrice}
                      </span>
                      <span
                        className={`text-sm font-sans ml-1 ${
                          isPopular ? 'text-[#c4d3cd]' : 'text-[#6b7772]'
                        }`}
                      >
                        / month
                      </span>
                    </div>

                    <div
                      className={`text-xs font-semibold pb-4 mb-5 border-b ${
                        isPopular ? 'text-white/80 border-white/10' : 'text-[#143a2f] border-[#f3eee4]'
                      }`}
                    >
                      {plan.classesPerWeek} classes/week · {plan.classDurationMins} min
                    </div>

                    <div className="space-y-3 mb-8 text-xs">
                      {plan.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2.5">
                          <Check
                            className={`w-4 h-4 shrink-0 stroke-[2.5] mt-0.5 ${
                              isPopular ? 'text-[#c49a55]' : 'text-[#143a2f]'
                            }`}
                          />
                          <span className={isPopular ? 'text-[#c4d3cd]' : 'text-[#3c4a45]'}>
                            {feat}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

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

          {/* 3 Guarantees */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
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
      </main>

      <Footer />
    </div>
  );
}
