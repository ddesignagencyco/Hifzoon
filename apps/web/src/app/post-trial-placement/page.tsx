'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Award, 
  CheckCircle2, 
  Play, 
  Pause,
  CalendarCheck, 
  CreditCard, 
  ArrowRight,
  ShieldCheck,
  Star,
  BookOpen,
  Volume2,
  Target,
  ChevronRight,
  Clock,
  UserCheck
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/landing/Button';

export default function PostTrialPlacementPage() {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Grand Hero Banner strictly aligned to .site-container */}
        <section className="bg-[#0f2c24] text-white py-12 md:py-16 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="site-container relative z-10">
            
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#c4d3cd] mb-6">
              <Link href="/" className="hover:text-white transition-colors">Home</Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <Link href="/courses" className="hover:text-white transition-colors">Diagnostic</Link>
              <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              <span className="text-[#c49a55] font-medium">Placement Report: Rayan Z.</span>
            </nav>

            <div className="max-w-3xl space-y-4">
              <h1 className="font-fraunces text-3xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-[1.1]">
                Formative Assessment &amp; Placement Report
              </h1>

              <p className="text-[#c4d3cd] text-base md:text-lg leading-relaxed max-w-2xl font-light">
                Diagnostic class audit conducted by <strong>Sheikh Bilal Al-Azhari</strong> for student <strong>Rayan Z. (Age 8)</strong> following the complimentary diagnostic class.
              </p>

              {/* Verified Audit Badges */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <UserCheck className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  Conducted by Sheikh Bilal Al-Azhari
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <Clock className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  30-Min Diagnostic Audit
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-white border border-white/10">
                  <Volume2 className="w-3.5 h-3.5 text-[#c49a55]" aria-hidden /> 
                  Audited Recitation Audio Included
                </span>
              </div>
            </div>

          </div>
        </section>

        {/* Main Academic Diagnostic Workspace (Strictly aligned to .site-container) */}
        <div className="site-container py-10 md:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Column: Comprehensive Assessment Report (8 cols) */}
            <div className="lg:col-span-8 space-y-8">
              
              {/* Diagnostic Assessment Card */}
              <div className="bg-white rounded-[28px] border border-[#e6dfd1] p-6 sm:p-8 lg:p-10 shadow-card space-y-8">
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#f3eee4] gap-4">
                  <div>
                    <span className="text-xs text-[#a97f3c] font-semibold uppercase tracking-wider block">
                      Assessed Curriculum Pathway
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-fraunces font-medium text-[#10201b] mt-1">
                      Nazra Quran — Level 2 (Fluent Articulation)
                    </h2>
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#f0f6f3] border border-[#143a2f]/20 text-[#143a2f] text-xs font-semibold shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#143a2f]" />
                    <span>Ready for Immediate Enrolment</span>
                  </div>
                </div>

                {/* Examiner's Observations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                  <div className="p-5 sm:p-6 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-3.5">
                    <h3 className="font-fraunces font-medium text-[#143a2f] text-base flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#143a2f]" />
                      Observed Makharij &amp; Strengths
                    </h3>
                    <ul className="space-y-2.5 text-[#3c4a45] leading-relaxed">
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

                  <div className="p-5 sm:p-6 rounded-2xl bg-[#faf7f1] border border-[#e6dfd1] space-y-3.5">
                    <h3 className="font-fraunces font-medium text-[#a97f3c] text-base flex items-center gap-2">
                      <Target className="w-4 h-4 text-[#a97f3c]" />
                      Targeted Milestones in Level 2
                    </h3>
                    <ul className="space-y-2.5 text-[#3c4a45] leading-relaxed">
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

                {/* Lead Scholar Handwritten Feedback Note */}
                <div className="p-5 sm:p-6 rounded-2xl bg-[#f0f6f3]/60 border border-[#143a2f]/15 space-y-2 text-xs">
                  <div className="font-fraunces font-medium text-sm text-[#143a2f] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#143a2f]" />
                    Lead Scholar Diagnostic Note
                  </div>
                  <p className="text-[#3c4a45] leading-relaxed italic">
                    &ldquo;Rayan demonstrated commendable focus and enthusiasm. His foundational recognition of joined Arabic scripts is solid. In Level 2, we will focus on phonemic throat articulation and consistent rhythmic elongation (Madd), allowing him to read directly from the Mushaf with Tajweed fluency.&rdquo;
                  </p>
                  <p className="text-[11px] text-[#6b7772] font-medium pt-1">
                    — Sheikh Bilal Al-Azhari, Senior Tajweed Faculty &amp; Diagnostic Lead
                  </p>
                </div>

                {/* Audio Recitation Verification Clip */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#0f2c24] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-white/10">
                  <div className="flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                      className="w-11 h-11 rounded-full bg-[#c49a55] text-[#0a1f19] hover:bg-[#b58c49] flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm cursor-pointer"
                      aria-label={isPlayingAudio ? 'Pause recitation recording' : 'Play recitation recording'}
                    >
                      {isPlayingAudio ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5" />
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

            </div>

            {/* Right Column: Enrolment Activation Card (4 cols) */}
            <div className="lg:col-span-4 sticky top-28 space-y-6">
              
              <div className="bg-[#0f2c24] text-white rounded-[28px] p-6 sm:p-8 shadow-large border border-[#143a2f] relative overflow-hidden space-y-6">
                <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
                
                <div className="relative z-10 space-y-5">
                  <div className="pb-4 border-b border-white/10">
                    <span className="text-[#c49a55] text-xs font-semibold uppercase tracking-wider block">
                      Recommended Study Plan
                    </span>
                    <h3 className="text-xl sm:text-2xl font-fraunces font-normal text-white mt-1">
                      Standard Momentum
                    </h3>
                    <p className="text-xs text-[#c4d3cd] mt-1 font-light">
                      3 private 1-on-1 classes / week (12 classes / month)
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="text-3xl sm:text-4xl font-fraunces font-normal text-[#c49a55]">
                      $69 <span className="text-xs text-[#c4d3cd] font-sans font-normal">/ month</span>
                    </div>
                    <div className="text-[11px] text-[#c4d3cd]">
                      Equivalent to $5.75 per private class
                    </div>
                  </div>

                  <ul className="space-y-2.5 text-xs text-[#c4d3cd] pt-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0 mt-0.5" />
                      <span>Assigned to Sheikh Bilal Al-Azhari</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0 mt-0.5" />
                      <span>Interactive synchronized Mushaf classroom</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0 mt-0.5" />
                      <span>Daily practice coach &amp; monthly report card</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#c49a55] shrink-0 mt-0.5" />
                      <span>14-day 100% money-back satisfaction guarantee</span>
                    </li>
                  </ul>

                  <div className="pt-3 space-y-3">
                    <Button
                      variant="gold"
                      size="default"
                      href="/pricing"
                      icon={<CreditCard />}
                      className="w-full font-semibold justify-center shadow-md cursor-pointer min-h-[46px]"
                    >
                      Activate Enrolment ($69/mo)
                    </Button>

                    <Button
                      variant="outline"
                      size="default"
                      href="/book-trial"
                      className="w-full text-xs justify-center border-white/20 text-white hover:bg-white/10"
                    >
                      Book Another Diagnostic Class
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#c4d3cd]/80 pt-1 justify-center">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#c49a55]" />
                    <span>Change teacher or reschedule anytime</span>
                  </div>
                </div>
              </div>

              {/* Need assistance contact card */}
              <div className="p-5 rounded-2xl bg-white border border-[#e6dfd1] text-xs text-[#6b7772] space-y-2 shadow-xs">
                <div className="font-semibold text-[#10201b]">Have questions about the report?</div>
                <p className="text-[11px] leading-relaxed">
                  Our academic admissions advisors are available on WhatsApp and email to discuss curriculum adjustments or class schedules.
                </p>
                <div className="pt-1">
                  <Link href="/resources" className="text-xs font-semibold text-[#143a2f] hover:underline inline-flex items-center gap-1">
                    Read curriculum guidelines <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>

            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
