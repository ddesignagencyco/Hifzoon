'use client';

import React, { useId, useRef, useSyncExternalStore } from 'react';
import { LaptopFrame } from './LaptopFrame';
import { MeetingTopBar, VideoStage } from './MeetingChrome';
import { MushafShare } from './MushafShare';
import { SidePanel } from './SidePanel';
import { useDemoClock } from './useDemoClock';
import { LOOP_TICKS, STATIC_TICK, formatTimer, frameAt } from './script';

/** Same breakpoint as Tailwind's `sm`, which also switches the frame's aspect ratio. */
const WIDE_QUERY = '(min-width: 640px)';

function subscribeWide(cb: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}

function getWide() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(WIDE_QUERY).matches;
}

/**
 * Passive, auto-playing classroom "video" inside the laptop. Owns the demo clock so
 * only this subtree re-renders per tick; children are memoised. Nothing in the device
 * is interactive or focusable: it is aria-hidden and described by the figcaption.
 * Phones get an upright layout (video tiles, page, then the panel) instead of a
 * shrunken laptop screen, so the text stays readable.
 */
export function LiveClassroom() {
  const rootRef = useRef<HTMLDivElement>(null);
  const descId = useId();
  const { ticks, reducedMotion } = useDemoClock(rootRef);
  const compact = !useSyncExternalStore(subscribeWide, getWide, () => true);
  const animate = !reducedMotion;

  const frame = frameAt(reducedMotion ? STATIC_TICK : ticks % LOOP_TICKS);
  const timer = formatTimer(reducedMotion ? 0 : ticks);

  const mushaf = (
    <MushafShare
      pointer={frame.pointer}
      ripple={frame.tapping}
      logged={frame.logged}
      fixed={frame.fixed}
      meaning={frame.meaning}
      animate={animate}
      compact={compact}
    />
  );
  const video = <VideoStage speaker={frame.speaker} animate={animate} compact={compact} />;
  const panel = (
    <SidePanel
      scene={frame.scene}
      pressing={frame.pressing}
      fixed={frame.fixed}
      logged={frame.logged}
      cardRows={frame.cardRows}
      animate={animate}
      compact={compact}
    />
  );

  return (
    <figure className="m-0 min-w-0" aria-describedby={descId}>
      <div
        ref={rootRef}
        aria-hidden="true"
        data-testid="classroom-live-device"
        data-state={reducedMotion ? 'static' : 'live'}
        data-layout={compact ? 'compact' : 'wide'}
        className="pointer-events-none select-none"
      >
        <LaptopFrame compact={compact}>
          <div className="flex h-full flex-col bg-green-950 text-white">
            <MeetingTopBar timer={timer} animate={animate} compact={compact} />
            {compact ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
                {video}
                {mushaf}
                {panel}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
                {mushaf}
                <div className="flex w-[224px] shrink-0 flex-col gap-2">
                  {video}
                  {panel}
                </div>
              </div>
            )}
          </div>
        </LaptopFrame>
      </div>
      <figcaption id={descId} className="sr-only">
        Illustration of a live Hifzoon class. The teacher, Ustadh Hamza, and a student, Yusuf, appear in video tiles
        while both follow the same Mushaf page of Surah Al-Ikhlas, verses 1 to 4, with the recited word highlighted.
        The teacher rechecks a mistake from the last class and marks it fixed, taps a word to log a vowel (harakah)
        mistake on verse 2, and opens its meaning in English and Urdu. The lesson card then fills in with the sabaq,
        the mistake, homework and a practice set for home.
      </figcaption>
    </figure>
  );
}
