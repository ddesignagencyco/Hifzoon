import React, { memo } from 'react';
import styles from './classroom-demo.module.css';
import { CHAT_SCRIPT, type SlotTag } from './script';

interface SidePanelProps {
  chatCount: number;
  handRaised: boolean;
  tags: readonly SlotTag[];
  animate: boolean;
}

const FROM = {
  teacher: { name: 'Ustadh M. Hamza', cls: 'text-[#c49a55]' },
  parent: { name: 'Umm Yusuf', cls: 'text-sky-300' },
};

/** Chat + lesson card (passive). */
export const SidePanel = memo(function SidePanel({ chatCount, handRaised, tags, animate }: SidePanelProps) {
  const messages = CHAT_SCRIPT.slice(0, chatCount);
  return (
    <div
      className="flex w-[200px] shrink-0 flex-col gap-2 text-[10.5px]"
    >
      {/* Chat */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-hidden rounded-[12px] border border-white/10 bg-white/5 p-2.5">
        <div className="text-[9.5px] uppercase tracking-wider text-white/50">Class chat</div>
        {messages.length === 0 && !handRaised && <div className="text-white/35">No messages yet</div>}
        {messages.map((m) => (
          <div key={m.at} className={animate ? styles.slideIn : undefined}>
            <span className={`font-semibold ${FROM[m.from].cls}`}>{FROM[m.from].name}</span>
            <p className="leading-snug text-white/85">{m.text}</p>
          </div>
        ))}
        {handRaised && (
          <div className={`${animate ? styles.slideIn : ''} text-[10px] italic text-amber-300/90`}>
            Yusuf raised a hand
          </div>
        )}
      </div>

      {/* Lesson card */}
      <div className="space-y-1.5 rounded-[12px] border border-white/10 bg-white/5 p-2.5">
        <div className="flex items-center justify-between text-[9.5px] text-white/55">
          <span className="uppercase tracking-wider">Lesson card</span>
          <span className="font-semibold text-[#c49a55]">Grade: Excellent</span>
        </div>
        <div className="text-[11.5px] font-medium text-white">Sabaq · Al-Ikhlas 1–4</div>
        <div className="flex items-center justify-between text-[9.5px] text-white/55">
          <span>
            Logged corrections (
            <span key={tags.length} className={tags.length > 0 && animate ? styles.bump : undefined}>
              {tags.length}
            </span>
            )
          </span>
        </div>
        {tags.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 px-2 py-1 text-white/35">No corrections yet</div>
        ) : (
          <ul className="space-y-1">
            {tags.slice(-3).map((t) => (
              <li
                key={t.id}
                className={`flex items-center gap-1.5 rounded-lg border border-[#b4482d]/30 bg-[#b4482d]/15 px-2 py-1 text-white/90 ${
                  animate ? styles.slideIn : ''
                }`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e08a72]" />
                <span className="truncate">{t.label}</span>
                <span className="text-white/45">(v.{t.ayah})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

/** Connection readout; isolated so latency changes only re-render this. */
export const ConnectionStatus = memo(function ConnectionStatus({ latency }: { latency: number }) {
  const bars = latency < 200 ? 4 : latency < 300 ? 3 : 2;
  return (
    <div className="flex items-center gap-1.5 text-[9.5px] text-white/60">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      <span className="text-emerald-300">Stable · page sync on</span>
      <span className="flex items-end gap-[2px]">
        {[3, 5, 7, 9].map((h, i) => (
          <span key={h} className={`w-[2.5px] rounded-sm ${i < bars ? 'bg-emerald-400' : 'bg-white/20'}`} style={{ height: h }} />
        ))}
      </span>
      <span className="font-mono tabular-nums">{latency} ms</span>
    </div>
  );
});
