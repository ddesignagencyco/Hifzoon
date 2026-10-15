'use client';

import React, { useId, useMemo, useRef } from 'react';
import { LaptopFrame } from './LaptopFrame';
import { MeetingTopBar, VideoStage } from './MeetingChrome';
import { MushafShare } from './MushafShare';
import { ConnectionStatus, SidePanel } from './SidePanel';
import { useDemoClock } from './useDemoClock';
import { LOOP_TICKS, MISTAKE_SLOT, STATIC_TICK, formatTimer, frameAt, latencyAt, type SlotTag } from './script';

const SCRIPTED_TAG: SlotTag = { id: 1, slot: MISTAKE_SLOT, ayah: 2, label: 'Harakah' };
const NO_TAGS: SlotTag[] = [];
const ONE_TAG: SlotTag[] = [SCRIPTED_TAG];

/**
 * Passive, auto-playing classroom "video" inside the laptop. Owns the demo clock so
 * only this subtree re-renders per tick; children are memoised. Nothing in the device
 * is interactive or focusable: it is aria-hidden and described by the figcaption.
 */
export function LiveClassroom() {
  const rootRef = useRef<HTMLDivElement>(null);
  const descId = useId();
  const { ticks, reducedMotion } = useDemoClock(rootRef);
  const animate = !reducedMotion;

  const frame = frameAt(reducedMotion ? STATIC_TICK : ticks % LOOP_TICKS);
  const timer = formatTimer(reducedMotion ? 0 : ticks);
  const latency = latencyAt(reducedMotion ? 0 : ticks);
  const tags = useMemo(() => (frame.corrections > 0 ? ONE_TAG : NO_TAGS), [frame.corrections]);

  return (
    <figure className="m-0 min-w-0" aria-describedby={descId}>
      <div
        ref={rootRef}
        aria-hidden="true"
        data-testid="classroom-live-device"
        data-state={reducedMotion ? 'static' : 'live'}
        className="pointer-events-none select-none"
      >
        <LaptopFrame>
          <div className="@container flex h-full flex-col text-white">
            <MeetingTopBar timer={timer} animate={animate} />

            <div className="flex min-h-0 flex-1 gap-2.5 p-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-end justify-between gap-2 pt-4">
                  <VideoStage
                    speaker={frame.speaker}
                    studentMicOn
                    studentCamOn
                    handRaised={false}
                    reaction={frame.reaction}
                    animate={animate}
                  />
                  <ConnectionStatus latency={latency} />
                </div>
                <MushafShare
                  layout={frame.layout}
                  tajweed={frame.tajweed}
                  pointer={frame.pointer}
                  popover={frame.popover}
                  ripple={frame.tapping}
                  tagged={frame.corrections > 0}
                  animate={animate}
                />
              </div>
              <SidePanel chatCount={frame.chatCount} handRaised={false} tags={tags} animate={animate} />
            </div>
          </div>
        </LaptopFrame>
      </div>
      <figcaption id={descId} className="sr-only">
        Illustration of a live Hifzoon class in a video meeting on a laptop: the teacher, Ustadh M. Hamza, a student and
        a watch-only parent appear in video tiles while the teacher shares the Mushaf and his pointer moves word by word
        through Surah Al-Ikhlas, verses 1 to 4, in a Madani or IndoPak layout with an optional Tajweed colour overlay.
        The teacher tags a vowel (harakah) mistake on verse 2, which is logged on the lesson card, and the class chat
        shows short messages. The connection reads stable with page sync on and latency under 500 milliseconds.
      </figcaption>
    </figure>
  );
}
