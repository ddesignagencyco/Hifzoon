import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface LogoProps {
  dark?: boolean;
  className?: string;
}

export function Logo({ dark = true, className = '' }: LogoProps) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-3.5 group select-none ${className}`}
      aria-label="Hifzoon Quran Academy Home"
    >
      {/* Brand logo container: white background with the Islamic arch radius */}
      <div className="relative w-[58px] h-[58px] sm:w-[66px] sm:h-[66px] rounded-t-[26px] sm:rounded-t-[30px] rounded-b-[8px] bg-white p-2 sm:p-2.5 flex items-center justify-center shrink-0 shadow-md transition-transform duration-200 group-hover:scale-105 overflow-hidden">
        <Image
          src="/logo.png"
          alt="Hifzoon Logo"
          width={56}
          height={56}
          className="w-full h-full object-contain"
          priority
        />
      </div>

      {/* Brand Typography with Increased Size */}
      <div className="flex flex-col">
        <span
          className={`font-fraunces text-[28px] sm:text-[33px] font-medium leading-none tracking-[-0.02em] ${dark ? 'text-white' : 'text-[#10201b]'
            }`}
        >
          Hifzoon
        </span>
        <span className="text-[10px] sm:text-[11.5px] font-bold uppercase tracking-[0.26em] text-[#c49a55] mt-1.5">
          Quran Academy
        </span>
      </div>
    </Link>
  );
}
