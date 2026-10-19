import React from 'react';
import { Eyebrow } from './Eyebrow';

export interface SectionHeaderProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'left' | 'center';
  dark?: boolean;
  className?: string;
  rightContent?: React.ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  dark = false,
  className = '',
  rightContent,
}: SectionHeaderProps) {
  const isCenter = align === 'center';

  return (
    <div
      className={`mb-12 ${
        rightContent
          ? 'flex flex-col md:flex-row md:items-end md:justify-between gap-6'
          : ''
      } ${className}`}
    >
      <div className={`max-w-2xl ${isCenter ? 'mx-auto text-center' : ''}`}>
        {eyebrow && (
          <div className="mb-3">
            <Eyebrow centered={isCenter} dark={dark}>
              {eyebrow}
            </Eyebrow>
          </div>
        )}
        <h2
          className={`font-fraunces text-[34px] md:text-[50px] font-normal leading-[1.12] tracking-[-0.015em] ${
            dark ? 'text-white' : 'text-[#10201b]'
          }`}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-4 text-[16.5px] md:text-[18.5px] leading-relaxed ${
              dark ? 'text-[#c4d3cd]' : 'text-[#3c4a45]'
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {rightContent && <div className="shrink-0">{rightContent}</div>}
    </div>
  );
}
