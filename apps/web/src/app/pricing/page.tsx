'use client';

import React from 'react';
import { ShieldCheck, Clock, Moon } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { usePlans } from '@/hooks';
import { PlanPriceGrid } from '@/components/home/PlanPriceGrid';

export default function PricingPage() {
  const { plans, isLoading } = usePlans();

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 px-6 sm:px-8 lg:px-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Transparent Tuition
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Every plan is priced in US dollars — the exact amount you are billed, with no conversion surprises.
            </p>
          </div>
        </section>

        <div className="site-container py-16">
          <div className="mb-20">
            <PlanPriceGrid plans={plans} isLoading={isLoading} />
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
