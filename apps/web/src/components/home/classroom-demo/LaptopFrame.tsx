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
    <div className="relative mx-auto w-full max-w-[460px] sm:max-w-[720px]">
      {/* Lid */}
      <div className="relative mx-auto w-full sm:w-[90%] rounded-[22px] sm:rounded-b-[6px] sm:rounded-t-[18px] bg-[#16191a] p-2.5 sm:p-2.5 sm:pt-5 shadow-[0_30px_60px_-24px_rgba(10,31,25,0.55)] ring-1 ring-black/50">
        <div className="pointer-events-none absolute inset-[1px] rounded-[21px] sm:rounded-b-[5px] sm:rounded-t-[17px] ring-1 ring-white/[0.06]" />
        {/* Camera: top on laptop, left edge on landscape tablet */}
        <div className="absolute left-[5px] top-1/2 -translate-y-1/2 sm:left-1/2 sm:top-[7px] sm:-translate-x-1/2 sm:translate-y-0 flex items-center gap-1.5">
          <span className="block h-[6px] w-[6px] rounded-full bg-[#0c0f10] ring-1 ring-white/10">
            <span className="block h-[2.5px] w-[2.5px] translate-x-[2px] translate-y-[2px] rounded-full bg-[#1d3b52]" />
          </span>
          <span className="hidden sm:block h-[3px] w-[3px] rounded-full bg-emerald-400/70" />
        </div>
        {/* Display: fixed 16:10 */}
        <div
          ref={displayRef}
          className="relative aspect-[16/10] w-full overflow-hidden rounded-[12px] sm:rounded-[4px] bg-[#0a1f19]"
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

      {/* Hinge */}
      <div className="hidden sm:block mx-auto h-[6px] w-[88%] bg-gradient-to-b from-[#0d0f10] to-[#3a3f40]" />

      {/* Base seen front-on */}
      <div className="hidden sm:block relative mx-auto h-[14px] w-full rounded-b-[16px] rounded-t-[4px] bg-gradient-to-b from-[#e4e1da] via-[#cfcbc2] to-[#a7a399] shadow-[0_18px_30px_-12px_rgba(10,31,25,0.45)]">
        <div className="absolute left-1/2 top-0 h-[5px] w-[18%] -translate-x-1/2 rounded-b-[8px] bg-gradient-to-b from-[#a6a298] to-[#bdb9b0]" />
        <div className="absolute inset-x-[2%] top-0 h-px bg-white/70" />
      </div>
      <div className="hidden sm:block mx-auto mt-1 h-3 w-[80%] rounded-[50%] bg-[#0a1f19]/15 blur-md" />
    </div>
  );
}
