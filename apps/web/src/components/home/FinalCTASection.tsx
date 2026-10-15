import React from 'react';
import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/landing/Button';

export const FinalCTASection: React.FC = () => {
  return (
    <section className="bg-[#faf7f1] pb-20 md:pb-28">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#143a2f] text-white rounded-[36px] p-8 md:p-14 relative overflow-hidden shadow-large border border-[#1c4c3e]">
          {/* Star Pattern Background */}
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.07] pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
            {/* Left Column */}
            <div>
              <h2 className="font-fraunces text-[26px] sm:text-[36px] md:text-[44px] font-normal leading-[1.15] text-white break-normal">
                Begin your child’s journey with a{' '}
                <span className="italic font-normal text-[#c49a55]">
                  free evaluation class
                </span>
              </h2>

              <p className="mt-4 text-[15px] md:text-[17px] text-[#c4d3cd] leading-relaxed max-w-xl">
                Thirty minutes, one-to-one, with a vetted teacher. You leave with an honest placement recommendation.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Button
                  variant="gold"
                  size="default"
                  href="/book-trial"
                  icon={<CalendarCheck />}
                >
                  Book free evaluation
                </Button>

                <Button
                  variant="ghostLight"
                  size="default"
                  href="#pricing"
                >
                  See pricing
                </Button>
              </div>
            </div>

            {/* Right Column: Three Numbered Step Rows */}
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-[20px] bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] font-fraunces font-bold text-lg flex items-center justify-center shrink-0 shadow-sm">
                  1
                </div>
                <div className="font-medium text-white text-[15px]">
                  Pick a time that suits your timezone
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-[20px] bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] font-fraunces font-bold text-lg flex items-center justify-center shrink-0 shadow-sm">
                  2
                </div>
                <div className="font-medium text-white text-[15px]">
                  Meet your teacher in the live Mushaf classroom
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-[20px] bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] font-fraunces font-bold text-lg flex items-center justify-center shrink-0 shadow-sm">
                  3
                </div>
                <div className="font-medium text-white text-[15px]">
                  Get a level and plan, then decide
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
