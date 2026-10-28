'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Award, BookOpen, ShieldCheck } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { detectTimeZone, parseBookingSelection } from '@/lib/api/modules/public-booking';

function BookingFromUrl() {
  const params = useSearchParams();
  const [initial] = useState(() => parseBookingSelection(params));
  const [detectedZone] = useState(() => detectTimeZone());
  return <BookingFlow initial={initial} detectedZone={detectedZone} />;
}

export default function BookTrialPage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
      <Header />

      <main className="flex-1">
        <section className="bg-[#0f2c24] text-white py-12 md:py-16 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="site-container text-center relative z-10">
            <h1 className="font-fraunces text-[32px] sm:text-[44px] md:text-[52px] font-normal tracking-tight text-white mb-3">
              Schedule a Free Trial Class
            </h1>
            <p className="text-[#c4d3cd] text-sm sm:text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Choose a course, pick a real open time with a cleared teacher, and confirm from your guardian account.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 pt-6 text-xs text-[#c4d3cd]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#c49a55]" aria-hidden /> Safeguarding-trained teachers
              </span>
              <span className="flex items-center gap-1.5">
                <Award className="w-4 h-4 text-[#c49a55]" aria-hidden /> Vetted through a 5-stage hiring process
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#c49a55]" aria-hidden /> Synchronized Mushaf classroom
              </span>
            </div>
          </div>
        </section>

        <Suspense
          fallback={<BrandLoader variant="page" hideLabel />}
        >
          <BookingFromUrl />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
