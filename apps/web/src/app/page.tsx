'use client';

import React from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { HighlightsStrip } from '@/components/home/HighlightsStrip';
import { ClassroomLiveSection } from '@/components/home/ClassroomLiveSection';
import { CurriculumSection } from '@/components/home/CurriculumSection';
import { FacultySection } from '@/components/home/FacultySection';
import { HifzTrackerSection } from '@/components/home/HifzTrackerSection';
import { PricingSection } from '@/components/home/PricingSection';
import { FAQSection } from '@/components/home/FAQSection';
import { FinalCTASection } from '@/components/home/FinalCTASection';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/25 selection:text-[#0a1f19]">
      {/* 1 & 2. Top Bar & Navigation */}
      <Header />

      <main className="flex-1">
        {/* 3. Hero Section (green-900, Fraunces H1 with gold italics, arch with 3 floating cards) */}
        <HeroSection />

        {/* 4. Highlights Strip (Overlapping card with 4 columns desktop / 2x2 mobile) */}
        <HighlightsStrip />

        {/* 5. Classroom (The Hifzoon classroom, synchronized Mushaf preview + dark app mockup) */}
        <ClassroomLiveSection />

        {/* 6. Curriculum (Structured academic pathways, 2-col Qaida card, standard cards, gold-100 assessment card) */}
        <CurriculumSection />

        {/* 7. Faculty (Vetted scholars, patient educators, 4 cards with verified Ijazah and recitation triggers) */}
        <FacultySection />

        {/* 8. Hifz Tracker (green-950, 604-page heatmap panel + monthly report card panel) */}
        <HifzTrackerSection />

        {/* 9. Pricing (Simple monthly plans in USD, guarantees) */}
        <PricingSection />


        {/* 11. FAQ (Answers for prospective families, 6 questions with +/− round indicator) */}
        <FAQSection />

        {/* 12. Final CTA (green-800 rounded-36px band, 3 numbered step rows) */}
        <FinalCTASection />
      </main>

      {/* 13. Footer (green-950, 3 trust badges, 4 columns, copyright & WCAG line) */}
      <Footer />
    </div>
  );
}
