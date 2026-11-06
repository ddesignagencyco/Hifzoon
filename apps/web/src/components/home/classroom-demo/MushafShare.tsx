import React, { memo } from 'react';
import { Languages } from 'lucide-react';
import styles from './classroom-demo.module.css';
import { ARABIC_DIGITS, LINES, MEANING, MISTAKE_SLOT, RECHECK_SLOT, WORDS, type Word } from './script';
import { BISMILLAH, SOURCE_CAPTION, SURAH_NAME_AR } from './verses';

/**
 * Same face as the classroom Mushaf (MushafViewer). It also covers the Urdu meaning, so the
 * homepage does not download the much larger Nastaliq face for two words.
 */
const QURAN: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };

type Mark = 'none' | 'mistake' | 'fixed';

interface WordProps {
  word: Word;
  active: boolean;
  mark: Mark;
  ripple: boolean;
  animate: boolean;
}

/**
 * Memoised so a highlight step only re-renders the two words that changed. Every state
 * uses the same padding and only paints background / inset shadow, so nothing reflows.
 */
const MushafWord = memo(function MushafWord({ word, active, mark, ripple, animate }: WordProps) {
  const paint = active
    ? 'bg-[rgba(196,154,85,0.24)] shadow-[inset_0_0_0_1px_rgba(169,127,60,0.45)]'
    : mark === 'mistake'
      ? 'shadow-[inset_0_-2px_0_rgba(180,72,45,0.85)]'
      : mark === 'fixed'
        ? 'shadow-[inset_0_-2px_0_rgba(42,101,83,0.55)]'
        : '';
  return (
    <span
      data-word={word.index}
      data-active={active ? 'true' : undefined}
      data-mark={mark === 'none' ? undefined : mark}
      className={`${styles.slot} relative inline-block rounded-[6px] px-[3px] ${mark === 'mistake' ? 'text-red' : ''} ${paint}`}
    >
      {word.text}
      {ripple && animate && <span className={`${styles.ripple} absolute inset-0 rounded-[6px] border-2 border-red/70`} />}
    </span>
  );
});

function AyahMarker({ n, compact }: { n: number; compact: boolean }) {
  return (
    <span
      className={`mx-[3px] inline-flex items-center justify-center rounded-full border border-gold/70 align-middle leading-none text-gold-600 ${
        compact ? 'h-[20px] w-[20px] text-[12px]' : 'h-[22px] w-[22px] text-[13px]'
      }`}
      style={QURAN}
    >
      {ARABIC_DIGITS[n]}
    </span>
  );
}

interface MushafProps {
  pointer: number | null;
  ripple: boolean;
  logged: boolean;
  fixed: boolean;
  meaning: boolean;
  animate: boolean;
  compact: boolean;
}

/** The shared Mushaf page (passive): teacher and student see the same page and highlight. */
export const MushafShare = memo(function MushafShare({ pointer, ripple, logged, fixed, meaning, animate, compact }: MushafProps) {
  const markOf = (i: number): Mark =>
    i === MISTAKE_SLOT && logged ? 'mistake' : i === RECHECK_SLOT && fixed ? 'fixed' : 'none';

  return (
    <div
      className={`relative flex h-full min-w-0 flex-1 flex-col rounded-[12px] bg-cream text-ink shadow-[0_0_0_1px_rgba(230,223,209,0.9)] ${
        compact ? 'px-3 pb-2 pt-2.5' : 'px-4 pb-2.5 pt-3'
      }`}
    >
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-line pb-1.5 text-[10.5px] text-muted">
        <span className="font-medium text-ink-2">Al-Ikhlas · 112</span>
        <span dir="rtl" lang="ar" className="text-[15px] leading-none text-gold-600" style={QURAN}>
          {SURAH_NAME_AR}
        </span>
        <span>Madani · p. 604</span>
      </div>

      {/* Verses */}
      <div dir="rtl" lang="ar" className="flex flex-1 flex-col justify-center text-center" style={QURAN}>
        <div className={`${compact ? 'mb-0.5 text-[17px]' : 'mb-1 text-[19px]'} leading-[2] text-gold-600`}>{BISMILLAH}</div>
        {LINES.map((ayahs) => (
          <div
            key={ayahs.join('-')}
            className={`${compact ? 'text-[21px] leading-[1.9]' : 'text-[26px] leading-[2.05]'} text-[#142821]`}
          >
            {ayahs.map((ayah) => (
              <React.Fragment key={ayah}>
                {WORDS.filter((w) => w.ayah === ayah).map((w) => (
                  <React.Fragment key={w.index}>
                    <MushafWord
                      word={w}
                      active={pointer === w.index}
                      mark={markOf(w.index)}
                      ripple={ripple && w.index === MISTAKE_SLOT}
                      animate={animate}
                    />{' '}
                  </React.Fragment>
                ))}
                <AyahMarker n={ayah} compact={compact} />{' '}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>

      {/* Footer: fixed height; the word meaning cross-fades over the source line. */}
      <div className={`relative shrink-0 border-t border-line ${compact ? 'h-[34px]' : 'h-[30px]'}`}>
        <div
          className={`absolute inset-0 flex items-center justify-center text-[10.5px] italic text-muted transition-opacity duration-300 ${
            meaning ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {SOURCE_CAPTION}
        </div>
        <div
          className={`absolute inset-0 flex items-center gap-2 transition-[opacity,transform] duration-300 ${
            meaning ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          } ${compact ? 'justify-between' : 'justify-center'}`}
        >
          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-700">
            <Languages className="h-3 w-3" aria-hidden="true" />
            {compact ? 'Meaning' : 'Word meaning'}
          </span>
          <span dir="rtl" lang="ar" className="text-[16px] leading-none text-ink" style={QURAN}>
            {WORDS[MISTAKE_SLOT].text}
          </span>
          <span className="text-[11.5px] text-ink-2">{MEANING.en}</span>
          <span className="text-line">|</span>
          <span dir="rtl" lang="ur" className="text-[15px] leading-none text-ink-2" style={QURAN}>
            {MEANING.ur}
          </span>
        </div>
      </div>
    </div>
  );
});
