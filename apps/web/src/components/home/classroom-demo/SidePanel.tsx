import React, { memo } from 'react';
import { Check, NotebookPen, RotateCcw } from 'lucide-react';
import styles from './classroom-demo.module.css';
import { EARLIER_MISTAKE, TODAY_MISTAKE, WORDS, type Scene } from './script';

const QURAN: React.CSSProperties = { fontFamily: "var(--font-quran), 'Amiri Quran', 'Amiri', serif" };

const TABS: { scene: Scene; label: string }[] = [
  { scene: 'recheck', label: 'Recheck' },
  { scene: 'log', label: 'Mistakes' },
  { scene: 'card', label: 'Lesson card' },
];

interface SidePanelProps {
  scene: Scene;
  pressing: boolean;
  fixed: boolean;
  logged: boolean;
  cardRows: number;
  animate: boolean;
  compact: boolean;
}

/** A mistake row: the word in Quran script, where it is and what kind. */
function MistakeRow({
  slot,
  where,
  type,
  tone,
  trailing,
}: {
  slot: number;
  where: string;
  type: string;
  tone: 'open' | 'fixed';
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        dir="rtl"
        lang="ar"
        className={`flex h-[34px] min-w-[52px] items-center justify-center rounded-[8px] px-1.5 text-[17px] leading-none ${
          tone === 'open' ? 'bg-[#e0563b]/12 text-[#f2b4a3]' : 'bg-emerald-400/10 text-emerald-200'
        }`}
        style={QURAN}
      >
        {WORDS[slot].text}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-medium tabular-nums text-white">Ayah {where}</p>
        <p className="truncate text-[10.5px] text-white/60">{type}</p>
      </div>
      {trailing}
    </div>
  );
}

function RecheckScene({ pressing, fixed, compact }: { pressing: boolean; fixed: boolean; compact: boolean }) {
  return (
    <div className="space-y-2.5">
      {!compact && <p className="text-[10.5px] leading-snug text-white/55">Open from the last class. Hear it again, then mark it.</p>}
      <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.04] p-2.5">
        <MistakeRow
          slot={EARLIER_MISTAKE.slot}
          where={EARLIER_MISTAKE.ref}
          type={EARLIER_MISTAKE.type}
          tone={fixed ? 'fixed' : 'open'}
          trailing={
            compact ? <RecheckActions pressing={pressing} fixed={fixed} compact /> : undefined
          }
        />
        {!compact && (
          <div className="mt-2.5">
            <RecheckActions pressing={pressing} fixed={fixed} compact={false} />
          </div>
        )}
      </div>
    </div>
  );
}

