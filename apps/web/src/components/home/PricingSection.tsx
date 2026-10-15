'use client';

import React from 'react';
import { ShieldCheck, Clock, Moon } from 'lucide-react';
import { usePlans } from '@/hooks';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { PlanPriceGrid } from './PlanPriceGrid';

/** Home-page pricing: live plan prices in US dollars. */
export const PricingSection: React.FC = () => {
  const { plans, isLoading } = usePlans();

  return (
    <section id="pricing" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="site-container">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <Eyebrow centered>Transparent Tuition</Eyebrow>
          <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] mt-3 break-normal">
            Simple plans, priced in US dollars
          </h2>
          <p className="mt-4 text-[16.5px] md:text-[18.5px] text-[#3c4a45] leading-relaxed">
            Every plan includes the synchronized Mushaf and parent reporting.
          </p>
        </div>

        <PlanPriceGrid plans={plans} isLoading={isLoading} />

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
