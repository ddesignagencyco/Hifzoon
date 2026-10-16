'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Search, Target } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useCourses } from '@/hooks';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

export default function CoursesPage() {
  const { courses } = useCourses();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const tabs = [
    { id: 'all', label: 'All Courses' },
    { id: 'foundation', label: 'Foundation' },
    { id: 'recitation', label: 'Recitation' },
    { id: 'memorization', label: 'Memorization' },
    { id: 'certification', label: 'Certification' },
  ];

  const filtered = courses.filter((course) => {
    const matchesCat = activeTab === 'all' || course.category.toLowerCase() === activeTab.toLowerCase();
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          course.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Header */}
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 relative overflow-hidden border-b border-white/10">
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
            aria-hidden="true"
          />
          <div className="site-container text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Academic Quranic Pathways
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Explore our structured courses designed with progressive levels, objective grading rubrics, and independent oral milestone examinations.
            </p>

            {/* Search Input */}
            <div className="pt-8 max-w-md mx-auto">
              <div className="relative">
                <Search className="w-4 h-4 text-[#c4d3cd] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search courses or levels..."
                  className="w-full pl-11 pr-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-[#c4d3cd]/70 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Courses Grid */}
        <div className="site-container py-14">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
            <PillTabs
              items={tabs}
              activeId={activeTab}
              onChange={setActiveTab}
            />
            <div className="text-xs text-[#6b7772]">
              Showing <span className="font-semibold text-[#10201b]">{filtered.length}</span> structured pathways
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((course, idx) => (
              <div
                key={course.id}
                id={course.code.toLowerCase()}
                className="bg-white rounded-[28px] overflow-hidden border border-[#e6dfd1] shadow-card flex flex-col justify-between hover:border-[#c49a55]/50 transition-all duration-300"
              >
                <div>
                  {/* Patterned Cover with Large Faded Number */}
                  <div
                    className={`h-[150px] relative overflow-hidden flex items-end justify-between p-4 text-white ${
                      idx % 3 === 0 ? 'bg-[#0f2c24]' : idx % 3 === 1 ? 'bg-[#24574f]' : 'bg-[#8a6a35]'
                    }`}
                  >
                    <div
                      className="absolute inset-0 bg-star-pattern opacity-10 pointer-events-none"
                      aria-hidden="true"
                    />
                    <span className="relative z-10 text-[11px] font-bold uppercase tracking-wider bg-black/30 backdrop-blur-xs px-2.5 py-1 rounded-full text-white/90">
                      {course.category}
                    </span>
                  </div>

                  <div className="p-6">
                    {/* Chips */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      {course.durationMonths && (
                        <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                          {course.durationMonths}
                        </span>
                      )}
                      {course.levelCount > 0 && (
                        <span className="bg-[#f0f6f3] text-[#1c4c3e] text-xs px-2.5 py-0.5 rounded-full font-medium">
                          {course.levelCount} level{course.levelCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>

                    <h3 className="font-fraunces text-[22px] font-medium text-[#10201b] mb-2">
                      <Link href={`/courses/${course.code}`} className="hover:underline underline-offset-4">
                        {course.title}
                      </Link>
                    </h3>
                    <p className="text-[14px] text-[#6b7772] leading-relaxed mb-4">
                      {course.description}
                    </p>

                    {course.targetAudience && (
                      <div className="pt-3 border-t border-dashed border-[#e6dfd1] text-xs text-[#a97f3c] font-medium">
                        {course.targetAudience}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 pt-0 flex items-center justify-between gap-3">
                  <Link
                    href={`/courses/${course.code}`}
                    className="text-xs text-[#143a2f] font-semibold hover:underline underline-offset-4 whitespace-nowrap"
                  >
                    View syllabus
                  </Link>
                  <Button
                    variant="green"
                    size="sm"
                    href={`/book-trial?course=${course.code}`}
                    className="shrink-0 whitespace-nowrap"
                  >
                    Book trial
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Gold Placement Assessment Banner */}
          <div className="mt-14 bg-[#f6ecd9] rounded-[28px] p-7 md:p-8 border border-[#e6dfd1] shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
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
              href="/post-trial-placement"
              className="shrink-0 whitespace-nowrap"
            >
              Request level assessment
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
