'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { Button } from '@/components/landing/Button';

export const HifzTrackerSection: React.FC = () => {
  const [selectedPage, setSelectedPage] = useState<number>(582);

  // 23 pages of Juz 30 (pages 582 to 604)
  const pages = [
    { num: 582, status: 'solid', surah: 'An-Naba', flags: 0, nextReview: 'In 6 days' },
    { num: 583, status: 'solid', surah: 'An-Naba', flags: 0, nextReview: 'In 5 days' },
    { num: 584, status: 'solid', surah: 'An-Naba', flags: 1, nextReview: 'In 4 days' },
    { num: 585, status: 'solid', surah: 'An-Nazi’at', flags: 0, nextReview: 'In 6 days' },
    { num: 586, status: 'solid', surah: 'An-Nazi’at', flags: 0, nextReview: 'In 5 days' },
    { num: 587, status: 'solid', surah: '‘Abasa', flags: 0, nextReview: 'In 4 days' },
    { num: 588, status: 'solid', surah: '‘Abasa', flags: 1, nextReview: 'In 3 days' },
    { num: 589, status: 'fragile', surah: 'At-Takwir', flags: 3, nextReview: 'Tomorrow' },
    { num: 590, status: 'solid', surah: 'Al-Infitar', flags: 0, nextReview: 'In 7 days' },
    { num: 591, status: 'solid', surah: 'Al-Mutaffifin', flags: 0, nextReview: 'In 6 days' },
    { num: 592, status: 'solid', surah: 'Al-Inshiqaq', flags: 0, nextReview: 'In 5 days' },
    { num: 593, status: 'solid', surah: 'Al-Buruj', flags: 1, nextReview: 'In 4 days' },
    { num: 594, status: 'solid', surah: 'At-Tariq', flags: 0, nextReview: 'In 6 days' },
    { num: 595, status: 'solid', surah: 'Al-A’la', flags: 0, nextReview: 'In 5 days' },
    { num: 596, status: 'solid', surah: 'Al-Ghashiyah', flags: 0, nextReview: 'In 4 days' },
    { num: 597, status: 'current', surah: 'Al-Fajr', flags: 0, nextReview: 'Today’s Sabaq' },
    { num: 598, status: 'unassigned', surah: 'Al-Balad', flags: 0, nextReview: 'Scheduled' },
    { num: 599, status: 'unassigned', surah: 'Ash-Shams', flags: 0, nextReview: 'Scheduled' },
    { num: 600, status: 'unassigned', surah: 'Al-Layl', flags: 0, nextReview: 'Scheduled' },
    { num: 601, status: 'unassigned', surah: 'Ad-Duha', flags: 0, nextReview: 'Scheduled' },
    { num: 602, status: 'unassigned', surah: 'Ash-Sharh', flags: 0, nextReview: 'Scheduled' },
    { num: 603, status: 'unassigned', surah: 'At-Tin', flags: 0, nextReview: 'Scheduled' },
    { num: 604, status: 'unassigned', surah: 'Al-’Alaq', flags: 0, nextReview: 'Scheduled' },
  ];

  const selectedRecord = pages.find((p) => p.num === selectedPage) || pages[0];

  return (
    <section className="relative bg-[#0a1f19] text-white py-20 md:py-32 overflow-hidden">
      {/* Background Star Pattern */}
      <div
        className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative site-container">
        {/* Centered Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Eyebrow centered dark>
            Memorization &amp; Retention
          </Eyebrow>
          <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-white mt-3 break-normal">
            Page-by-page accountability across all 604 pages
          </h2>
          <p className="mt-4 text-[16.5px] md:text-[18.5px] text-[#c4d3cd] leading-relaxed">
            Our engine schedules every page across the three daily streams of traditional Hifz, so no Surah is neglected.
          </p>

          {/* Three Stream Chips with Gold Number Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            <div className="bg-white/10 border border-white/15 rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-white">
              <span className="w-5 h-5 rounded-full bg-[#c49a55] text-[#0a1f19] font-bold flex items-center justify-center text-[11px]">
                1
              </span>
              <span className="font-semibold text-[#c49a55]">Sabaq</span>
              <span className="text-white/60">New lesson</span>
            </div>

            <div className="bg-white/10 border border-white/15 rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-white">
              <span className="w-5 h-5 rounded-full bg-[#c49a55] text-[#0a1f19] font-bold flex items-center justify-center text-[11px]">
                2
              </span>
              <span className="font-semibold text-[#c49a55]">Sabqi</span>
              <span className="text-white/60">Recent consolidation</span>
            </div>

            <div className="bg-white/10 border border-white/15 rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-white">
              <span className="w-5 h-5 rounded-full bg-[#c49a55] text-[#0a1f19] font-bold flex items-center justify-center text-[11px]">
                3
              </span>
              <span className="font-semibold text-[#c49a55]">Manzil</span>
              <span className="text-white/60">Long-term revision</span>
            </div>
          </div>
        </div>

        {/* Two White Panels: 1.25fr / 1fr */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-6 text-[#10201b]">
          {/* Panel 1: Heatmap Panel */}
          <div className="bg-white rounded-[28px] p-6 md:p-8 shadow-large border border-[#e6dfd1] flex flex-col justify-between">
            <div>
              {/* Top Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#f3eee4]">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b7772]">
                    STUDENT PORTFOLIO
                  </div>
                  <div className="font-semibold text-[#10201b] text-base">
                    Hamza F. · Juz 30 (Amma)
                  </div>
                </div>
                <div className="text-xs font-semibold px-3 py-1 rounded-full bg-[#f0f6f3] text-[#1c4c3e]">
                  23 of 604 pages
                </div>
              </div>

              {/* Grid of 23 Page Cells: 8 columns, 40px tall with 9px radius */}
              <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 my-4">
                {pages.map((p) => {
                  const isSelected = selectedPage === p.num;

                  let cellColor = 'bg-[#f3eee4] text-[#6b7772]'; // unassigned
                  if (p.status === 'solid') cellColor = 'bg-[#143a2f] text-white';
                  if (p.status === 'fragile') cellColor = 'bg-[#c8761d] text-white';
                  if (p.status === 'current') cellColor = 'bg-[#2a6553] text-white';

                  return (
                    <button
                      key={p.num}
                      type="button"
                      onClick={() => setSelectedPage(p.num)}
                      className={`h-[40px] rounded-[9px] text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${cellColor} ${
                        isSelected ? 'ring-2 ring-[#c49a55] ring-offset-2 scale-105 shadow-md' : 'hover:opacity-90'
                      }`}
                    >
                      {p.num}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#6b7772] pt-3 pb-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[3px] bg-[#143a2f]" /> Solid (0–1 mistakes)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[3px] bg-[#c8761d]" /> Fragile, needs review
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[3px] bg-[#2a6553]" /> Current Sabaq
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-[3px] bg-[#f3eee4]" /> Unassigned
                </span>
              </div>

              {/* Juz 30 Progress Bar */}
              <div className="pt-2">
                <div className="flex justify-between text-xs text-[#3c4a45] font-medium mb-1.5">
                  <span>Juz 30 progress</span>
                  <span className="font-semibold text-[#143a2f]">20 of 23 pages solid</span>
                </div>
                <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1c4c3e] rounded-full transition-all duration-500"
                    style={{ width: `${(20 / 23) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Selected Record Row */}
            <div className="mt-6 pt-4 border-t border-[#f3eee4] grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">
                  SELECTED
                </span>
                <span className="font-semibold text-[#10201b]">
                  Page {selectedRecord.num} · {selectedRecord.surah}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">
                  RETENTION
                </span>
                <span className={`font-semibold ${
                  selectedRecord.status === 'fragile' ? 'text-[#c8761d]' : 'text-[#143a2f]'
                }`}>
                  {selectedRecord.status === 'fragile' ? 'Fragile · 3 flags' : 'Solid · 0 flags'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6b7772] block">
                  NEXT REVIEW
                </span>
                <span className="font-semibold text-[#10201b]">
                  {selectedRecord.nextReview}
                </span>
              </div>
            </div>
          </div>

          {/* Panel 2: Academic Accountability (Report Card) */}
          <div className="bg-white rounded-[28px] p-6 md:p-8 shadow-large border border-[#e6dfd1] flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#f3eee4]">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b7772]">
                    ACADEMIC ACCOUNTABILITY
                  </div>
                  <h3 className="font-fraunces text-xl font-medium text-[#10201b]">
                    Monthly report card
                  </h3>
                </div>
                <div className="text-xs font-semibold px-3 py-1 rounded-full bg-[#f6ecd9] text-[#a97f3c]">
                  September
                </div>
              </div>

              {/* 5 Scored Bars */}
              <div className="space-y-3.5 pt-1">
                <div>
                  <div className="flex justify-between text-xs text-[#3c4a45] mb-1">
                    <span>Fluency &amp; reading pace</span>
                    <span className="font-bold">4.8</span>
                  </div>
                  <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1c4c3e] rounded-full" style={{ width: '96%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[#3c4a45] mb-1">
                    <span>Tajweed articulation (Makharij)</span>
                    <span className="font-bold">4.7</span>
                  </div>
                  <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1c4c3e] rounded-full" style={{ width: '94%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[#3c4a45] mb-1">
                    <span>Memorization strength (Manzil)</span>
                    <span className="font-bold">4.9</span>
                  </div>
                  <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1c4c3e] rounded-full" style={{ width: '98%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[#3c4a45] mb-1">
                    <span>Classroom focus &amp; Adab</span>
                    <span className="font-bold">5.0</span>
                  </div>
                  <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1c4c3e] rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Low score in amber */}
                <div>
                  <div className="flex justify-between text-xs text-[#3c4a45] mb-1">
                    <span>Home revision consistency</span>
                    <span className="font-bold text-[#c8761d]">4.2</span>
                  </div>
                  <div className="w-full h-2 bg-[#f0f6f3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#c8761d] rounded-full" style={{ width: '84%' }} />
                  </div>
                </div>
              </div>

              {/* Gold-100 Teacher Note in Italic Fraunces */}
              <div className="mt-6 p-4 rounded-[18px] bg-[#f6ecd9] border border-[#e6dfd1] text-[14px] text-[#10201b] font-fraunces italic leading-relaxed">
                &ldquo;Hamza refined his Qalqalah this month. Ten minutes of morning review before school will anchor verses 20 to 35.&rdquo;
              </div>
            </div>
          </div>
        </div>

        {/* Gold CTA Below */}
        <div className="mt-10 text-center">
          <Button
            variant="gold"
            size="default"
            href="/book-trial?course=HIFZ"
          >
            Enroll in Hifz with an evaluation
          </Button>
        </div>
      </div>
    </section>
  );
};
