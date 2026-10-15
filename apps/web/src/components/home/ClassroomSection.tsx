'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Tag, Smartphone, Check, ArrowRight } from 'lucide-react';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { IconTile } from '@/components/landing/IconTile';
import { Button } from '@/components/landing/Button';

export const ClassroomSection: React.FC = () => {
  const [activeScript, setActiveScript] = useState<'madani' | 'indopak'>('madani');
  const [tajweedActive, setTajweedActive] = useState(true);

  return (
    <section id="classroom" className="bg-[#faf7f1] py-20 md:py-32">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-14 items-center">
          {/* Left Column: Educational Philosophy & Zoom Comparison */}
          <div className="space-y-6">
            <Eyebrow>The Hifzoon classroom</Eyebrow>

            <h2 className="font-fraunces text-[34px] md:text-[50px] font-normal leading-[1.12] text-[#10201b]">
              A virtual classroom built only for the Quran
            </h2>

            {/* 3 Core Features */}
            <div className="space-y-6 pt-2">
              <div className="flex items-start gap-4">
                <IconTile>
                  <RefreshCw />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">
                    Pages and word highlights in sync
                  </h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    The teacher guides your child&apos;s eye word by word, with under 500ms latency.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <IconTile>
                  <Tag />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">
                    Mistakes tagged in one tap
                  </h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    Every correction is saved to the lesson card, not lost in a chat.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <IconTile>
                  <Smartphone />
                </IconTile>
                <div>
                  <h3 className="font-semibold text-[17px] text-[#10201b]">
                    Parents see every lesson
                  </h3>
                  <p className="mt-1 text-[14.5px] text-[#6b7772] leading-relaxed">
                    Notes, audio and attendance land in the parent portal after class.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dark "App" Mockup */}
          <div className="bg-[#0a1f19] rounded-[24px] md:rounded-[28px] p-4 md:p-5 shadow-large border border-white/10 text-white">
            {/* Title Bar */}
            <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-white/10 flex-wrap gap-2">
              {/* Window dots */}
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#e16d56]" />
                <span className="w-3 h-3 rounded-full bg-[#f4be4f]" />
                <span className="w-3 h-3 rounded-full bg-[#62c554]" />
              </div>

              {/* Toolbar controls (desktop only) */}
              <div className="hidden sm:flex items-center gap-3">
                {/* Segmented Control */}
                <div className="bg-white/10 p-0.5 rounded-full inline-flex text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveScript('madani')}
                    className={`px-3 py-1 rounded-full font-medium transition-colors ${
                      activeScript === 'madani'
                        ? 'bg-white/20 text-white shadow-xs'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Madani 15-line
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveScript('indopak')}
                    className={`px-3 py-1 rounded-full font-medium transition-colors ${
                      activeScript === 'indopak'
                        ? 'bg-white/20 text-white shadow-xs'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    IndoPak 16-line
                  </button>
                </div>

                {/* Tajweed Overlay Tag */}
                <button
                  type="button"
                  onClick={() => setTajweedActive(!tajweedActive)}
                  className={`border rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                    tajweedActive
                      ? 'border-[#c49a55] text-[#c49a55] bg-[#c49a55]/10'
                      : 'border-white/20 text-white/50'
                  }`}
                >
                  Tajweed overlay {tajweedActive ? 'on' : 'off'}
                </button>
              </div>

              {/* Red Live Timer */}
              <div className="flex items-center gap-1.5 text-xs font-mono text-red-400 bg-red-950/40 px-2.5 py-0.5 rounded-full border border-red-800/30">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>Live · 00:18:42</span>
              </div>
            </div>

            {/* Body: Cream Mushaf Area + Dark Side Panel */}
            <div className="flex flex-col md:flex-row gap-4">
              {/* Mushaf Area */}
              <div className="flex-1 bg-[#faf7f1] rounded-[18px] p-5 text-[#10201b] flex flex-col justify-between shadow-inner min-h-[380px]">
                {/* Surah Header Card with ornate styling */}
                <div className="border border-[#c49a55]/50 rounded-xl py-2 px-4 text-center bg-[#fbf5ea] shadow-xs relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c49a55] to-transparent" />
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#a97f3c]">
                    SURAH AL-IKHLAS · سُورَةُ الإِخْلَاصِ
                  </div>
                </div>

                {/* Real Authentic Arabic Mushaf Calligraphy */}
                <div className="my-auto py-5 px-3 space-y-4 text-center select-none" dir="rtl">
                  {/* Bismillah with decorative calligraphy */}
                  <div className="text-[#a97f3c] text-base md:text-lg font-serif tracking-wider py-1 border-b border-[#e6dfd1]/70 max-w-[280px] mx-auto">
                    بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                  </div>

                  {/* Verses */}
                  <div className="text-[20px] sm:text-[23px] md:text-[25px] font-serif leading-[2.3] text-[#142821] tracking-wide text-center">
                    {/* Verse 1 */}
                    <span className="inline-block mx-1">
                      قُلْ هُوَ اللَّهُ{' '}
                      <span className={tajweedActive ? 'text-[#b91c1c] font-semibold' : ''}>أَحَدٌ</span>
                    </span>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-[#c49a55] text-[11px] font-sans text-[#a97f3c] mx-1 bg-[#f6ecd9]/80 align-middle">
                      ١
                    </span>

                    {/* Verse 2 with Active Teacher Pointer highlight */}
                    <span className="inline-block mx-1 relative">
                      اللَّهُ{' '}
                      <span className="relative inline-block bg-[#c49a55]/25 px-2 py-0.5 rounded-lg ring-1 ring-[#c49a55] text-[#10201b] font-semibold">
                        <span className={tajweedActive ? 'text-[#b91c1c]' : ''}>الصَّمَدُ</span>
                        {/* Live Pointer Tooltip */}
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#0a1f19] text-[#c49a55] text-[9.5px] font-sans font-medium px-2 py-0.5 rounded-full whitespace-nowrap shadow-md border border-[#c49a55]/40 flex items-center gap-1 z-10 pointer-events-none" dir="ltr">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          <span>Ustadh M. Hamza</span>
                        </span>
                      </span>
                    </span>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-[#c49a55] text-[11px] font-sans text-[#a97f3c] mx-1 bg-[#f6ecd9]/80 align-middle">
                      ٢
                    </span>

                    {/* Verse 3 */}
                    <span className="inline-block mx-1">
                      <span className={tajweedActive ? 'text-[#b91c1c]' : ''}>لَمْ يَلِدْ</span>{' '}
                      وَلَمْ{' '}
                      <span className={tajweedActive ? 'text-[#b91c1c]' : ''}>يُولَدْ</span>
                    </span>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-[#c49a55] text-[11px] font-sans text-[#a97f3c] mx-1 bg-[#f6ecd9]/80 align-middle">
                      ٣
                    </span>

                    {/* Verse 4 */}
                    <span className="inline-block mx-1">
                      وَلَمْ يَكُن{' '}
                      <span className={tajweedActive ? 'text-[#6d28d9] font-medium' : ''}>لَّهُۥ</span>{' '}
                      كُفُوًا{' '}
                      <span className={tajweedActive ? 'text-[#b91c1c] font-semibold' : ''}>أَحَدٌۢ</span>
                    </span>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-[#c49a55] text-[11px] font-sans text-[#a97f3c] mx-1 bg-[#f6ecd9]/80 align-middle">
                      ٤
                    </span>
                  </div>
                </div>

                {/* Bottom Tajweed Legend & Mandatory Licensed Font Notice */}
                <div className="pt-3 border-t border-[#e6dfd1] text-center space-y-2">
                  <div className="flex items-center justify-center gap-3 text-[11px] text-[#3c4a45] flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#b91c1c]" /> Qalqalah
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#b45309]" /> Ghunnah
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#15803d]" /> Idgham
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#6d28d9]" /> Ikhfa
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#92400e]" /> Madd
                    </span>
                  </div>
                  <div className="text-[11px] text-[#6b7772] italic">
                    Quran text renders here in the licensed Mushaf font only
                  </div>
                </div>
              </div>

              {/* Dark Side Panel (260px wide, hidden on mobile) */}
              <div className="hidden md:flex w-[260px] flex-col gap-3 text-xs">
                {/* Lesson card */}
                <div className="bg-white/5 rounded-[14px] p-3 border border-white/10 space-y-1">
                  <div className="flex justify-between items-center text-[11px] text-white/60">
                    <span>Lesson card</span>
                    <span className="text-[#c49a55] font-semibold">Grade: Excellent</span>
                  </div>
                  <div className="font-semibold text-white text-sm">Ustadh M. Hamza</div>
                </div>

                {/* Sabaq box */}
                <div className="bg-white/5 rounded-[14px] p-3 border border-white/10 space-y-1">
                  <div className="text-[10.5px] uppercase tracking-wider text-white/50">
                    Sabaq (current reading)
                  </div>
                  <div className="font-medium text-white text-[13px]">
                    Al-Ikhlas · verses 1–4
                  </div>
                </div>

                {/* Logged corrections box */}
                <div className="bg-white/5 rounded-[14px] p-3 border border-white/10 space-y-1">
                  <div className="flex justify-between items-center text-[10.5px] text-white/50">
                    <span>Logged corrections (1)</span>
                    <span className="text-[#b4482d] font-bold">1 tag</span>
                  </div>
                  <div className="text-white/90 text-xs">
                    Vowel · Harakah <span className="text-white/40">(v.2)</span>
                  </div>
                </div>

                {/* Connection status */}
                <div className="bg-white/5 rounded-[14px] p-3 border border-white/10 space-y-1">
                  <div className="text-[10.5px] uppercase tracking-wider text-white/50">
                    Connection
                  </div>
                  <div className="flex items-center gap-1.5 text-[#2a6553] font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-emerald-300">Stable · page sync on</span>
                  </div>
                </div>

                {/* CTA */}
                <div className="pt-2">
                  <Link
                    href="/book-trial"
                    className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-full bg-[#c49a55] text-[#0a1f19] font-bold text-xs hover:bg-[#b58c49] transition-all shadow-sm active:scale-95"
                  >
                    Try it in a free trial
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
