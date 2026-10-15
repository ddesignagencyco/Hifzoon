'use client';

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Play, Pause, GraduationCap, Globe, ArrowRight } from 'lucide-react';
import { TEACHERS_DATA } from '@/lib/data/mock-data';
import { Eyebrow } from '@/components/landing/Eyebrow';
import { PillTabs } from '@/components/landing/PillTabs';
import { Button } from '@/components/landing/Button';

export const FacultySection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tabs = [
    { id: 'all', label: 'All faculty' },
    { id: 'ustadh', label: 'Ustadh' },
    { id: 'ustadha', label: 'Ustadha' },
  ];

  const handlePlayAudio = (teacherId: string, audioUrl?: string) => {
    if (!audioUrl) return;

    if (playingId === teacherId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(audioUrl);
      audioRef.current.play().catch(() => {});
      audioRef.current.onended = () => setPlayingId(null);
      setPlayingId(teacherId);
    }
  };

  const filteredTeachers = TEACHERS_DATA.filter((teacher) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'ustadh') return teacher.gender === 'MALE';
    if (activeTab === 'ustadha') return teacher.gender === 'FEMALE';
    return true;
  });

  return (
    <section id="faculty" className="bg-white py-20 md:py-32">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="mb-3">
              <Eyebrow>Distinguished Quranic faculty</Eyebrow>
            </div>
            <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] break-normal">
              Vetted scholars, patient educators
            </h2>
            <p className="mt-3 text-[16px] md:text-[18.5px] text-[#3c4a45] leading-relaxed">
              Every instructor is audited for Tajweed, background-checked and trained to teach diaspora children and adults with patience.
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

        {/* 4 Cards Grid: Responsive 1 col mobile, 2 col tablet, 4 col desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
          {filteredTeachers.slice(0, 4).map((teacher) => {
            const isPlaying = playingId === teacher.id;

            // Formatted uppercase role with years
            let roleTitle = 'QURAN & TAJWEED';
            if (teacher.id === 'tch-1') roleTitle = 'QURAN & QIRA’AT';
            if (teacher.id === 'tch-2') roleTitle = 'EARLY YEARS & NAZRA';
            if (teacher.id === 'tch-3') roleTitle = 'HIFZ & TAJWEED';
            if (teacher.id === 'tch-4') roleTitle = 'TAJWEED & TAFSIR';

            const role = `${roleTitle} · ${teacher.experienceYears}+ YRS`;
            const primaryQual = teacher.qualifications[0] || 'Certified Quran Scholar';
            const languages = teacher.languages.join(', ');

            return (
              <div
                key={teacher.id}
                className="bg-white rounded-[24px] md:rounded-[28px] overflow-hidden border border-[#e6dfd1] shadow-card flex flex-col justify-between group hover:border-[#c49a55]/50 transition-all duration-300"
              >
                <div>
                  {/* Photo Container: Optimized portrait ratio */}
                  <div className="relative h-[240px] sm:h-[220px] md:h-[250px] w-full bg-[#f0f6f3] overflow-hidden">
                    <Image
                      src={teacher.photoUrl}
                      alt={teacher.name}
                      fill
                      className="object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Verified Ijazah Chip (top left) */}
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs rounded-full px-2.5 py-1 flex items-center gap-1.5 shadow-sm">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#1c4c3e]" />
                      <span className="text-[10.5px] font-semibold text-[#143a2f]">
                        Verified Ijazah
                      </span>
                    </div>

                    {/* Gold Round Play Button (bottom right) */}
                    {teacher.audioSampleUrl && (
                      <button
                        type="button"
                        onClick={() => handlePlayAudio(teacher.id, teacher.audioSampleUrl)}
                        aria-label={`Play recitation sample by ${teacher.name}`}
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

                  {/* Body Info */}
                  <div className="p-4 md:p-5">
                    {/* Gold Uppercase Role & Experience */}
                    <div className="text-[10.5px] md:text-[11px] font-bold uppercase tracking-[0.12em] text-[#a97f3c] mb-1 truncate">
                      {role}
                    </div>

                    {/* Fraunces Name */}
                    <h3 className="font-fraunces text-[18px] md:text-[20px] font-medium text-[#10201b] leading-tight mb-2.5">
                      {teacher.name}
                    </h3>

                    {/* Qualification and Languages with icons */}
                    <div className="space-y-1.5 pt-2 border-t border-[#f3eee4] text-xs text-[#6b7772]">
                      <div className="flex items-start gap-2">
                        <GraduationCap className="w-4 h-4 text-[#1c4c3e] shrink-0 mt-0.5" />
                        <span className="line-clamp-1">{primaryQual}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[#1c4c3e] shrink-0" />
                        <span className="truncate">{languages}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Button: Visible on both mobile and desktop with whitespace-nowrap */}
                <div className="p-4 md:p-5 pt-0">
                  <Button
                    variant="outline"
                    size="sm"
                    href={`/book-trial?teacher=${teacher.id}`}
                    className="w-full text-xs whitespace-nowrap shrink-0"
                  >
                    Request a class
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Below the cards link */}
        <div className="mt-12 text-center">
          <Link
            href="/teachers"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#143a2f] hover:text-[#0f2c24] underline underline-offset-4 transition-colors"
          >
            <span>Browse the full faculty directory &amp; audio library</span>
            <ArrowRight className="w-4 h-4 text-[#c49a55]" />
          </Link>
        </div>
      </div>
    </section>
  );
};
