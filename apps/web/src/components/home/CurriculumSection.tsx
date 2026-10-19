'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, Target, ArrowRight } from 'lucide-react';
import { useCourses } from '@/hooks';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

export const CurriculumSection: React.FC = () => {
  const { courses } = useCourses();
  const [activeTab, setActiveTab] = useState<string>('all');

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'foundation', label: 'Foundation' },
    { id: 'recitation', label: 'Recitation' },
    { id: 'memorization', label: 'Memorization' },
    { id: 'certification', label: 'Certification' },
  ];

  // Helper to map category
  const matchesCategory = (category: string | undefined, tab: string) => {
    if (tab === 'all') return true;
    return (category || '').toLowerCase() === tab.toLowerCase();
  };

  const qaidaCourse = courses.find((c) => c.code === 'QAIDA' || c.id === 'crs-1') || courses[0];
  const tajweedCourse = courses.find((c) => c.code === 'TAJWEED' || c.id === 'crs-3') || courses[1] || courses[0];
  const nazraCourse = courses.find((c) => c.code === 'NAZRA' || c.id === 'crs-2') || courses[2] || courses[0];
  const hifzCourse = courses.find((c) => c.code === 'HIFZ' || c.id === 'crs-4') || courses[3] || courses[0];
  const murajaahCourse = courses.find((c) => c.code === 'MURAJAAH' || c.id === 'crs-5') || courses[4] || courses[0];
  const ijazahCourse = courses.find((c) => c.code === 'IJAZAH' || c.id === 'crs-6') || courses[5] || courses[0];

  if (!qaidaCourse) return null;

  return (
    <section id="programs" className="bg-[#f3eee4] py-20 md:py-32">
      <div className="site-container">
        {/* Header with PillTabs on the right */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="mb-3">
              <Eyebrow>Structured academic pathways</Eyebrow>
            </div>
            <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] break-normal">
              A clear path from first letter to Ijazah
            </h2>
            <p className="mt-3 text-[16.5px] md:text-[18.5px] text-[#3c4a45] leading-relaxed">
              Every course has defined levels, objective grading rubrics and independent oral milestone exams.
            </p>
          </div>

          <div className="shrink-0">
            <PillTabs
              items={tabs}
              activeId={activeTab}
              onChange={setActiveTab}
            />
          </div>
        </div>

        {/* 3-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Noorani & Madani Qaida: Featured Card (Spanning 2 columns) */}
          {matchesCategory(qaidaCourse.category, activeTab) && (
            <div className="md:col-span-2 bg-[#0f2c24] text-white rounded-[28px] overflow-hidden shadow-card flex flex-col md:flex-row border border-[#143a2f]">
              {/* Photo on left half */}
              <div className="relative md:w-1/2 min-h-[260px] md:min-h-full">
                <Image
                  src="/course-qaida.jpg"
                  alt={qaidaCourse.title}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent to-[#0f2c24]/40" />
              </div>

              {/* Green-900 content on right */}
              <div className="md:w-1/2 p-7 md:p-8 flex flex-col justify-between">
                <div>
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="bg-white/10 text-[#c4d3cd] text-xs px-3 py-1 rounded-full font-medium">
                      Ages 4–9 &amp; adult beginners
                    </span>
                    <span className="bg-white/10 text-[#c4d3cd] text-xs px-3 py-1 rounded-full font-medium">
                      {qaidaCourse.durationMonths}
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[24px] md:text-[28px] font-normal text-white mb-2.5">
                    {qaidaCourse.title}
                  </h3>

                  <p className="text-[#c4d3cd] text-sm leading-relaxed mb-5">
                    {qaidaCourse.description}
                  </p>

                  {/* 3 Gold Checks */}
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2.5 text-xs text-[#c4d3cd]">
                      <Check className="w-4 h-4 text-[#c49a55] shrink-0 stroke-[2.5]" />
                      <span>Interactive letter pointer for eye tracking</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-[#c4d3cd]">
                      <Check className="w-4 h-4 text-[#c49a55] shrink-0 stroke-[2.5]" />
                      <span>Weekly audio recordings for parents</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-[#c4d3cd]">
                      <Check className="w-4 h-4 text-[#c49a55] shrink-0 stroke-[2.5]" />
                      <span>Gentle phonetics, zero pressure</span>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-white/10 flex-wrap gap-3">
                  <Button
                    variant="gold"
                    size="sm"
                    href="/book-trial?course=qaida"
                  >
                    Book Qaida evaluation
                  </Button>
                  <Link
                    href="/courses"
                    className="text-xs text-[#c4d3cd] hover:text-white font-medium underline underline-offset-4"
                  >
                    Syllabus &amp; rubric
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* 2. Applied Tajweed Rules */}
          {matchesCategory(tajweedCourse.category, activeTab) && (
            <div className="bg-white rounded-[28px] overflow-hidden shadow-card border border-[#e6dfd1] flex flex-col justify-between">
              <div>
                {/* 150px Patterned Teal Cover */}
                <div className="h-[150px] bg-[#24574f] relative overflow-hidden flex items-end justify-between p-4 text-white">
                  <div
                    className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                    Recitation
                  </span>
                </div>

                <div className="p-6">
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      4–8 months
                    </span>
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      3 levels
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                    {tajweedCourse.title}
                  </h3>
                  <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                    Noon and Meem Sakinah, Mudood, Qalqalah and Sifaat, with color-coded Tajweed overlays in class.
                  </p>

                  {/* Audience Line */}
                  <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                    For readers seeking precision and beauty
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex items-center justify-between">
                <Link
                  href="/courses"
                  className="text-xs text-[#6b7772] hover:text-[#10201b] font-medium underline underline-offset-4"
                >
                  Syllabus
                </Link>
                <Button
                  variant="green"
                  size="sm"
                  href="/book-trial?course=tajweed"
                >
                  Book trial
                </Button>
              </div>
            </div>
          )}

          {/* 3. Nazra Quran */}
          {matchesCategory(nazraCourse.category, activeTab) && (
            <div className="bg-white rounded-[28px] overflow-hidden shadow-card border border-[#e6dfd1] flex flex-col justify-between">
              <div>
                {/* 150px Patterned Green Cover */}
                <div className="h-[150px] bg-[#143a2f] relative overflow-hidden flex items-end justify-between p-4 text-white">
                  <div
                    className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                    Recitation
                  </span>
                </div>

                <div className="p-6">
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      6–12 months
                    </span>
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      4 levels
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                    {nazraCourse.title}
                  </h3>
                  <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                    From single words to fluent, rhythmic recitation of complete Surahs with correct Waqf (stopping).
                  </p>

                  {/* Audience Line */}
                  <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                    For students who know the Arabic letters
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex items-center justify-between">
                <Link
                  href="/courses"
                  className="text-xs text-[#6b7772] hover:text-[#10201b] font-medium underline underline-offset-4"
                >
                  Syllabus
                </Link>
                <Button
                  variant="green"
                  size="sm"
                  href="/book-trial?course=nazra"
                >
                  Book trial
                </Button>
              </div>
            </div>
          )}

          {/* 4. Comprehensive Hifz */}
          {matchesCategory(hifzCourse.category, activeTab) && (
            <div className="bg-white rounded-[28px] overflow-hidden shadow-card border border-[#e6dfd1] flex flex-col justify-between">
              <div>
                {/* 150px Patterned Gold Cover */}
                <div className="h-[150px] bg-[#8a6a35] relative overflow-hidden flex items-end justify-between p-4 text-white">
                  <div
                    className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                    Memorization
                  </span>
                </div>

                <div className="p-6">
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      2–3 years
                    </span>
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      30 levels
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                    {hifzCourse.title}
                  </h3>
                  <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                    Sabaq, Sabqi and Manzil balanced daily and monitored page by page across the entire 604 pages.
                  </p>

                  {/* Audience Line */}
                  <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                    For students committed to full memorization
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex items-center justify-between">
                <Link
                  href="/courses"
                  className="text-xs text-[#6b7772] hover:text-[#10201b] font-medium underline underline-offset-4"
                >
                  Syllabus
                </Link>
                <Button
                  variant="green"
                  size="sm"
                  href="/book-trial?course=hifz"
                >
                  Book trial
                </Button>
              </div>
            </div>
          )}

          {/* 5. Muraja'ah for Huffaz */}
          {matchesCategory(murajaahCourse.category, activeTab) && (
            <div className="bg-white rounded-[28px] overflow-hidden shadow-card border border-[#e6dfd1] flex flex-col justify-between">
              <div>
                {/* 150px Patterned Teal Cover */}
                <div className="h-[150px] bg-[#24574f] relative overflow-hidden flex items-end justify-between p-4 text-white">
                  <div
                    className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                    Memorization
                  </span>
                </div>

                <div className="p-6">
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      Ongoing
                    </span>
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      5 levels
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                    {murajaahCourse.title}
                  </h3>
                  <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                    A structured routine to fix fragile verses, master Mutashabihat and prepare for Taraweeh.
                  </p>

                  {/* Audience Line */}
                  <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                    For Huffaz with 5+ Ajzaa memorized
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex items-center justify-between">
                <Link
                  href="/courses"
                  className="text-xs text-[#6b7772] hover:text-[#10201b] font-medium underline underline-offset-4"
                >
                  Syllabus
                </Link>
                <Button
                  variant="green"
                  size="sm"
                  href="/book-trial?course=murajaah"
                >
                  Book trial
                </Button>
              </div>
            </div>
          )}

          {/* 6. Ijazah Track with Sanad (1 column) */}
          {matchesCategory(ijazahCourse.category, activeTab) && (
            <div className="bg-white rounded-[28px] overflow-hidden shadow-card border border-[#e6dfd1] flex flex-col justify-between">
              <div>
                {/* 150px Patterned Dark Green Cover with Star */}
                <div className="h-[150px] bg-[#0f2c24] relative overflow-hidden flex items-end justify-between p-4 text-white">
                  <div
                    className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                    aria-hidden="true"
                  />
                  <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                    Certification
                  </span>
                </div>

                <div className="p-6">
                  {/* Chips */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      12–18 months
                    </span>
                    <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                      2 levels
                    </span>
                  </div>

                  <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                    {ijazahCourse.title}
                  </h3>
                  <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                    Recite the entire Quran before a Sheikh holding Sanad in Hafs &apos;an &apos;Asim.
                  </p>

                  {/* Audience Line */}
                  <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                    For advanced students and teachers
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 pt-0 flex items-center justify-between">
                <Link
                  href="/courses"
                  className="text-xs text-[#6b7772] hover:text-[#10201b] font-medium underline underline-offset-4"
                >
                  Syllabus
                </Link>
                <Button
                  variant="green"
                  size="sm"
                  href="/book-trial?course=ijazah"
                >
                  Book trial
                </Button>
              </div>
            </div>
          )}

          {/* Gold-100 Placement Card (Spans 2 columns on desktop) */}
          <div className="md:col-span-2 bg-[#f6ecd9] rounded-[28px] p-7 md:p-8 border border-[#e6dfd1] shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-[14px] bg-[#c49a55]/20 flex items-center justify-center text-[#a97f3c] shrink-0">
                <Target className="w-6 h-6 stroke-[2]" />
              </div>
              <div>
                <h3 className="font-fraunces text-[20px] md:text-[22px] font-medium text-[#10201b]">
                  Not sure where your child should start?
                </h3>
                <p className="mt-1.5 text-[14px] text-[#3c4a45] leading-relaxed max-w-xl">
                  Book a free 30-minute session with a senior examiner. We assess Makharij accuracy and reading rhythm, then recommend a level with no obligation.
                </p>
              </div>
            </div>

            <Button
              variant="green"
              size="default"
              href="/book-trial"
              className="shrink-0 whitespace-nowrap"
            >
              Request level assessment
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
