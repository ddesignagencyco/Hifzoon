'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarCheck, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/landing/Button';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative bg-[#0f2c24] text-white overflow-hidden pt-10 pb-20 md:pt-14 md:pb-24">
      {/* 8-point star pattern overlay at 6% opacity */}
      <div
        className="absolute inset-0 bg-star-pattern opacity-[0.06] pointer-events-none"
        aria-hidden="true"
      />

      {/* Radial gold glow at the top right */}
      <div
        className="absolute top-0 right-0 w-[550px] h-[550px] pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 80% 20%, rgba(196, 154, 85, 0.18) 0%, transparent 68%)',
        }}
        aria-hidden="true"
      />

      <div className="relative site-container">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
          {/* Left Column: Short, punchy, elegant */}
          <div className="space-y-6 text-left">
            {/* Short Punchy Heading */}
            <h1 className="font-fraunces text-[30px] sm:text-[42px] lg:text-[54px] font-normal leading-[1.16] tracking-[-0.015em] text-white break-normal">
              Quranic Tutoring with{' '}
              <span className="italic font-normal text-[#c49a55]">Scholarly Tradition</span>
              {' '}&amp;{' '}
              <span className="italic font-normal text-[#c49a55]">Gentle Care</span>.
            </h1>

            {/* Short Crisp Lead Text */}
            <p className="text-[#c4d3cd] text-[16px] md:text-[18px] leading-relaxed max-w-lg font-sans">
              Live 1-on-1 classes with verified Azhari scholars inside a purpose-built, synchronized Mushaf classroom.
            </p>

            {/* Action Buttons */}
            <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
              <Button
                variant="gold"
                size="default"
                href="/book-trial"
                icon={<CalendarCheck />}
              >
                Book free 30-min evaluation
              </Button>

              <Button
                variant="ghostLight"
                size="default"
                href="#faculty"
                icon={<ArrowRight />}
                iconPosition="right"
              >
                Meet the faculty
              </Button>
            </div>

            {/* 4 Concise Trust Points in 2x2 Grid */}
            <div className="grid grid-cols-2 gap-y-3 gap-x-5 pt-2 text-[13.5px] text-[#c4d3cd]">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#c49a55]/20 flex items-center justify-center text-[#c49a55] shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Sanad &amp; Ijazah teachers</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#c49a55]/20 flex items-center justify-center text-[#c49a55] shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Licensed vector Mushaf</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#c49a55]/20 flex items-center justify-center text-[#c49a55] shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>COPPA child-safe platform</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#c49a55]/20 flex items-center justify-center text-[#c49a55] shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
                <span>Flexible 4h rescheduling</span>
              </div>
            </div>
          </div>

          {/* Right Column: Serene Holy Quran & Lantern Scene inside Islamic Arch Portal */}
          <div className="relative flex justify-center items-center py-4">
            {/* The Main Arch Frame */}
            <div className="relative w-full max-w-[340px] sm:max-w-[420px] lg:max-w-[470px] h-[420px] sm:h-[480px] lg:h-[530px] rounded-t-[170px] sm:rounded-t-[210px] lg:rounded-t-[235px] rounded-b-[26px] overflow-hidden border-2 border-[#c49a55]/60 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] ring-1 ring-[#c49a55]/30 group">
              {/* Background Authentic Photo of Open Holy Quran on Wooden Rehal with Glowing Lantern */}
              <Image
                src="/hero-image.jpg"
                alt="Holy Quran on wooden rehal stand with glowing traditional lantern"
                fill
                priority
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700"
              />

              {/* Gentle ambient bottom warmth vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#091b15]/35 via-transparent to-transparent pointer-events-none" />

              {/* Subtle inner border glow */}
              <div className="absolute inset-0 rounded-t-[170px] sm:rounded-t-[210px] lg:rounded-t-[235px] rounded-b-[26px] ring-1 ring-inset ring-white/10 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
