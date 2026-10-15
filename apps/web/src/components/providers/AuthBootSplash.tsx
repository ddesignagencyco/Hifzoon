'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/hooks';

/** Never hold the site behind the splash longer than this, even if the API is slow or down. */
const MAX_WAIT_MS = 4000;
const FADE_MS = 300;

/**
 * First-load splash: the Hifzoon logo with a gold progress ring circling it.
 *
 * The session lives only in memory and is restored from the httpOnly refresh cookie
 * after hydration, so without this the header first renders "Login / Book trial" and then
 * swaps to the profile menu. The splash is part of the server-rendered HTML (visible from
 * first paint), stays until the session check settles, then fades out. It only runs on the
 * initial page load, not on client-side navigations.
 */
export function AuthBootSplash() {
  const { isResolved } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  const done = isResolved || timedOut;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), FADE_MS);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Hifzoon"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-cream transition-opacity duration-300 ${done ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="absolute inset-0 bg-star-pattern-gold opacity-[0.06] pointer-events-none" aria-hidden />
      <div className="relative flex flex-col items-center gap-5">
        <div className="relative w-28 h-28">
          {/* Track + rotating progress arc around the logo */}
          <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full" aria-hidden>
            <circle cx="56" cy="56" r="52" fill="none" stroke="var(--line)" strokeWidth="3" />
          </svg>
          <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full hifzoon-splash-ring" aria-hidden>
            <circle
              cx="56"
              cy="56"
              r="52"
              fill="none"
              stroke="var(--gold)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="90 237"
            />
          </svg>
          <div className="absolute inset-[18px] rounded-t-[30px] rounded-b-[10px] bg-white shadow-card flex items-center justify-center p-3">
            <Image src="/logo.png" alt="" width={56} height={56} className="object-contain" priority />
          </div>
        </div>
        <div className="text-center">
          <p className="font-fraunces text-2xl text-ink leading-none">Hifzoon</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-gold-600 mt-2">Quran Academy</p>
        </div>
      </div>
    </div>
  );
}
