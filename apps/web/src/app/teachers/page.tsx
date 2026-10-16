'use client';

import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useTeachers } from '@/hooks';
import { PillTabs } from '@/components/landing/PillTabs';
import { TeacherCard } from '@/components/home/TeacherCard';

type GenderFilter = 'ALL' | 'MALE' | 'FEMALE';

const GENDER_TABS: Array<{ id: GenderFilter; label: string }> = [
  { id: 'ALL', label: 'All teachers' },
  { id: 'MALE', label: 'Ustadh (male)' },
  { id: 'FEMALE', label: 'Ustadha (female)' },
];

export default function TeachersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL');
  const { teachers, allTeachers, isLoading } = useTeachers(genderFilter);

  const term = searchTerm.trim().toLowerCase();
  const filtered = teachers.filter(
    (t) =>
      !term ||
      t.name.toLowerCase().includes(term) ||
      (t.bio ?? '').toLowerCase().includes(term) ||
      t.specializations.some((s) => s.toLowerCase().includes(term)),
  );
  const isBaseline = allTeachers.length > 0 && allTeachers.every((t) => t.source === 'baseline');

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none" aria-hidden="true" />
          <div className="site-container text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Our Quran Teachers
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Every teacher listed here has completed our hiring pipeline and safeguarding training before being offered to families.
            </p>
            <div className="pt-8 max-w-md mx-auto">
              <div className="relative">
                <Search className="w-4 h-4 text-[#c4d3cd] absolute left-4 top-1/2 -translate-y-1/2" aria-hidden />
                <label htmlFor="teacher-search" className="sr-only">
                  Search teachers
                </label>
                <input
                  id="teacher-search"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by teacher name or subject..."
                  className="w-full pl-11 pr-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-[#c4d3cd]/70 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55]"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="site-container py-14">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
            <PillTabs items={GENDER_TABS} activeId={genderFilter} onChange={(id) => setGenderFilter(id as GenderFilter)} />
            <p className="text-xs text-[#6b7772]" aria-live="polite">
              {isLoading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading teachers…
                </span>
              ) : (
                <>
                  Showing <span className="font-semibold text-[#10201b]">{filtered.length}</span> teacher{filtered.length === 1 ? '' : 's'}
                </>
              )}
            </p>
          </div>

          {isBaseline && !isLoading && (
            <p role="status" className="mb-8 rounded-2xl border border-[#e6dfd1] bg-[#f6ecd9] px-4 py-3 text-xs text-[#3c4a45]">
              Our live teacher directory is temporarily unavailable, so sample profiles are shown. Book a trial and we will match you with a cleared teacher.
            </p>
          )}

          {filtered.length === 0 && !isLoading ? (
            <p className="text-center text-sm text-[#6b7772] py-12">No teachers match your search.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filtered.map((teacher) => (
                <TeacherCard key={teacher.id} teacher={teacher} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
