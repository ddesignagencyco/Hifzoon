'use client';

import React, { useState, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

export const ScrollToTop: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top of page"
      className="fixed bottom-[90px] right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-[#12362c] to-[#0a1f19] border-2 border-[#c49a55] text-[#c49a55] shadow-[0_12px_32px_rgba(0,0,0,0.45)] hover:shadow-[0_16px_40px_rgba(196,154,85,0.4)] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 group cursor-pointer animate-in fade-in zoom-in-75"
    >
      <ChevronUp className="w-6 h-6 stroke-[2.5] text-[#c49a55] group-hover:-translate-y-0.5 transition-transform duration-200" />

      {/* Hover Tooltip */}
      <span className="hidden sm:inline-flex items-center gap-1.5 absolute right-full mr-3.5 px-3 py-1.5 rounded-full bg-[#0a1f19] text-white text-xs font-medium border border-[#c49a55]/40 shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        <span>Back to top</span>
      </span>
    </button>
  );
};
