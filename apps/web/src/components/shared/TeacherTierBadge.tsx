'use client';

import React from 'react';

export interface TeacherTierLike {
  name: string;
  badgeIcon?: string | null;
  description?: string | null;
}

interface TeacherTierBadgeProps {
  tier?: TeacherTierLike | null;
  size?: 'sm' | 'md' | 'lg';
  showDescription?: boolean;
}

/** Badge displaying teacher tier (Standard, Certified, Senior, etc.) */
export function TeacherTierBadge({ tier, size = 'md', showDescription = false }: TeacherTierBadgeProps) {
  if (!tier) return null;

  const sizeClass = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2',
  }[size];

  const iconSize = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
  }[size];

  return (
    <div className="inline-flex items-center gap-2">
      <div className={`flex items-center gap-1.5 rounded-full bg-[#faf7f1] border border-[#c49a55] ${sizeClass}`}>
        {tier.badgeIcon && (
          <span className={`${iconSize} select-none`} aria-hidden>
            {tier.badgeIcon}
          </span>
        )}
        <span className="font-medium text-[#10201b]">{tier.name}</span>
      </div>
      {showDescription && tier.description && (
        <span className="text-xs text-[#6b7772] italic">{tier.description}</span>
      )}
    </div>
  );
}
