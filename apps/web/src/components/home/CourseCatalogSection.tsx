'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  BookOpen, 
  Clock, 
  GraduationCap, 
  Check, 
  ArrowRight,
  Sparkles,
  Award
} from 'lucide-react';
import { COURSE_IMAGES } from '@/lib/data/mock-data';
import { useCourses } from '@/hooks';

export const CourseCatalogSection: React.FC = () => {
  const { courses } = useCourses();
  const [activeTab, setActiveTab] = useState<'All' | 'Foundation' | 'Recitation' | 'Memorization' | 'Certification'>('All');

  const filteredCourses = activeTab === 'All'
    ? courses
    : courses.filter((c) => c.category === activeTab);

  return (
    <section id="courses" className="py-20 bg-[#FAF8F5] border-b border-[#E7E1D7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 border-b border-[#E7E1D7] pb-8">
          <div className="max-w-2xl space-y-2">
            <span className="text-[10px] tracking-widest uppercase font-bold text-[#886840] font-sans">
              Structured Academic Pathways
            </span>
            <h2 className="text-3xl sm:text-4xl font-normal text-[#1A221E] font-serif">
              Comprehensive Quranic Curriculum
            </h2>
            <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
              Every course is structured with discrete levels, objective grading rubrics, and independent oral milestone examinations.
            </p>
          </div>

          {/* Academic Discipline Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1.5 bg-[#F4EFEA] border border-[#DCD5C9] rounded-2xl text-xs font-semibold self-start md:self-end shadow-2xs">
            {(['All', 'Foundation', 'Recitation', 'Memorization', 'Certification'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-2 rounded-xl transition-all ${
                  activeTab === tab
                    ? 'bg-[#143D33] text-white shadow-xs font-bold'
                    : 'text-[#424D48] hover:text-[#1A221E] hover:bg-white/60'
                }`}
              >
                {tab === 'All' ? 'All Disciplines' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Editorial Course Layout */}
        <div className="space-y-8">
          
          {/* Featured First Course Banner (Noorani & Madani Qaida) */}
          {(activeTab === 'All' || activeTab === 'Foundation') && (
            <div className="bg-white border border-[#DCD5C9] rounded-3xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
              <div className="lg:col-span-5 relative aspect-4/3 rounded-2xl overflow-hidden bg-[#EDE7DF] border border-[#E7E1D7]">
                <Image
                  src={COURSE_IMAGES['crs-1'].url}
                  alt={COURSE_IMAGES['crs-1'].alt}
                  fill
                  className="object-cover group-hover:scale-103 transition-transform duration-500"
                />
                <div className="absolute top-3.5 left-3.5 bg-[#143D33]/90 text-[#D8C2A0] text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border border-[#A37E4C]/40 backdrop-blur-xs">
                  Ages 4–9 &amp; Adult Beginners
                </div>
              </div>

              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A5E35] bg-[#F9F6F0] border border-[#DFD5C6] px-2.5 py-1 rounded-full">
                    Foundation Level 1–3
                  </span>
                  <span className="text-xs text-[#6B7670]">Expected: 3 to 6 months</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-serif font-bold text-[#1A221E] group-hover:text-[#143D33] transition-colors">
                  Noorani &amp; Madani Qaida
                </h3>

                <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
                  The essential foundation for young minds. Our patient instructors use an interactive digital Qaida board to guide correct mouth and tongue articulation points (Makharij), compound letter recognition, and proper short vowel sounds (Harakat).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-[#2D3632] pt-1">
                  <div className="flex items-start gap-2 p-1.5 rounded-lg bg-[#FAF8F5]">
                    <Check className="w-3.5 h-3.5 text-[#143D33] mt-0.5 shrink-0" />
                    <span>Interactive letter pointer for eye tracking</span>
                  </div>
                  <div className="flex items-start gap-2 p-1.5 rounded-lg bg-[#FAF8F5]">
                    <Check className="w-3.5 h-3.5 text-[#143D33] mt-0.5 shrink-0" />
                    <span>Weekly progress audio recordings for parents</span>
                  </div>
                  <div className="flex items-start gap-2 p-1.5 rounded-lg bg-[#FAF8F5]">
                    <Check className="w-3.5 h-3.5 text-[#143D33] mt-0.5 shrink-0" />
                    <span>Gentle phonetics with zero pressure</span>
                  </div>
                  <div className="flex items-start gap-2 p-1.5 rounded-lg bg-[#FAF8F5]">
                    <Check className="w-3.5 h-3.5 text-[#143D33] mt-0.5 shrink-0" />
                    <span>Child psychology certified teachers</span>
                  </div>
                </div>

                <div className="pt-3 flex flex-wrap items-center gap-4">
                  <Link
                    href="/book-trial?course=QAIDA"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-bold text-white bg-[#143D33] hover:bg-[#1C5245] shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
                  >
                    <span>Schedule Qaida Trial Evaluation</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#C5A880]" />
                  </Link>
                  <Link
                    href="/courses#crs-1"
                    className="text-xs font-semibold text-[#143D33] hover:text-[#9E7D53] hover:underline"
                  >
                    View Syllabus &amp; Rubric →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Remaining Courses Grid with Rounded Cards & Refined Hover */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses
              .filter((c) => activeTab !== 'All' || c.id !== 'crs-1')
              .map((course) => {
                const img = COURSE_IMAGES[course.id] || COURSE_IMAGES['crs-2'];

                return (
                  <div
                    key={course.id}
                    className="bg-white border border-[#E3DACD] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#143D33] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 shadow-sm group"
                  >
                    <div>
                      {/* Course Image Header */}
                      <div className="relative aspect-16/9 w-full bg-[#EDE7DF] overflow-hidden">
                        <Image
                          src={img.url}
                          alt={img.alt}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <span className="absolute bottom-3 left-3 text-[10px] font-sans font-bold uppercase tracking-wider text-[#D8C2A0] bg-[#143D33]/90 px-2.5 py-0.5 rounded-full border border-[#A37E4C]/40 backdrop-blur-xs">
                          {course.category}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-6 space-y-3">
                        <div className="flex items-center justify-between text-[11px] text-[#6B7670]">
                          <span className="font-semibold text-[#143D33]">{course.durationMonths}</span>
                          <span className="bg-[#F4EFEA] px-2 py-0.5 rounded-md border border-[#E3DACD]">{course.levelCount} Progressive Levels</span>
                        </div>

                        <h3 className="text-xl font-serif font-bold text-[#1A221E] group-hover:text-[#143D33] transition-colors leading-snug">
                          {course.title}
                        </h3>

                        <p className="text-xs text-[#424D48] leading-relaxed line-clamp-3">
                          {course.description}
                        </p>

                        <div className="pt-2 text-[11px] text-[#6B7670] italic border-t border-[#F4EFEA]">
                          <strong>Target:</strong> {course.targetAudience}
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-[#FAF8F5] border-t border-[#E7E1D7] flex items-center justify-between">
                      <Link
                        href={`/courses#${course.id}`}
                        className="text-xs font-semibold text-[#143D33] hover:underline"
                      >
                        Syllabus Details
                      </Link>

                      <Link
                        href={`/book-trial?course=${course.code}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#143D33] hover:bg-[#1C5245] shadow-2xs hover:shadow-xs active:scale-95 transition-all"
                      >
                        <span>Book Trial</span>
                        <ArrowRight className="w-3 h-3 text-[#C5A880]" />
                      </Link>
                    </div>

                  </div>
                );
              })}
          </div>

        </div>

        {/* Academic Placement Assistance Callout */}
        <div className="mt-14 p-7 sm:p-9 bg-white border border-[#DCD5C9] rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <h4 className="text-xl font-serif font-bold text-[#1A221E]">
              Uncertain of your child&apos;s current reading placement?
            </h4>
            <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
              Book a complimentary 30-minute evaluation session with a senior examiner. We assess Makharij accuracy, reading rhythm, and provide an objective placement recommendation without any obligation.
            </p>
          </div>

          <Link
            href="/book-trial"
            className="shrink-0 px-6 py-3.5 rounded-xl bg-[#143D33] hover:bg-[#1C5245] text-white text-xs font-bold shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all"
          >
            Request Level Assessment
          </Link>
        </div>

      </div>
    </section>
  );
};
