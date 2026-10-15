'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Play, 
  Pause, 
  ShieldCheck, 
  GraduationCap, 
  Globe, 
  Search,
  ArrowRight
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TeacherProfile } from '@/lib/types';
import { useTeachers } from '@/hooks';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

export default function TeachersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const { teachers, isLoading } = useTeachers(genderFilter);
  const [playingTeacherId, setPlayingTeacherId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const genderTabs = [
    { id: 'ALL', label: 'All Faculty' },
    { id: 'MALE', label: 'Ustadh (Male)' },
    { id: 'FEMALE', label: 'Ustadha (Female)' },
  ];

  const toggleAudio = (teacher: TeacherProfile) => {
    if (!teacher.audioSampleUrl) return;

    if (playingTeacherId === teacher.id) {
      audioRef.current?.pause();
      setPlayingTeacherId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(teacher.audioSampleUrl);
      audio.onended = () => setPlayingTeacherId(null);
      audio.play().catch(() => {});
      audioRef.current = audio;
      setPlayingTeacherId(teacher.id);
    }
  };

  const filtered = teachers.filter((t) => {
    const matchesGender = genderFilter === 'ALL' || t.gender === genderFilter;
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.bio.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.specializations.some((s) => s.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesGender && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#faf7f1] flex flex-col justify-between selection:bg-[#c49a55]/20 selection:text-[#0f2c24]">
      <Header />

      <main className="flex-1">
        {/* Full-Width Header */}
        <section className="bg-[#0f2c24] text-white py-16 md:py-24 px-6 sm:px-8 lg:px-10 relative overflow-hidden">
          <div
            className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
            aria-hidden="true"
          />
          <div className="max-w-[1360px] mx-auto text-center relative z-10">
            <h1 className="text-3xl sm:text-5xl font-fraunces font-normal tracking-tight text-white mb-4">
              Vetted Quran Teachers &amp; Examiners
            </h1>
            <p className="text-[#c4d3cd] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Every instructor is rigorously audited for Tajweed perfection, credential-verified, and trained in gentle pedagogy. Listen to their recitations below.
            </p>

            {/* Search Input */}
            <div className="pt-8 max-w-md mx-auto">
              <div className="relative">
                <Search className="w-4 h-4 text-[#c4d3cd] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by teacher name or subject..."
                  className="w-full pl-11 pr-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-[#c4d3cd]/70 text-sm focus:outline-none focus:ring-2 focus:ring-[#c49a55]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Filters and Faculty Grid */}
        <div className="max-w-[1360px] mx-auto px-6 sm:px-8 lg:px-10 py-14">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-10">
            <PillTabs
              items={genderTabs}
              activeId={genderFilter}
              onChange={(id) => setGenderFilter(id as any)}
            />
            <div className="text-xs text-[#6b7772]">
              Showing <span className="font-semibold text-[#10201b]">{filtered.length}</span> verified instructors
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map((teacher) => {
              const isPlaying = playingTeacherId === teacher.id;

              return (
                <div
                  key={teacher.id}
                  className="bg-white rounded-[28px] overflow-hidden border border-[#e6dfd1] shadow-card flex flex-col justify-between group hover:border-[#c49a55]/50 transition-all duration-300"
                >
                  <div>
                    {/* Photo Container */}
                    <div className="relative h-[250px] w-full bg-[#f0f6f3] overflow-hidden">
                      <Image
                        src={teacher.photoUrl}
                        alt={teacher.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />

                      {/* Verified Badge */}
                      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#1c4c3e]" />
                        <span className="text-[10.5px] font-semibold text-[#143a2f]">
                          Verified Ijazah
                        </span>
                      </div>

                      {/* Play Button */}
                      {teacher.audioSampleUrl && (
                        <button
                          type="button"
                          onClick={() => toggleAudio(teacher)}
                          aria-label={`Play recitation by ${teacher.name}`}
                          className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#c49a55] text-[#0a1f19] flex items-center justify-center shadow-md hover:bg-[#b58c49] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                        >
                          {isPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Details */}
                    <div className="p-5">
                      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#a97f3c] mb-1 truncate">
                        {teacher.title}
                      </div>

                      <h3 className="font-fraunces text-[20px] font-medium text-[#10201b] leading-tight mb-3">
                        {teacher.name}
                      </h3>

                      <p className="text-xs text-[#6b7772] line-clamp-2 leading-relaxed mb-4">
                        {teacher.bio}
                      </p>

                      <div className="space-y-2 pt-3 border-t border-[#f3eee4] text-xs text-[#6b7772]">
                        <div className="flex items-start gap-2">
                          <GraduationCap className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{teacher.qualifications[0]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4 text-[#1c4c3e] shrink-0" />
                          <span>{teacher.languages.join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <Button
                      variant="outline"
                      size="sm"
                      href={`/book-trial?teacher=${teacher.id}`}
                      className="w-full text-xs"
                    >
                      Request a class
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
