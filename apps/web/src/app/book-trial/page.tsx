'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Award, BookOpen, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
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
        <section className="bg-[#0f2c24] text-white py-12 md:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-[#c49a55] border border-[#c49a55]/30 text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
              <span>30-minute evaluation · Free · No card required</span>
            </div>
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
          fallback={
            <div role="status" className="py-16 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#c49a55]" aria-label="Loading" />
            </div>
          }
        >
          <BookingFromUrl />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
