'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks';
import { BrandLoader } from '@/components/ui/BrandLoader';

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
    <BrandLoader
      variant="fullscreen"
      label="Loading Hifzoon"
      className={`transition-opacity duration-300 ${done ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    />
  );
}
