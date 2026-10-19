import React, { memo } from 'react';
import { MonitorUp, Tag } from 'lucide-react';
import styles from './classroom-demo.module.css';
import { ARABIC_DIGITS, LINES, MISTAKE_SLOT, TAJWEED_LEGEND, WORDS, type MushafLayout, type Word } from './script';
import { BISMILLAH, SOURCE_CAPTION, SURAH_NAME_AR } from './verses';

const AMIRI: React.CSSProperties = { fontFamily: "'Amiri', serif" };

interface WordProps {
  word: Word;
  active: boolean;
  tagged: boolean;
  popover: boolean;
  ripple: boolean;
  tajweed: boolean;
  animate: boolean;
}

/** Memoised so a pointer step only re-renders the two words that changed. */
const MushafWord = memo(function MushafWord({ word, active, tagged, popover, ripple, tajweed, animate }: WordProps) {
  const colour = tajweed && word.rule ? `tajweed-${word.rule}` : '';
  return (
    <span
      data-word={word.index}
      data-active={active ? 'true' : undefined}
      className={`${styles.slot} relative inline-block rounded-md px-1 ${colour} ${
        active
          ? 'bg-[#c49a55]/30 shadow-[0_0_0_1.5px_rgba(196,154,85,0.9)]'
          : tagged
            ? 'bg-[#b4482d]/12 shadow-[inset_0_-2px_0_rgba(180,72,45,0.6)]'
            : ''
      }`}
    >
      {word.text}
      {active && !popover && (
        <span
          dir="ltr"
          className="absolute bottom-full left-1/2 z-10 mb-0.5 flex items-center gap-1 whitespace-nowrap rounded-full border border-[#c49a55]/40 bg-[#0a1f19] px-1.5 py-[1px] font-sans text-[9px] font-medium leading-tight text-[#c49a55] shadow-md"
          style={{ transform: 'translateX(-50%)' }}
        >
          <span className="h-1 w-1 rounded-full bg-emerald-400" />
          Ustadh M. Hamza
        </span>
      )}
      {ripple && animate && (
        <span className={`${styles.ripple} absolute inset-0 rounded-md border-2 border-[#b4482d]`} />
      )}
      {popover && (
        <span
          dir="ltr"
          className={`${animate ? styles.popover : ''} absolute left-1/2 top-full z-20 mt-1 w-max rounded-lg border border-[#b4482d]/30 bg-white px-2 py-1 text-left font-sans leading-tight shadow-lg`}
          style={{ transform: 'translate(-50%, 0)' }}
        >
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#b4482d]">
            <Tag className="h-2.5 w-2.5" />
            Mistake tagged
          </span>
          <span className="block text-[10.5px] text-[#3c4a45]">Harakah · v.2</span>
        </span>
      )}
    </span>
  );
});

function AyahMarker({ n }: { n: number }) {
  return (
    <span
      className="mx-1 inline-flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[#c49a55] bg-[#f6ecd9]/80 align-middle text-[13px] leading-none text-[#a97f3c]"
      style={AMIRI}
    >
      {ARABIC_DIGITS[n]}
    </span>
  );
}

interface MushafProps {
  layout: MushafLayout;
  tajweed: boolean;
  pointer: number | null;
  popover: boolean;
  ripple: boolean;
  tagged: boolean;
  animate: boolean;
}

/** Shared-screen Mushaf page (passive). */
export const MushafShare = memo(function MushafShare({
  layout,
  tajweed,
  pointer,
  popover,
  ripple,
  tagged,
  animate,
}: MushafProps) {
  return (
    <div className="relative flex min-w-0 flex-1 h-full flex-col justify-between rounded-[14px] bg-[#faf7f1] p-4 text-[#10201b] shadow-inner">
      <div className="mb-2 flex items-center justify-between text-[10px] text-[#6b7772]">
        <span className="flex items-center gap-1.5 rounded-full bg-[#0a1f19]/85 px-2 py-0.5 font-medium text-white/90">
          <MonitorUp className="h-3 w-3 text-emerald-300" />
          Ustadh M. Hamza is sharing the Mushaf
        </span>
        <span className="font-medium">{layout === 'madani' ? 'Madani 15-line' : 'IndoPak 16-line'}</span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#c49a55]/50 bg-[#fbf5ea] px-3.5 py-1 text-center shadow-xs">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#c49a55] to-transparent" />
        <div className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#a97f3c]">
          <span>Surah Al-Ikhlas</span>
          <span className="text-[#c49a55]/60">·</span>
          <span dir="rtl" lang="ar" className="text-[16px] normal-case tracking-normal" style={AMIRI}>
            {SURAH_NAME_AR}
          </span>
        </div>
      </div>

      <div dir="rtl" lang="ar" className="my-auto flex flex-1 flex-col justify-center text-center py-2" style={AMIRI}>
        <div className="mb-2 text-[22px] leading-[2] text-[#a97f3c]">{BISMILLAH}</div>
        {LINES[layout].map((ayahs) => (
          <div
            key={`${layout}-${ayahs.join('-')}`}
            className={`${layout === 'madani' ? 'text-[29px] leading-[2.35]' : 'text-[27px] leading-[2.2]'} text-[#142821] tracking-wide`}
          >
            {ayahs.map((ayah) => (
              <React.Fragment key={ayah}>
                {WORDS.filter((w) => w.ayah === ayah).map((w) => (
                  <React.Fragment key={w.index}>
                    <MushafWord
                      word={w}
                      active={pointer === w.index}
                      tagged={tagged && w.index === MISTAKE_SLOT}
                      popover={popover && w.index === MISTAKE_SLOT}
                      ripple={ripple && w.index === MISTAKE_SLOT}
                      tajweed={tajweed}
                      animate={animate}
                    />{' '}
                  </React.Fragment>
                ))}
                <AyahMarker n={ayah} />{' '}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-[#e6dfd1] pt-1.5 text-[9.5px]">
        <span
          className={`flex items-center gap-2.5 text-[#3c4a45] transition-opacity duration-300 ${
            tajweed ? 'opacity-100' : 'opacity-35'
          }`}
        >
          <span className="font-semibold">Tajweed {tajweed ? 'on' : 'off'}</span>
          {TAJWEED_LEGEND.map(({ rule, label }) => (
            <span key={rule} className="inline-flex items-center gap-1">
              <span className={`tajweed-${rule} h-1.5 w-1.5 rounded-full bg-current`} />
              {label}
            </span>
          ))}
        </span>
        <span className="italic text-[#6b7772]">{SOURCE_CAPTION}</span>
      </div>
    </div>
  );
});
