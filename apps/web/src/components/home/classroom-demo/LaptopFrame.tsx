'use client';

import React, { useEffect, useRef, useState } from 'react';

/** Fixed design sizes of the meeting UI; scaled with a transform to fit the display. */
export const CANVAS = {
  /** 16:10 laptop screen (sm and up). */
  wide: { w: 720, h: 450 },
  /** Upright tablet, 18:25 (phones). */
  compact: { w: 360, h: 500 },
} as const;

/**
 * CSS-only device frame. The display's aspect ratio comes from CSS (18:25 below sm,
 * 16:10 from sm), so the frame never changes height while the demo plays or hydrates.
 * The children are laid out on a fixed canvas and scaled to the display width.
 */
export function LaptopFrame({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  const displayRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const canvas = compact ? CANVAS.compact : CANVAS.wide;

  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };
    if (typeof ResizeObserver === 'undefined') {
      const id = window.setTimeout(measure, 0);
      return () => window.clearTimeout(id);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = width === null ? null : width / canvas.w;

  return (
    <div className="relative mx-auto w-full max-w-[400px] sm:max-w-[760px]">
      <div className="relative rounded-[24px] bg-[#121615] p-2.5 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_30px_60px_-24px_rgba(10,31,25,0.5),0_12px_24px_-12px_rgba(10,31,25,0.25)] ring-1 ring-black/40 sm:rounded-[22px] sm:p-3">
        <span
          className="absolute left-1/2 top-[5px] block h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[#050707] ring-1 ring-white/10"
          aria-hidden="true"
        />
        <div
          ref={displayRef}
          className="relative aspect-[18/25] w-full overflow-hidden rounded-[14px] bg-green-950 sm:aspect-[16/10] sm:rounded-[12px]"
        >
          <div
            className="absolute left-0 top-0 origin-top-left transition-opacity duration-500"
            style={{
              width: canvas.w,
              height: canvas.h,
              transform: `scale(${scale ?? 1})`,
              opacity: scale === null ? 0 : 1,
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <div className="pointer-events-none mx-auto mt-3 h-3 w-[80%] rounded-[50%] bg-green-950/15 blur-lg" aria-hidden="true" />
    </div>
  );
}
