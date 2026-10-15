'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Users, 
  User, 
  Calendar, 
  Clock, 
  Award, 
  BookOpen, 
  CheckCircle2, 
  FileText, 
  Play, 
  Pause,
  Highlighter, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Sparkles,
  CalendarCheck
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

function PortalPreviewContent() {
  const [activePortal, setActivePortal] = useState<'PARENT' | 'STUDENT' | 'TEACHER'>('PARENT');
  const [selectedChild, setSelectedChild] = useState<'RAYAN' | 'ZOYA'>('RAYAN');
  const [playingClip, setPlayingClip] = useState<string | null>(null);

  const toggleClip = (id: string) => {
    setPlayingClip(playingClip === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex flex-col justify-between selection:bg-[#143D33] selection:text-white">
      <Header />

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-6 sm:px-8 lg:px-10 py-10 sm:py-14">
        
        {/* Editorial Top Header & Role Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 mb-8 border-b border-[#e6dfd1] gap-5">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-4xl font-fraunces font-normal text-[#10201b] tracking-tight">
              Interactive Academic Portal Previews
            </h1>
            <p className="text-xs sm:text-sm text-[#6b7772] max-w-2xl leading-relaxed">
              Experience the purpose-built portal environment designed for parent transparency, child motivation, and rigorous faculty preparation.
            </p>
          </div>

          <div className="flex p-1 bg-[#f3eee4] rounded-full text-xs font-semibold self-start md:self-auto">
            <button
              type="button"
              onClick={() => setActivePortal('PARENT')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activePortal === 'PARENT' 
                  ? 'bg-[#143a2f] text-white shadow-xs font-bold' 
                  : 'text-[#3c4a45] hover:text-[#10201b]'
              }`}
            >
              Parent Portal
            </button>
            <button
              type="button"
              onClick={() => setActivePortal('STUDENT')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activePortal === 'STUDENT' 
                  ? 'bg-[#143a2f] text-white shadow-xs font-bold' 
                  : 'text-[#3c4a45] hover:text-[#10201b]'
              }`}
            >
              Student &amp; Kids Mode
            </button>
            <button
              type="button"
              onClick={() => setActivePortal('TEACHER')}
              className={`px-4 py-2 rounded-full transition-all cursor-pointer ${
                activePortal === 'TEACHER' 
                  ? 'bg-[#143a2f] text-white shadow-xs font-bold' 
                  : 'text-[#3c4a45] hover:text-[#10201b]'
              }`}
            >
              Faculty Workspace
            </button>
          </div>
        </div>

        {/* 1. PARENT PORTAL VIEW (SRS FR-PAR-01 to FR-PAR-07) */}
        {activePortal === 'PARENT' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            
            {/* Child Selector Pills */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-serif font-semibold text-[#143D33]">Select Student Profile:</span>
              <button
                type="button"
                onClick={() => setSelectedChild('RAYAN')}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  selectedChild === 'RAYAN'
                    ? 'bg-[#143D33] text-white shadow-xs font-semibold'
                    : 'bg-[#FCFBF9] border border-[#E3DACD] text-[#5A6862] hover:bg-[#F4EFEA]'
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-[#C5A880] text-[#143D33] text-[10px] font-bold flex items-center justify-center">
                  R
                </div>
                <span>Rayan (Age 8) • Nazra Lvl 2</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedChild('ZOYA')}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                  selectedChild === 'ZOYA'
                    ? 'bg-[#143D33] text-white shadow-xs font-semibold'
                    : 'bg-[#FCFBF9] border border-[#E3DACD] text-[#5A6862] hover:bg-[#F4EFEA]'
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-[#9E7D53] text-white text-[10px] font-bold flex items-center justify-center">
                  Z
                </div>
                <span>Zoya (Age 10) • Hifz Juz 29</span>
              </button>
            </div>

            {/* Top KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#FCFBF9] border border-[#E3DACD] shadow-xs">
                <div className="text-xs text-[#5A6862] font-medium flex items-center justify-between">
                  <span>Next Live Class</span>
                  <Calendar className="w-4 h-4 text-[#143D33]" />
                </div>
                <div className="text-lg font-serif font-bold text-[#1A221E] mt-2">
                  Tomorrow @ 05:30 PM
                </div>
                <div className="text-[11px] text-[#143D33] font-medium mt-1">
                  with Sheikh Bilal Al-Azhari
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FCFBF9] border border-[#E3DACD] shadow-xs">
                <div className="text-xs text-[#5A6862] font-medium flex items-center justify-between">
                  <span>Monthly Attendance</span>
                  <CheckCircle2 className="w-4 h-4 text-[#143D33]" />
                </div>
                <div className="text-lg font-serif font-bold text-[#1A221E] mt-2">
                  100% (11 / 11 Classes)
                </div>
                <div className="text-[11px] text-[#5A6862] mt-1">
                  0 missed • 1 rescheduled credit
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FCFBF9] border border-[#E3DACD] shadow-xs">
                <div className="text-xs text-[#5A6862] font-medium flex items-center justify-between">
                  <span>Independent Practice</span>
                  <Clock className="w-4 h-4 text-[#9E7D53]" />
                </div>
                <div className="text-lg font-serif font-bold text-[#1A221E] mt-2">
                  145 Mins This Week
                </div>
                <div className="text-[11px] text-[#143D33] font-medium mt-1">
                  +25% over weekly target
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FCFBF9] border border-[#E3DACD] shadow-xs">
                <div className="text-xs text-[#5A6862] font-medium flex items-center justify-between">
                  <span>Current Mastery</span>
                  <Award className="w-4 h-4 text-[#143D33]" />
                </div>
                <div className="text-lg font-serif font-bold text-[#1A221E] mt-2">
                  Surah Al-Mulk (V. 1-18)
                </div>
                <div className="text-[11px] text-[#143D33] font-medium mt-1">
                  Oral Grade: EXCELLENT (Mumtaz)
                </div>
              </div>
            </div>

            {/* Detailed Lesson Record Card */}
            <div className="p-6 sm:p-8 rounded-2xl bg-[#FCFBF9] border border-[#E3DACD] shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E3DACD] gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase bg-[#EAE4DC] text-[#143D33] px-2.5 py-0.5 rounded border border-[#D5C9B8]">
                    Delivered Today • Verified
                  </span>
                  <h3 className="text-xl font-serif font-bold text-[#1A221E] mt-1">
                    Lesson Record #LCR-892 — Surah Al-Mulk
                  </h3>
                </div>
                <div className="text-xs text-[#5A6862]">
                  Class Duration: <strong>32 Minutes</strong> • Ustadh: <strong>Sheikh Bilal</strong>
                </div>
              </div>

              {/* Portions Covered Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD]">
                  <div className="text-[10px] font-bold text-[#9E7D53] uppercase tracking-wider">Sabaq (New Lesson)</div>
                  <div className="text-sm font-serif font-bold text-[#1A221E] mt-1">Surah Al-Mulk: Verses 1–5</div>
                  <div className="text-[11px] font-semibold text-[#143D33] mt-1">Grade: EXCELLENT (Mumtaz)</div>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD]">
                  <div className="text-[10px] font-bold text-[#9E7D53] uppercase tracking-wider">Sabqi (Recent Review)</div>
                  <div className="text-sm font-serif font-bold text-[#1A221E] mt-1">Surah At-Tahrim: Verses 9–12</div>
                  <div className="text-[11px] font-semibold text-[#143D33] mt-1">Grade: VERY GOOD (Jayyid Jiddan)</div>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD]">
                  <div className="text-[10px] font-bold text-[#9E7D53] uppercase tracking-wider">Manzil (Retention Cycle)</div>
                  <div className="text-sm font-serif font-bold text-[#1A221E] mt-1">Juz 30 (An-Naba to Al-Mutaffifin)</div>
                  <div className="text-[11px] font-semibold text-[#143D33] mt-1">Grade: EXCELLENT (Mumtaz)</div>
                </div>
              </div>

              {/* Tagged Corrections & Playback Timestamps */}
              <div className="p-5 rounded-2xl bg-[#143D33] text-white space-y-3.5 border border-[#1E5648]">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-[#1E5648]">
                  <span className="font-serif font-bold flex items-center gap-2 text-[#C5A880]">
                    <Highlighter className="w-4 h-4 text-[#C5A880]" />
                    <span>In-Class Vocal Corrections Tagged by Ustadh (FR-REC-01):</span>
                  </span>
                  <span className="text-[10px] text-[#C4D5D0]">Click to listen to classroom audio marker</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#18483C] border border-[#256353] flex items-center justify-between">
                    <div>
                      <div className="font-arabic text-lg text-[#FAF8F5] leading-none mb-1">قَدِيرٌ</div>
                      <div className="text-[11px] text-[#C4D5D0]">Qalqalah on letter Dal needed sharper echo release</div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => toggleClip('clip-1')}
                      className="p-2 rounded-lg bg-[#C5A880] hover:bg-[#D4BC98] text-[#143D33] transition-colors"
                      aria-label="Play Qalqalah audio clip"
                    >
                      {playingClip === 'clip-1' ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#18483C] border border-[#256353] flex items-center justify-between">
                    <div>
                      <div className="font-arabic text-lg text-[#FAF8F5] leading-none mb-1">لِيَبْلُوَكُمْ</div>
                      <div className="text-[11px] text-[#C4D5D0]">Short vowel (Damma on Waw) elongated slightly beyond 1 count</div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => toggleClip('clip-2')}
                      className="p-2 rounded-lg bg-[#C5A880] hover:bg-[#D4BC98] text-[#143D33] transition-colors"
                      aria-label="Play Damma audio clip"
                    >
                      {playingClip === 'clip-2' ? (
                        <Pause className="w-3.5 h-3.5 fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Homework and Teacher Guidance */}
              <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD] text-xs text-[#33423C] space-y-1.5">
                <span className="font-serif font-bold text-[#143D33] block">Assigned Practice &amp; Teacher Note:</span>
                <p className="leading-relaxed">
                  &quot;Rayan recited Verses 1 through 5 with great clarity and attentiveness today. For home practice, please have him practice the first 5 verses twice using the synchronized Mushaf AI coach before Maghrib.&quot;
                </p>
              </div>

            </div>

          </div>
        )}

        {/* 2. STUDENT & KIDS MODE VIEW (FR-ENG-01, IR-UI-04) */}
        {activePortal === 'STUDENT' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="p-8 sm:p-10 rounded-3xl bg-[#143D33] text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden border border-[#1E5648]">
              <div 
                className="absolute inset-0 opacity-[0.035] pointer-events-none"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-rule='evenodd'%3E%3Cpath d='M30 30L15 15H0v30h15l15-15zm0 0l15 15h15V15H45L30 30z'/%3E%3C/g%3E%3C/svg%3E")`
                }}
              />

              <div className="space-y-2.5 text-center md:text-left relative z-10">
                <span className="bg-[#C5A880] text-[#143D33] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-block">
                  Kids Mode Active (48px Touch Targets)
                </span>
                <h2 className="text-3xl sm:text-4xl font-serif font-normal text-[#FAF8F5]">
                  As-salamu Alaykum, Rayan!
                </h2>
                <p className="text-[#C4D5D0] text-xs sm:text-sm font-light">
                  Masha&apos;Allah! You have maintained a 5-day continuous practice streak.
                </p>
              </div>

              <div className="relative z-10">
                <Link
                  href="/book-trial"
                  className="px-7 py-4 rounded-2xl bg-[#C5A880] hover:bg-[#D4BC98] text-[#143D33] font-bold text-sm shadow-xs transition-colors flex items-center gap-2"
                >
                  <BookOpen className="w-5 h-5 text-[#143D33]" />
                  <span>Start AI Recitation Coach</span>
                </Link>
              </div>
            </div>

            {/* Badges & Progression Journey */}
            <div className="bg-[#FCFBF9] p-6 sm:p-8 rounded-2xl border border-[#E3DACD] space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E3DACD]">
                <h3 className="text-base font-serif font-bold text-[#1A221E] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#9E7D53]" />
                  <span>Earned Quranic Badges &amp; Milestone Stars</span>
                </h3>
                <span className="text-xs text-[#5A6862]">Level 2 Progress: 68% Complete</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E3DACD] space-y-1.5">
                  <div className="text-3xl">🏆</div>
                  <div className="text-xs font-serif font-bold text-[#143D33]">Qaida Graduate</div>
                  <div className="text-[10px] text-[#5A6862]">Completed 30 lessons</div>
                </div>

                <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E3DACD] space-y-1.5">
                  <div className="text-3xl">🔥</div>
                  <div className="text-xs font-serif font-bold text-[#143D33]">7-Day Streak</div>
                  <div className="text-[10px] text-[#5A6862]">Practiced daily</div>
                </div>

                <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E3DACD] space-y-1.5">
                  <div className="text-3xl">🎙️</div>
                  <div className="text-xs font-serif font-bold text-[#143D33]">Tajweed Star</div>
                  <div className="text-[10px] text-[#5A6862]">Mastered Qalqalah</div>
                </div>

                <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E3DACD] opacity-60 space-y-1.5">
                  <div className="text-3xl">⭐</div>
                  <div className="text-xs font-serif font-bold text-[#5A6862]">Juz 30 Hafiz</div>
                  <div className="text-[10px] text-[#8D9B94]">Next milestone badge</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. TEACHER WORKSPACE VIEW (FR-TCH-03, FR-TCH-04) */}
        {activePortal === 'TEACHER' && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="p-6 sm:p-8 rounded-2xl bg-[#143D33] text-white flex flex-col sm:flex-row items-center justify-between gap-4 border border-[#1E5648]">
              <div>
                <span className="text-[10px] font-bold uppercase bg-[#C5A880] text-[#143D33] px-2.5 py-0.5 rounded">
                  Faculty Timetable • Synchronized PKT
                </span>
                <h3 className="text-xl sm:text-2xl font-serif font-normal text-[#FAF8F5] mt-1.5">
                  Ustadh Timetable: Today&apos;s 4 Classes
                </h3>
              </div>
              <div className="text-xs text-[#E8DCC4] font-mono bg-[#18483C] px-3 py-1.5 rounded-lg border border-[#256353]">
                Period Accrual: $420.00 (Ready for bi-weekly payout)
              </div>
            </div>

            {/* Pre-Class Brief Card */}
            <div className="p-6 sm:p-8 bg-[#FCFBF9] rounded-2xl border border-[#E3DACD] space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E3DACD]">
                <span className="text-xs font-serif font-bold text-[#143D33] uppercase tracking-wider">
                  Pre-Class Brief: Next Student in 8 Minutes
                </span>
                <span className="text-xs font-mono text-[#5A6862]">Class #CLS-901</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD]">
                  <span className="text-[#8D9B94] font-bold block mb-1">Student &amp; Course:</span>
                  <span className="font-serif font-bold text-[#1A221E] text-sm block">Sarah Qureshi (Age 13)</span>
                  <div className="text-[11px] text-[#143D33] mt-0.5">Hifz Program • Juz 12</div>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E3DACD]">
                  <span className="text-[#8D9B94] font-bold block mb-1">Today&apos;s Sabaq Target:</span>
                  <span className="font-serif font-bold text-[#1A221E] text-sm block">Surah Yusuf: Verses 36–42</span>
                  <div className="text-[11px] text-[#5A6862] mt-0.5">Page 239 in Madani Mushaf</div>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#C5A880]/60">
                  <span className="text-[#9E7D53] font-bold block mb-1">Recurring Mistake Hotspot:</span>
                  <span className="font-medium text-[#1A221E] block">Ghunnah on Noon Mushaddadah</span>
                  <div className="text-[10px] text-[#9E7D53] mt-0.5">Flagged in last 2 sessions</div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Link
                  href="/book-trial"
                  className="px-6 py-3 rounded-xl bg-[#143D33] hover:bg-[#1C5245] text-white font-semibold text-xs shadow-xs transition-colors"
                >
                  Launch Class #CLS-901 in Synchronized Classroom
                </Link>
              </div>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
}

export default function PortalPreviewPage() {
  return (
    <ProtectedRoute>
      <PortalPreviewContent />
    </ProtectedRoute>
  );
}


