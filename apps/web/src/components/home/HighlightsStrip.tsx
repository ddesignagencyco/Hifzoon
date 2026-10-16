import React from 'react';
import { Users, BookOpen, LayoutGrid, BarChart3, Sparkles } from 'lucide-react';

export const HighlightsStrip: React.FC = () => {
  const highlights = [
    {
      icon: <Users className="w-5 h-5 stroke-[2.2]" />,
      title: '1-on-1 & small halqas',
      subtext: 'Dedicated scholar with personal pace and weekly vocal coaching',
    },
    {
      icon: <BookOpen className="w-5 h-5 stroke-[2.2]" />,
      title: 'Licensed Mushaf',
      subtext: 'Vector Madani & IndoPak scripts with real-time teacher pointer',
    },
    {
      icon: <LayoutGrid className="w-5 h-5 stroke-[2.2]" />,
      title: '604-page Hifz engine',
      subtext: 'Daily Sabaq, Sabqi, and Manzil spaced-repetition retention',
    },
    {
      icon: <BarChart3 className="w-5 h-5 stroke-[2.2]" />,
      title: 'Monthly report cards',
      subtext: 'Five-pillar Makharij & Tajweed rubrics delivered to parents',
    },
  ];

  return (
    <div className="relative z-30 -mt-8 sm:-mt-12 md:-mt-16 site-container">
      {/* Outer Card with Luxury Ivory Pearl Backdrop, Gold Border, and Ambient Star Pattern */}
      <div className="relative bg-white/95 backdrop-blur-md rounded-[24px] sm:rounded-[32px] border-2 border-[#c49a55]/40 shadow-[0_22px_60px_-15px_rgba(10,31,25,0.2)] p-5 sm:p-7 md:p-8 overflow-hidden">
        {/* Top Gold Gradient Trim */}
        <div
          className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-[#c49a55] to-transparent"
          aria-hidden="true"
        />

        {/* Subtle Ambient Gold Star Watermark */}
        <div
          className="absolute inset-0 bg-star-pattern-gold opacity-[0.035] pointer-events-none"
          aria-hidden="true"
        />

        {/* 4 Pillars Grid */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0">
          {highlights.map((item, idx) => (
            <div
              key={idx}
              className={`group flex flex-col items-start min-w-0 transition-all duration-300 relative ${
                idx !== 0 ? 'lg:ps-8' : ''
              } ${idx !== highlights.length - 1 ? 'lg:pe-8' : ''}`}
            >
              {/* Header of Column: Arch Badge */}
              <div className="w-full flex items-center justify-between mb-3.5">
                {/* Islamic Arch Badge for Icon */}
                <div className="w-12 h-12 rounded-t-[18px] rounded-b-[6px] bg-gradient-to-br from-[#f6ecd9] to-[#ebdcc2] text-[#8a6a35] border border-[#c49a55]/40 flex items-center justify-center shadow-xs group-hover:scale-105 group-hover:bg-[#c49a55] group-hover:text-[#0a1f19] group-hover:border-[#c49a55] transition-all duration-300 shrink-0">
                  {item.icon}
                </div>
              </div>

              {/* Title */}
              <h3 className="font-fraunces text-[17px] sm:text-[19px] md:text-[20px] font-medium text-[#10201b] leading-tight break-normal group-hover:text-[#143a2f] transition-colors">
                {item.title}
              </h3>

              {/* Subtext */}
              <p className="mt-1.5 text-[13px] sm:text-[13.5px] text-[#4a5752] leading-relaxed">
                {item.subtext}
              </p>

              {/* Vertical Elegant Divider for Desktop */}
              {idx !== highlights.length - 1 && (
                <div
                  className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 h-16 w-px bg-gradient-to-b from-transparent via-[#c49a55]/30 to-transparent"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