function RecheckActions({ pressing, fixed, compact }: { pressing: boolean; fixed: boolean; compact: boolean }) {
  // Same box for both states so the swap never shifts anything.
  return (
    <div className={`relative h-[26px] ${compact ? 'w-[92px]' : 'w-full'}`}>
      <div
        className={`absolute inset-0 flex gap-1.5 transition-opacity duration-300 ${fixed ? 'opacity-0' : 'opacity-100'}`}
      >
        <span
          className={`flex flex-1 items-center justify-center gap-1 rounded-[7px] bg-white text-[10.5px] font-semibold text-green-800 transition-transform duration-150 ${
            pressing ? 'scale-[0.96] bg-gold-100' : ''
          }`}
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Mark fixed
        </span>
        {!compact && (
          <span className="flex flex-1 items-center justify-center gap-1 rounded-[7px] border border-white/15 text-[10.5px] font-medium text-white/75">
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Still wrong
          </span>
        )}
      </div>
      <div
        className={`absolute inset-0 flex items-center gap-1.5 text-[11px] font-medium text-emerald-300 transition-opacity duration-300 ${
          fixed ? 'opacity-100' : 'opacity-0'
        } ${compact ? 'justify-end' : ''}`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Marked fixed
      </div>
    </div>
  );
}

function LogScene({ logged, animate, compact }: { logged: boolean; animate: boolean; compact: boolean }) {
  return (
    <div className="space-y-2">
      {!compact && <p className="px-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">This class</p>}
      {logged ? (
        <div className={`rounded-[10px] border border-[#e0563b]/25 bg-[#e0563b]/[0.07] p-2.5 ${animate ? styles.rise : ''}`}>
          <MistakeRow
            slot={TODAY_MISTAKE.slot}
            where={TODAY_MISTAKE.ref}
            type={TODAY_MISTAKE.type}
            tone="open"
          />
        </div>
      ) : (
        <div className="flex h-[56px] items-center justify-center rounded-[10px] border border-dashed border-white/15 px-3 text-center text-[11px] text-white/55">
          Tap a word on the page to log a mistake
        </div>
      )}
      {!compact && (
        <>
          <p className="px-0.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">Rechecked today</p>
          <div className="rounded-[10px] border border-white/[0.06] p-2.5">
            <MistakeRow
              slot={EARLIER_MISTAKE.slot}
              where={EARLIER_MISTAKE.ref}
              type={EARLIER_MISTAKE.type}
              tone="fixed"
              trailing={<Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />}
            />
          </div>
        </>
      )}
    </div>
  );
}

const CARD_ROWS: { label: string; value: string }[] = [
  { label: 'Sabaq', value: 'Al-Ikhlas 112:1–4 · Good' },
  { label: 'Mistakes', value: `1 · ${TODAY_MISTAKE.type}, ${TODAY_MISTAKE.ref}` },
  { label: 'Homework', value: 'Recite 112:1–4 five times' },
  { label: 'Practice set', value: '112:1–4 · due in 3 days' },
];

function CardScene({ rows, animate, compact }: { rows: number; animate: boolean; compact: boolean }) {
  return (
    <div className={`rounded-[10px] bg-cream text-ink ${compact ? 'px-2.5 py-1.5' : 'p-2.5'}`}>
      {!compact && (
        <div className="mb-1.5 flex items-center justify-between border-b border-line pb-1.5">
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold">
            <NotebookPen className="h-3.5 w-3.5 text-green-700" aria-hidden="true" />
            Yusuf · today
          </span>
          <span className="text-[10px] text-muted">For parents</span>
        </div>
      )}
      <dl className={compact ? 'grid grid-cols-2 gap-x-3 gap-y-1' : 'space-y-1.5'}>
        {CARD_ROWS.map((r, i) => (
          <div
            key={r.label}
            className={`transition-opacity duration-300 ${i < rows ? 'opacity-100' : 'opacity-0'} ${
              i < rows && animate ? styles.rise : ''
            }`}
          >
            <dt className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">{r.label}</dt>
            <dd className={`m-0 leading-snug text-ink-2 ${compact ? 'truncate text-[10.5px]' : 'text-[11.5px]'}`}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The teacher's side panel (passive): Recheck → log a mistake → lesson card. */
export const SidePanel = memo(function SidePanel({ scene, pressing, fixed, logged, cardRows, animate, compact }: SidePanelProps) {
  return (
    <div
      className={`flex min-h-0 flex-col rounded-[12px] border border-white/[0.07] bg-white/[0.035] ${
        compact ? 'h-[136px] p-2' : 'flex-1 p-2.5'
      }`}
    >
      {/* Segmented header; it only shows which part the teacher is on. */}
      <div className="mb-2 flex shrink-0 rounded-[8px] bg-black/20 p-[3px]">
        {TABS.map((tab) => (
          <span
            key={tab.scene}
            className={`flex-auto rounded-[6px] px-1.5 py-[3px] text-center text-[10.5px] font-medium transition-colors duration-300 ${
              scene === tab.scene ? 'bg-white/[0.12] text-white' : 'text-white/50'
            }`}
          >
            {tab.label}
          </span>
        ))}
      </div>
      <div key={scene} className={`min-h-0 flex-1 ${animate ? styles.fade : ''}`}>
        {scene === 'recheck' && <RecheckScene pressing={pressing} fixed={fixed} compact={compact} />}
        {scene === 'log' && <LogScene logged={logged} animate={animate} compact={compact} />}
        {scene === 'card' && <CardScene rows={cardRows} animate={animate} compact={compact} />}
      </div>
    </div>
  );
});
