import React, { memo } from 'react';
import styles from './classroom-demo.module.css';
import type { Speaker } from './script';

/* ------------------------------------------------------------------ */
/* Top bar: class title, quiet Live indicator and session timer        */
/* (status only, nothing here is clickable)                            */
/* ------------------------------------------------------------------ */

export const MeetingTopBar = memo(function MeetingTopBar({
  timer,
  animate,
  compact,
}: {
  timer: string;
  animate: boolean;
  compact: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-between border-b border-white/[0.07] ${
        compact ? 'h-[38px] px-3' : 'h-[40px] px-3.5'
      }`}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[12.5px] font-semibold text-white">Hifz class</span>
        <span className="truncate text-[11.5px] text-white/55">Surah Al-Ikhlas</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11.5px]">
        <span className="flex items-center gap-1.5 font-medium text-white/85">
          <span className={`h-[6px] w-[6px] rounded-full bg-[#e0563b] ${animate ? styles.liveDot : ''}`} />
          Live
        </span>
        <span className="text-white/25">·</span>
        <span className="tabular-nums text-white/60">{timer}</span>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Video tiles                                                         */
/* ------------------------------------------------------------------ */

const TONES = {
  teacher: { bg: 'bg-[radial-gradient(120%_90%_at_50%_20%,#2a6553_0%,#143a2f_55%,#0f2c24_100%)]', avatar: 'bg-gold-100 text-green-800' },
  student: { bg: 'bg-[radial-gradient(120%_90%_at_50%_20%,#6f5a3c_0%,#3f3323_55%,#2b241a_100%)]', avatar: 'bg-sand text-[#5b4a33]' },
};

interface TileProps {
  initials: string;
  name: string;
  tone: keyof typeof TONES;
  speaking: boolean;
  animate: boolean;
  compact: boolean;
}

/** One participant. A soft "camera" gradient with an avatar stands in for live video. */
const VideoTile = memo(function VideoTile({ initials, name, tone, speaking, animate, compact }: TileProps) {
  const t = TONES[tone];
  return (
    <div
      className={`relative min-w-0 flex-1 overflow-hidden rounded-[10px] ${t.bg} ${compact ? 'h-[58px]' : 'h-[92px]'}`}
      data-speaking={speaking ? 'true' : 'false'}
    >
      {/* Avatar with a faint shoulder silhouette, so the tile reads as a camera frame. */}
      <div className="absolute inset-x-0 bottom-0 mx-auto h-[38%] w-[58%] rounded-t-[999px] bg-black/15" aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center pb-3">
        <span
          className={`flex ${compact ? 'h-[28px] w-[28px]' : 'h-[34px] w-[34px]'} items-center justify-center rounded-full text-[11px] font-semibold ${t.avatar}`}
        >
          {initials}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1 pt-3">
        <span className="truncate text-[10.5px] font-medium text-white/95">{name}</span>
        <span className="flex h-3 shrink-0 items-end gap-[2px]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`block h-3 w-[2px] origin-bottom rounded-full ${speaking ? 'bg-emerald-300' : 'bg-white/45'} ${
                  speaking && animate ? styles.bar : styles.barIdle
                }`}
                style={{ animationDelay: `${i * 140}ms` }}
              />
            ))}
        </span>
      </div>
      {/* Speaking ring: drawn inside the tile, so it never changes the layout. */}
      <div
        className={`pointer-events-none absolute inset-0 rounded-[10px] transition-shadow duration-300 ${
          speaking ? 'shadow-[inset_0_0_0_1.5px_rgba(110,231,183,0.85)]' : 'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
        }`}
      />
    </div>
  );
});

/** Teacher and student tiles, side by side. Status only. */
export const VideoStage = memo(function VideoStage({
  speaker,
  animate,
  compact,
}: {
  speaker: Speaker;
  animate: boolean;
  compact: boolean;
}) {
  return (
    <div className="flex shrink-0 gap-2">
      <VideoTile
        initials="MH"
        name="Ustadh Hamza"
        tone="teacher"
        speaking={speaker === 'teacher'}
        animate={animate}
        compact={compact}
      />
      <VideoTile
        initials="YA"
        name="Yusuf"
        tone="student"
        speaking={speaker === 'student'}
        animate={animate}
        compact={compact}
      />
    </div>
  );
});
