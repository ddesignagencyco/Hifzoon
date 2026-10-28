import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type BrandLoaderVariant = 'fullscreen' | 'page' | 'section';

export interface BrandLoaderProps {
  /**
   * - `fullscreen`: fixed cream overlay with the star pattern and wordmark (first-load splash).
   * - `page`: fills the content area (min 60vh), full-size logo + ring.
   * - `section`: compact 48px logo + ring for in-card loading.
   */
  variant?: BrandLoaderVariant;
  /** Announced to assistive tech; shown under the logo unless `hideLabel`. */
  label?: string;
  /** Keep the label for screen readers / tests only. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * The one Hifzoon loading indicator: the logo with a gold progress ring circling it.
 * The ring animation (`hifzoon-splash-ring`, globals.css) slows down under
 * `prefers-reduced-motion`. Small inline spinners inside buttons/inputs stay as icons.
 */
export function BrandLoader({ variant = 'page', label, hideLabel = false, className }: BrandLoaderProps) {
  const text = label ?? (variant === 'fullscreen' ? 'Loading Hifzoon' : 'Loading…');

  if (variant === 'fullscreen') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={text}
        data-variant="fullscreen"
        className={cn('fixed inset-0 z-[100] flex items-center justify-center bg-cream', className)}
      >
        <div className="absolute inset-0 bg-star-pattern-gold opacity-[0.06] pointer-events-none" aria-hidden />
        <div className="relative flex flex-col items-center gap-5">
          <LogoRing size="lg" priority />
          <div className="text-center" aria-hidden>
            <p className="font-fraunces text-2xl text-ink leading-none">Hifzoon</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-gold-600 mt-2">Quran Academy</p>
          </div>
          <span className="sr-only">{text}</span>
        </div>
      </div>
    );
  }

  const compact = variant === 'section';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={text}
      data-variant={variant}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-10' : 'gap-4 min-h-[60vh] w-full px-4',
        className,
      )}
    >
      <LogoRing size={compact ? 'sm' : 'lg'} />
      <span className={cn(hideLabel ? 'sr-only' : compact ? 'text-xs text-muted' : 'text-sm text-muted')}>{text}</span>
    </div>
  );
}

function LogoRing({ size, priority = false }: { size: 'sm' | 'lg'; priority?: boolean }) {
  const lg = size === 'lg';
  return (
    <div className={cn('relative shrink-0', lg ? 'w-28 h-28' : 'w-12 h-12')} aria-hidden>
      {/* Track + rotating progress arc around the logo */}
      <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full">
        <circle cx="56" cy="56" r="52" fill="none" stroke="var(--line)" strokeWidth={lg ? 3 : 6} />
      </svg>
      <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full hifzoon-splash-ring">
        <circle
          cx="56"
          cy="56"
          r="52"
          fill="none"
          stroke="var(--gold)"
          strokeWidth={lg ? 3 : 6}
          strokeLinecap="round"
          strokeDasharray="90 237"
        />
      </svg>
      <div
        className={cn(
          'absolute flex items-center justify-center',
          lg ? 'inset-[18px] rounded-t-[30px] rounded-b-[10px] p-3' : 'inset-[8px] p-0.5',
        )}
      >
        <Image
          src="/logo.png"
          alt=""
          width={lg ? 64 : 28}
          height={lg ? 64 : 28}
          className="object-contain"
          priority={priority}
        />
      </div>
    </div>
  );
}
