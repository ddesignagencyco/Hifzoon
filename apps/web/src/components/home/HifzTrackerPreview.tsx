'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  Award, 
  CheckCircle2, 
  ArrowRight,
  BookOpen,
  Calendar,
  Layers
} from 'lucide-react';
import { PageState } from '@/lib/types';

export const HifzTrackerPreview: React.FC = () => {
  const [selectedPage, setSelectedPage] = useState<number>(582);

  const samplePages = Array.from({ length: 23 }, (_, i) => {
    const pageNum = 582 + i;
    let state: PageState = PageState.SOLID;
    let mistakes = 0;
    let surah = 'An-Naba';

    if (pageNum >= 582 && pageNum <= 590) {
      state = PageState.SOLID;
      mistakes = 0;
      surah = pageNum <= 585 ? 'Surah An-Naba' : 'Surah An-Nazi\'at';
    } else if (pageNum >= 591 && pageNum <= 596) {
      state = PageState.SOLID;
      mistakes = 1;
      surah = 'Surah Abasa / At-Takwir';
    } else if (pageNum >= 597 && pageNum <= 600) {
      state = PageState.FRAGILE;
      mistakes = 3;
      surah = 'Surah Al-Buruj / At-Tariq';
    } else {
      state = PageState.IN_PROGRESS;
      mistakes = 2;
      surah = 'Surah Al-A\'la to An-Nas';
    }

    return {
      number: pageNum,
      state,
      mistakes,
      surah,
      nextReview: state === PageState.FRAGILE ? 'Tomorrow' : 'Scheduled in 6 days'
    };
  });

  const activePage = samplePages.find((p) => p.number === selectedPage) || samplePages[0];

  return (
    <section className="py-20 bg-[#FAF8F5] border-b border-[#E7E1D7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Editorial Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-14 space-y-3">
          <span className="text-[10px] tracking-widest uppercase font-bold text-[#886840] font-sans">
            Memorization &amp; Retention Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl font-normal text-[#1A221E] font-serif">
            Page-by-Page Accountability Across All 604 Pages
          </h2>
          <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
            The traditional Hifz method balances three daily streams: <em>Sabaq</em> (new lesson), <em>Sabqi</em> (recent consolidation), and <em>Manzil</em> (long-term revision). Our engine schedules each page so no Surah is neglected.
          </p>
        </div>

        {/* 2-Column Academic Presentation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left: 604-Page Visual Heatmap Ledger (7 Cols) */}
          <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-sm border border-[#DCD5C9] shadow-xs space-y-5">
            
            <div className="flex flex-wrap items-center justify-between pb-4 border-b border-[#E7E1D7] gap-3 text-xs">
              <div>
                <span className="text-[#6B7670] block text-[10px] uppercase font-bold tracking-wider">Student Portfolio</span>
                <span className="font-serif text-base text-[#1A221E] font-medium">Hamza Farooq • Juz 30 (Amma)</span>
              </div>
              <span className="text-[11px] font-mono text-[#143D33] bg-[#EDF4F1] px-2.5 py-1 rounded-xs border border-[#C5D8D0]">
                23 of 604 Pages Sample
              </span>
            </div>

            {/* Legend Bar */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#424D48] pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#143D33]" />
                <span className="text-[11px]">Solid (0–1 mistakes)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#B45309]" />
                <span className="text-[11px]">Fragile (Requires review)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#386657]" />
                <span className="text-[11px]">Current Sabaq</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#EDE7DF] border border-[#DCD5C9]" />
                <span className="text-[11px]">Unassigned</span>
              </span>
            </div>

            {/* Heatmap Grid */}
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 pt-2">
              {samplePages.map((p) => {
                let colorClasses = 'bg-[#EDE7DF] text-[#6B7670]';
                if (p.state === PageState.SOLID) colorClasses = 'bg-[#143D33] text-white hover:bg-[#0E2B24]';
                if (p.state === PageState.FRAGILE) colorClasses = 'bg-[#B45309] text-white hover:bg-[#92400E]';
                if (p.state === PageState.IN_PROGRESS) colorClasses = 'bg-[#386657] text-white hover:bg-[#204E40]';

                const isSelected = selectedPage === p.number;

                return (
                  <button
                    key={p.number}
                    type="button"
                    onClick={() => setSelectedPage(p.number)}
                    className={`py-2 px-1 text-center rounded-xs text-[11px] font-sans font-medium transition-all ${colorClasses} ${
                      isSelected ? 'ring-2 ring-[#9E7D53] ring-offset-1 font-bold' : ''
                    }`}
                  >
                    p.{p.number}
                  </button>
                );
              })}
            </div>

            {/* Page Inspector Detail */}
            <div className="p-4 rounded-xs bg-[#FAF8F5] border border-[#E7E1D7] flex flex-wrap items-center justify-between gap-4 text-xs">
              <div>
                <span className="text-[10px] text-[#6B7670] block uppercase font-bold">Selected Record:</span>
                <span className="font-serif text-sm font-medium text-[#1A221E]">
                  Page {activePage.number} — {activePage.surah}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-[#6B7670] block uppercase font-bold">Retention Quality:</span>
                <span className={`font-semibold ${
                  activePage.state === PageState.SOLID ? 'text-[#143D33]' : 'text-[#B45309]'
                }`}>
                  {activePage.state} ({activePage.mistakes} hesitation flags)
                </span>
              </div>

              <div>
                <span className="text-[10px] text-[#6B7670] block uppercase font-bold">Next Spaced Review:</span>
                <span className="font-semibold text-[#1A221E]">{activePage.nextReview}</span>
              </div>
            </div>

          </div>

          {/* Right: Monthly Parent Report Card Preview (5 Cols) */}
          <div className="lg:col-span-5 bg-white p-6 sm:p-8 rounded-sm border border-[#DCD5C9] shadow-xs space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-[#E7E1D7]">
              <div>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#886840]">
                  Academic Accountability
                </span>
                <h3 className="font-serif text-lg text-[#1A221E] mt-0.5">
                  Monthly 5-Rating Report Card
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#6B7670] bg-[#FAF8F5] px-2 py-0.5 border border-[#E7E1D7]">
                SRS FR-PAR-04
              </span>
            </div>

            {/* 5 Assessment Dimensions */}
            <div className="space-y-3.5 text-xs">
              <div>
                <div className="flex justify-between text-[#1A221E] font-medium mb-1">
                  <span>1. Fluency &amp; Reading Pace</span>
                  <span className="font-bold text-[#143D33]">4.8 / 5.0</span>
                </div>
                <div className="w-full bg-[#EDE7DF] h-1.5 rounded-xs overflow-hidden">
                  <div className="bg-[#143D33] h-full" style={{ width: '96%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A221E] font-medium mb-1">
                  <span>2. Tajweed Articulation (Makharij)</span>
                  <span className="font-bold text-[#143D33]">4.7 / 5.0</span>
                </div>
                <div className="w-full bg-[#EDE7DF] h-1.5 rounded-xs overflow-hidden">
                  <div className="bg-[#143D33] h-full" style={{ width: '94%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A221E] font-medium mb-1">
                  <span>3. Memorization Strength (Manzil)</span>
                  <span className="font-bold text-[#143D33]">4.9 / 5.0</span>
                </div>
                <div className="w-full bg-[#EDE7DF] h-1.5 rounded-xs overflow-hidden">
                  <div className="bg-[#143D33] h-full" style={{ width: '98%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A221E] font-medium mb-1">
                  <span>4. Classroom Focus &amp; Adab</span>
                  <span className="font-bold text-[#143D33]">5.0 / 5.0</span>
                </div>
                <div className="w-full bg-[#EDE7DF] h-1.5 rounded-xs overflow-hidden">
                  <div className="bg-[#143D33] h-full" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#1A221E] font-medium mb-1">
                  <span>5. Home Revision Consistency</span>
                  <span className="font-bold text-[#B45309]">4.2 / 5.0</span>
                </div>
                <div className="w-full bg-[#EDE7DF] h-1.5 rounded-xs overflow-hidden">
                  <div className="bg-[#B45309] h-full" style={{ width: '84%' }} />
                </div>
              </div>
            </div>

            {/* Teacher Written Note */}
            <div className="p-3.5 bg-[#FAF8F5] border border-[#E7E1D7] text-xs text-[#424D48] space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A5E35] block">
                Lead Teacher Evaluation:
              </span>
              <p className="italic leading-relaxed">
                &quot;Hamza demonstrated steady progress this month in Surah An-Nazi&apos;at. He has refined his Qalqalah release. Please ensure 10 minutes of morning review before school to anchor verses 20 to 35.&quot;
              </p>
            </div>

            <div className="pt-2">
              <Link
                href="/book-trial?course=HIFZ"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xs text-xs font-semibold text-white bg-[#143D33] hover:bg-[#0E2B24] transition-colors"
              >
                <span>Enroll in Hifz Program with Evaluation</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
