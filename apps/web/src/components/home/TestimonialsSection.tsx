import React from 'react';
import { ShieldCheck, Star } from 'lucide-react';
import { Eyebrow } from '@/components/landing/Eyebrow';

export const TestimonialsSection: React.FC = () => {
  return (
    <section className="bg-[#f3eee4] py-20 md:py-32">
      <div className="site-container">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-xl">
            <div className="mb-3">
              <Eyebrow>Parent experiences</Eyebrow>
            </div>
            <h2 className="font-fraunces text-[28px] sm:text-[38px] md:text-[50px] font-normal leading-[1.14] text-[#10201b] break-normal">
              Trusted by diaspora Muslim families
            </h2>
          </div>
          <p className="text-[15px] md:text-[16px] text-[#6b7772] max-w-sm leading-relaxed">
            Parents in the UK, USA and Canada on structured classes and real transparency.
          </p>
        </div>

        {/* 1.2fr / 1fr Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 items-stretch">
          {/* Left: Large Green-900 Featured Review Card */}
          <div className="bg-[#0f2c24] text-white rounded-[28px] p-8 md:p-11 shadow-large border border-[#143a2f] flex flex-col justify-between relative overflow-hidden group">
            {/* Ambient Star Pattern */}
            <div
              className="absolute inset-0 bg-star-pattern opacity-[0.05] pointer-events-none"
              aria-hidden="true"
            />

            <div>
              {/* 5 Gold Stars & Course Track */}
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div className="flex items-center gap-1 text-[#c49a55]">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-current stroke-none" />
                  ))}
                </div>
                <span className="text-[11px] font-semibold text-[#c49a55] tracking-wide uppercase bg-white/10 px-3 py-1 rounded-full">
                  Noorani Qaida &amp; Tajweed
                </span>
              </div>

              {/* Quote */}
              <p className="font-fraunces text-[22px] md:text-[28px] font-normal text-white leading-snug">
                &ldquo;The difference between Hifzoon and our previous Zoom lessons is night and day.
                The synchronized Mushaf keeps my 7-year-old engaged, and the monthly report card gives us real clarity on his Tajweed.&rdquo;
              </p>
            </div>

            {/* Author Footer */}
            <div className="flex items-center justify-between pt-8 mt-8 border-t border-white/10 flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-[#1c4c3e] border border-[#c49a55] flex items-center justify-center font-fraunces text-base text-[#c49a55] font-semibold shrink-0 shadow-sm">
                  AR
                </div>
                <div>
                  <div className="font-semibold text-white text-base">
                    Dr. Aisha Rahman
                  </div>
                  <div className="text-xs text-[#c4d3cd]">
                    London, UK · Parent of Rayan (7) &amp; Zoya (9)
                  </div>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#c49a55] text-xs font-semibold border border-white/10">
                <ShieldCheck className="w-4 h-4" />
                <span>Verified Parent</span>
              </div>
            </div>
          </div>

          {/* Right: Two Stacked White Cards */}
          <div className="flex flex-col gap-6 justify-between">
            {/* Card 1: Tariq Al-Mansoor */}
            <div className="bg-white rounded-[28px] p-7 md:p-8 shadow-card border border-[#e6dfd1] flex flex-col justify-between flex-1 hover:border-[#c49a55]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1 text-[#c49a55]">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current stroke-none" />
                    ))}
                  </div>
                  <span className="text-[10.5px] font-semibold text-[#1c4c3e] bg-[#f0f6f3] px-2.5 py-0.5 rounded-full">
                    Hifz Program
                  </span>
                </div>
                <p className="text-[15px] md:text-[15.5px] text-[#3c4a45] leading-relaxed">
                  &ldquo;Sheikh Bilal is always on time, the classroom opens right in our browser, and I review lesson notes from my phone.&rdquo;
                </p>
              </div>

              <div className="flex items-center gap-3.5 pt-5 mt-4 border-t border-[#f3eee4]">
                <div className="w-10 h-10 rounded-full bg-[#f0f6f3] text-[#1c4c3e] font-fraunces font-bold flex items-center justify-center text-sm shrink-0">
                  TA
                </div>
                <div>
                  <div className="font-semibold text-[#10201b] text-sm">
                    Tariq Al-Mansoor
                  </div>
                  <div className="text-xs text-[#6b7772]">
                    Dallas, USA · Parent of Hamza (11)
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Maryam & Farhan Qureshi */}
            <div className="bg-white rounded-[28px] p-7 md:p-8 shadow-card border border-[#e6dfd1] flex flex-col justify-between flex-1 hover:border-[#c49a55]/40 transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1 text-[#c49a55]">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-current stroke-none" />
                    ))}
                  </div>
                  <span className="text-[10.5px] font-semibold text-[#1c4c3e] bg-[#f0f6f3] px-2.5 py-0.5 rounded-full">
                    Comprehensive Hifz
                  </span>
                </div>
                <p className="text-[15px] md:text-[15.5px] text-[#3c4a45] leading-relaxed">
                  &ldquo;The 604-page heatmap is an incredible motivator. My daughter loves watching her pages turn solid green.&rdquo;
                </p>
              </div>

              <div className="flex items-center gap-3.5 pt-5 mt-4 border-t border-[#f3eee4]">
                <div className="w-10 h-10 rounded-full bg-[#f0f6f3] text-[#1c4c3e] font-fraunces font-bold flex items-center justify-center text-sm shrink-0">
                  MQ
                </div>
                <div>
                  <div className="font-semibold text-[#10201b] text-sm">
                    Maryam &amp; Farhan Qureshi
                  </div>
                  <div className="text-xs text-[#6b7772]">
                    Toronto, Canada · Parents of Sarah (13)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
