import React, { memo } from 'react';
import { Eye, Mic, MicOff, Sparkles, Users, VideoOff } from 'lucide-react';
import styles from './classroom-demo.module.css';
import type { Speaker } from './script';

/* ------------------------------------------------------------------ */
/* Top bar: class title, live timer, recording, participants           */
/* (status only, nothing here is clickable)                            */
/* ------------------------------------------------------------------ */

export const MeetingTopBar = memo(function MeetingTopBar({ timer, animate }: { timer: string; animate: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-2.5 py-2 @min-[560px]:px-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#c49a55] text-[10px] font-bold text-[#0a1f19]">
          H
        </span>
        <span className="truncate text-[11px] @min-[560px]:text-[12px] font-semibold text-white">
          Hifz · Surah Al-Ikhlas
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-[9.5px] @min-[560px]:text-[10.5px]">
        <span className="flex items-center gap-1 rounded-full border border-red-800/30 bg-red-950/40 px-1.5 py-[1px] font-mono text-red-300">
          <span className={`h-1.5 w-1.5 rounded-full bg-red-500 ${animate ? 'animate-pulse' : ''}`} />
          Live · {timer}
        </span>
        <span className="hidden @min-[420px]:flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-[1px] text-white/70">
          <span className="h-1.5 w-1.5 rounded-full border border-red-400" />
          REC
        </span>
        <span className="flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-[1px] text-white/70">
          <Users className="h-2.5 w-2.5" />3
        </span>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Video tiles                                                         */
/* ------------------------------------------------------------------ */

interface TileProps {
  initials: string;
  name: string;
  size: 'lg' | 'md' | 'sm';
  tone: 'green' | 'sand' | 'slate';
  speaking: boolean;
  micOn: boolean;
  camOn: boolean;
  animate: boolean;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}

const SIZES = {
  lg: 'h-[58px] w-[92px] @min-[560px]:h-[66px] @min-[560px]:w-[112px]',
  md: 'h-[50px] w-[76px] @min-[560px]:h-[56px] @min-[560px]:w-[90px]',
  sm: 'h-[42px] w-[60px] @min-[560px]:h-[46px] @min-[560px]:w-[70px]',
};

const TONES = {
  green: { bg: 'from-[#1c4c3e] to-[#0f2c24]', avatar: 'bg-[#c49a55] text-[#0a1f19]' },
  sand: { bg: 'from-[#5b4a33] to-[#2b241a]', avatar: 'bg-[#f6ecd9] text-[#5b4a33]' },
  slate: { bg: 'from-[#34413d] to-[#1a2420]', avatar: 'bg-[#e6dfd1] text-[#3c4a45]' },
};

const VideoTile = memo(function VideoTile({
  initials,
  name,
  size,
  tone,
  speaking,
  micOn,
  camOn,
  animate,
  badge,
  children,
}: TileProps) {
  const t = TONES[tone];
  return (
    <div
      className={`relative shrink-0 rounded-lg ${SIZES[size]} ${
        speaking ? `ring-2 ring-emerald-400 ${animate ? styles.speaking : ''}` : 'ring-1 ring-white/10'
      }`}
      data-speaking={speaking ? 'true' : 'false'}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg ${
          camOn ? `bg-gradient-to-br ${t.bg}` : 'bg-[#111816]'
        }`}
      >
        {camOn ? (
          <span
            className={`flex items-center justify-center rounded-full font-semibold ${t.avatar} ${
              size === 'lg' ? 'h-8 w-8 text-[11px]' : size === 'md' ? 'h-7 w-7 text-[10px]' : 'h-6 w-6 text-[9px]'
            }`}
          >
            {initials}
          </span>
        ) : (
          <VideoOff className="h-4 w-4 text-white/35" />
        )}
      </div>
      {badge}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 rounded-b-lg bg-black/45 px-1 py-[1px]">
        <span className="truncate text-[7.5px] @min-[560px]:text-[8.5px] text-white/90">{name}</span>
        {micOn ? (
          <Mic className={`h-2 w-2 shrink-0 ${speaking ? 'text-emerald-300' : 'text-white/60'}`} />
        ) : (
          <MicOff className="h-2 w-2 shrink-0 text-red-300" />
        )}
      </div>
      {children}
    </div>
  );
});

interface StageProps {
  speaker: Speaker;
  studentMicOn: boolean;
  studentCamOn: boolean;
  handRaised: boolean;
  reaction: boolean;
  animate: boolean;
}

/** Filmstrip of participants. Status only; controls live in the control bar. */
export const VideoStage = memo(function VideoStage({
  speaker,
  studentMicOn,
  studentCamOn,
  handRaised,
  reaction,
  animate,
}: StageProps) {
  return (
    <div className="flex items-end gap-2">
      <VideoTile
        initials="MH"
        name="Ustadh M. Hamza"
        size="lg"
        tone="green"
        speaking={speaker === 'teacher'}
        micOn
        camOn
        animate={animate}
        badge={
          <span className="absolute left-1 top-1 rounded bg-[#c49a55] px-1 text-[7px] font-bold uppercase tracking-wide text-[#0a1f19]">
            Host
          </span>
        }
      />
      <VideoTile
        initials="YA"
        name="Yusuf (you)"
        size="md"
        tone="sand"
        speaking={speaker === 'student' && studentMicOn}
        micOn={studentMicOn}
        camOn={studentCamOn}
        animate={animate}
        badge={
          handRaised ? (
            <span className="absolute right-1 top-1 rounded bg-amber-400 px-1 text-[7px] font-bold text-[#0a1f19]">
              Hand raised
            </span>
          ) : undefined
        }
      />
      <VideoTile
        initials="UY"
        name="Umm Yusuf"
        size="sm"
        tone="slate"
        speaking={false}
        micOn={false}
        camOn
        animate={animate}
        badge={
          <span className="absolute left-1 top-1 flex items-center gap-0.5 rounded bg-white/15 px-1 text-[6.5px] font-semibold uppercase tracking-wide text-white/85">
            <Eye className="h-2 w-2" />
            Watch-only
          </span>
        }
      >
        {reaction && (
          <span
            className={`${animate ? styles.reaction : ''} pointer-events-none absolute -top-6 right-0 z-10 flex items-center gap-1 whitespace-nowrap rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#0a1f19] shadow-md`}
          >
            MashaAllah <Sparkles className="h-2.5 w-2.5 text-[#c49a55]" />
          </span>
        )}
      </VideoTile>
    </div>
  );
});
