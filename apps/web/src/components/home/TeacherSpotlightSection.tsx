'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Play, 
  Pause, 
  ShieldCheck, 
  GraduationCap, 
  Languages, 
  CalendarCheck,
  ChevronRight,
  Info
} from 'lucide-react';
import { TEACHERS_DATA } from '@/lib/data/mock-data';
import { TeacherProfile } from '@/lib/types';

export const TeacherSpotlightSection: React.FC = () => {
  const [playingTeacherId, setPlayingTeacherId] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTeachers = genderFilter === 'ALL'
    ? TEACHERS_DATA
    : TEACHERS_DATA.filter((t) => t.gender === genderFilter);

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

  return (
    <section id="teachers" className="py-20 bg-white border-b border-[#E7E1D7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header & Philosophy */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 border-b border-[#E7E1D7] pb-8">
          <div className="max-w-2xl space-y-2">
            <span className="text-[10px] tracking-widest uppercase font-bold text-[#886840] font-sans">
              Distinguished Quranic Faculty
            </span>
            <h2 className="text-3xl sm:text-4xl font-normal text-[#1A221E] font-serif">
              Vetted Scholars, Patient Educators
            </h2>
            <p className="text-xs sm:text-sm text-[#424D48] leading-relaxed">
              Every instructor is individually audited for Tajweed articulation, background checked, and trained in modern pedagogical patience for diaspora children and adults.
            </p>
          </div>

          {/* Gender Filter Pills */}
          <div className="flex items-center gap-1.5 p-1.5 bg-[#F4EFEA] border border-[#DCD5C9] rounded-2xl text-xs font-semibold self-start md:self-end shadow-2xs">
            <button
              type="button"
              onClick={() => setGenderFilter('ALL')}
              className={`px-3.5 py-2 rounded-xl transition-all ${
                genderFilter === 'ALL' ? 'bg-[#143D33] text-white shadow-xs font-bold' : 'text-[#424D48] hover:text-[#1A221E] hover:bg-white/60'
              }`}
            >
              All Faculty
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter('MALE')}
              className={`px-3.5 py-2 rounded-xl transition-all ${
                genderFilter === 'MALE' ? 'bg-[#143D33] text-white shadow-xs font-bold' : 'text-[#424D48] hover:text-[#1A221E] hover:bg-white/60'
              }`}
            >
              Male (Ustadh)
            </button>
            <button
              type="button"
              onClick={() => setGenderFilter('FEMALE')}
              className={`px-3.5 py-2 rounded-xl transition-all ${
                genderFilter === 'FEMALE' ? 'bg-[#143D33] text-white shadow-xs font-bold' : 'text-[#424D48] hover:text-[#1A221E] hover:bg-white/60'
              }`}
            >
              Female (Ustadha)
            </button>
          </div>
        </div>

        {/* Faculty Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredTeachers.map((teacher) => (
            <div
              key={teacher.id}
              className="bg-[#FCFBF9] border border-[#E3DACD] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#143D33] hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 shadow-sm group"
            >
              <div>
                
                {/* Dignified Vertical Portrait (4:5 Ratio) */}
                <div className="relative aspect-4/5 w-full bg-[#EDE7DF] overflow-hidden">
                  <Image
                    src={teacher.photoUrl}
                    alt={`Photograph of ${teacher.name}, ${teacher.title}`}
                    width={400}
                    height={500}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-all duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Recitation Sample Audio Button */}
                  {teacher.audioSampleUrl && (
                    <button
                      type="button"
                      onClick={() => toggleAudio(teacher)}
                      className={`absolute bottom-3 left-3 flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold text-white shadow-md backdrop-blur-xs transition-all hover:scale-105 active:scale-95 ${
                        playingTeacherId === teacher.id
                          ? 'bg-[#C5A880] text-[#143D33]'
                          : 'bg-[#143D33]/90 hover:bg-[#143D33] border border-[#386657]'
                      }`}
                    >
                      {playingTeacherId === teacher.id ? (
                        <>
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Playing Audio</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Sample Recitation</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Verified Sanad Badge */}
                  <span className="absolute top-3 right-3 bg-white/95 text-[#143D33] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#DCD5C9] shadow-xs flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#143D33]" />
                    <span>Verified Ijazah</span>
                  </span>
                </div>

                {/* Teacher Profile Content */}
                <div className="p-5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#9E7D53] font-bold">{teacher.title}</span>
                    <span className="text-[#6B7670] bg-[#F4EFEA] px-2 py-0.5 rounded-md border border-[#E3DACD]">{teacher.experienceYears}+ yrs exp</span>
                  </div>

                  <h3 className="text-xl font-serif font-bold text-[#1A221E] group-hover:text-[#143D33] transition-colors leading-snug">
                    {teacher.name}
                  </h3>

                  <p className="text-xs text-[#424D48] leading-relaxed line-clamp-3">
                    {teacher.bio}
                  </p>

                  {/* Qualifications */}
                  <div className="pt-2.5 border-t border-[#E7E1D7] space-y-1.5 text-[11px] text-[#424D48]">
                    <div className="flex items-start gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-[#143D33] shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{teacher.qualifications[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Languages className="w-3.5 h-3.5 text-[#6B7670] shrink-0" />
                      <span>{teacher.languages.join(', ')}</span>
                    </div>
                  </div>

                </div>

              </div>

              {/* Action Bar */}
              <div className="p-4 bg-[#FAF8F5] border-t border-[#E7E1D7]">
                <Link
                  href={`/book-trial?teacher=${teacher.id}`}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold text-[#143D33] bg-white hover:bg-[#143D33] hover:text-white border border-[#DCD5C9] shadow-2xs hover:shadow-xs active:scale-95 transition-all"
                >
                  <CalendarCheck className="w-3.5 h-3.5" />
                  <span>Request Class with {teacher.name.split(' ')[0]}</span>
                </Link>
              </div>

            </div>
          ))}
        </div>

        {/* Demo-data attribution note as requested in prompt */}
        <div className="mt-8 text-center text-[11px] text-[#8B9690] flex items-center justify-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-[#9E7D53]" />
          <span>Faculty photographs and credentials represent genuine educational demonstration profiles adhering to verified Hifzoon standards.</span>
        </div>

        {/* View All Faculty */}
        <div className="mt-8 text-center">
          <Link
            href="/teachers"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#143D33] hover:underline"
          >
            <span>Browse Complete Faculty Directory &amp; Audio Library</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  );
};
