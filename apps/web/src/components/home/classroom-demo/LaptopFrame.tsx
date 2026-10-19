'use client';

import React, { useEffect, useRef, useState } from 'react';

/** Fixed design size of the meeting UI; scaled to fit the 16:10 display. */
export const CANVAS_W = 800;
export const CANVAS_H = 500;

/**
 * CSS-only device frame with a fixed 16:10 display. On phones (< sm) it renders as
 * a landscape tablet (all-round bezel, no base); from sm up it is a laptop with
 * camera dot, hinge and aluminium base with trackpad notch. The children are laid
 * out on an 800×500 canvas and scaled with a transform, so nothing scrolls inside.
 */
export function LaptopFrame({ children }: { children: React.ReactNode }) {
  const displayRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = displayRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / CANVAS_W);
    };
    if (typeof ResizeObserver === 'undefined') {
      const id = window.setTimeout(measure, 0);
      return () => window.clearTimeout(id);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[480px] sm:max-w-[740px]">
      {/* Tablet Display Frame */}
      <div className="relative mx-auto w-full rounded-[22px] sm:rounded-[26px] bg-[#141718] p-2.5 sm:p-3 shadow-[0_32px_64px_-16px_rgba(10,31,25,0.45)] ring-1 ring-white/10">
        <div className="pointer-events-none absolute inset-[1px] rounded-[21px] sm:rounded-[25px] ring-1 ring-white/[0.06]" />
        
        {/* Centered Top Camera Dot */}
        <div className="absolute top-[6px] left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
          <span className="block h-[5px] w-[5px] rounded-full bg-[#0a0d0e] ring-1 ring-white/15">
            <span className="block h-[2px] w-[2px] translate-x-[1.5px] translate-y-[1.5px] rounded-full bg-[#1d3b52]" />
          </span>
          <span className="block h-[2.5px] w-[2.5px] rounded-full bg-emerald-400/80" />
        </div>

        {/* Display: fixed 16:10 */}
        <div
          ref={displayRef}
          className="relative aspect-[16/10] w-full overflow-hidden rounded-[14px] sm:rounded-[18px] bg-[#0a1f19]"
        >
          <div
            className="absolute left-0 top-0 origin-top-left transition-opacity duration-300"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${scale ?? 0.8})`,
              opacity: scale === null ? 0 : 1,
            }}
          >
            {children}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0)_38%)]" />
        </div>
      </div>

      {/* Ambient Surface Glow & Depth Shadow */}
      <div className="mx-auto mt-4 h-4 w-[85%] rounded-[50%] bg-[#0a1f19]/20 blur-xl pointer-events-none" aria-hidden="true" />
    </div>
  );
}
