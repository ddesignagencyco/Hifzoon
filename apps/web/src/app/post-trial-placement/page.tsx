'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Award, 
  CheckCircle2, 
  Sparkles, 
  Play, 
  Pause,
  CalendarCheck, 
  CreditCard, 
  ArrowRight,
  ShieldCheck,
  Star,
  BookOpen,
  Volume2,
  Check
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';

export default function PostTrialPlacementPage() {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
      <Header />

      <main className="flex-1 py-10 md:py-16">
        <div className="max-w-[1000px] w-full mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          
          {/* Academic Certificate Plaque Header */}
          <div className="bg-[#0f2c24] text-white p-8 sm:p-10 rounded-[28px] shadow-large relative overflow-hidden border border-[#143a2f]">
            <div 
              className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative z-10 space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 text-[#c49a55] text-xs font-semibold border border-[#c49a55]/30">
                <Award className="w-3.5 h-3.5" />
                <span>Official Academic Diagnostic Placement</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-fraunces font-normal tracking-tight text-white">
                Formative Assessment &amp; Placement Report
              </h1>
              <p className="text-xs sm:text-sm text-[#c4d3cd] max-w-xl font-light leading-relaxed">
                Conducted by <strong>Sheikh Bilal Al-Azhari</strong> for student <strong>Rayan Z. (Age 8)</strong> following the complimentary diagnostic class.
              </p>
            </div>
          </div>

          {/* Diagnostic Assessment Card */}
          <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-8 shadow-card space-y-6">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#e6dfd1] gap-4">
              <div>
                <span className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider block">
                  Assessed Curriculum Pathway:
                </span>
                <h2 className="text-xl sm:text-2xl font-fraunces font-medium text-[#10201b] mt-1">
                  Nazra Quran — Level 2 (Fluent Articulation)
                </h2>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f0f6f3] border border-[#c49a55]/30 text-[#143a2f] text-xs font-semibold shrink-0">
                <CheckCircle2 className="w-4 h-4 text-[#143a2f]" />
                <span>Ready for Immediate Enrolment</span>
              </div>
            </div>

            {/* Examiner's Observations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="p-5 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-3">
                <h4 className="font-fraunces font-medium text-[#143a2f] text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#143a2f]" />
                  Observed Makharij &amp; Reading Strengths:
                </h4>
                <ul className="space-y-2 text-[#3c4a45] leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#143a2f] font-bold">•</span>
                    <span>Accurate recognition and articulation of joined letters without hesitation.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#143a2f] font-bold">•</span>
                    <span>Attentive and respectful posture throughout the 30-minute diagnostic session.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#143a2f] font-bold">•</span>
                    <span>Instant recognition of Fatha, Kasra, and Damma vowel signs.</span>
                  </li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-3">
                <h4 className="font-fraunces font-medium text-[#a97f3c] text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#a97f3c]" />
                  Targeted Milestones in Level 2:
                </h4>
                <ul className="space-y-2 text-[#3c4a45] leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#a97f3c] font-bold">•</span>
                    <span>Firm distinction between heavy and light throat letters (Qaf vs Kaf, Sad vs Seen).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#a97f3c] font-bold">•</span>
                    <span>Standardizing 2-count natural vowel elongation (Madd Tabee&apos;ee) across lines.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#a97f3c] font-bold">•</span>
                    <span>Breathing discipline and proper stops (Waqf) without clipping end syllables.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Audio Recitation Verification Clip */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0f2c24] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                  className="w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] hover:bg-[#b58c49] flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm cursor-pointer"
                  aria-label={isPlayingAudio ? 'Pause recitation recording' : 'Play recitation recording'}
                >
                  {isPlayingAudio ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>
                <div className="text-xs">
                  <div className="font-fraunces font-medium text-sm text-white">
                    Diagnostic Class Recitation Audio Sample (01:45)
                  </div>
                  <div className="text-[11px] text-[#c4d3cd] mt-0.5">
                    Rayan reciting Surah Al-Fatiha under Sheikh Bilal&apos;s guidance
                  </div>
                </div>
              </div>
              <span className="text-[10px] bg-white/10 text-[#c49a55] border border-[#c49a55]/30 px-3 py-1 rounded-full font-mono self-start sm:self-auto font-bold uppercase tracking-wider">
                RECORDING AUDITED
              </span>
            </div>

          </div>

          {/* Recommended Curriculum Enrolment Activation */}
          <div className="bg-[#0f2c24] text-white rounded-[28px] p-6 sm:p-10 shadow-large border border-[#143a2f] relative overflow-hidden">
            <div 
              className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
              aria-hidden="true"
            />

            <div className="relative z-10 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/10">
                <div>
                  <span className="text-[#c49a55] text-xs font-semibold uppercase tracking-wider block">
                    Recommended Study Plan for Rayan:
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-fraunces font-normal text-white mt-1">
                    Standard Momentum (3 Classes / Week)
                  </h3>
                  <p className="text-xs sm:text-sm text-[#c4d3cd] mt-1.5 max-w-lg font-light leading-relaxed">
                    Includes 1-on-1 instruction with Sheikh Bilal, synchronized Mushaf classroom, daily practice coach, and monthly report cards.
                  </p>
                </div>

                <div className="text-left md:text-right shrink-0">
                  <div className="text-3xl sm:text-4xl font-fraunces font-normal text-[#c49a55]">
                    $69 <span className="text-xs text-[#c4d3cd] font-sans font-normal">/ month</span>
                  </div>
                  <div className="text-[11px] text-[#c4d3cd] mt-0.5">12 private classes / month</div>
                </div>
              </div>

              {/* Next Steps CTA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-[#c4d3cd]">
                  <ShieldCheck className="w-4 h-4 text-[#c49a55] shrink-0" />
                  <span>14-day 100% satisfaction guarantee · Change teacher or cancel anytime</span>
                </div>

                <Button
                  variant="gold"
                  size="default"
                  href="/pricing"
                  icon={<CreditCard />}
                  className="w-full sm:w-auto font-semibold whitespace-nowrap shrink-0"
                >
                  Activate Enrolment ($69/mo)
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
