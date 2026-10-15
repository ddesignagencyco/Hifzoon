'use client';

import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { TICK_MS } from './script';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(cb: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(REDUCE_QUERY);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

function getReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCE_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
}

function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== 'hidden',
    () => true,
  );
}

/** True while the element is (near) the viewport. Assumes visible where IO is unsupported. */
function useInView(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // Older browsers / jsdom: no observer, so just run.
      const id = window.setTimeout(() => setInView(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: '80px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/**
 * Monotonic tick counter that advances every TICK_MS while the demo is on-screen,
 * the tab is visible, and the user has not asked for reduced motion.
 */
export function useDemoClock(ref: RefObject<Element | null>, paused = false) {
  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const inView = useInView(ref);
  const running = !paused && !reducedMotion && pageVisible && inView;
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTicks((n) => n + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [running]);

  return { ticks, reducedMotion, running };
}
