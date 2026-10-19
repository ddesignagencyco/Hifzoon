'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dependency-free SVG/CSS charts for the family portal.
 * Palette validated with the dataviz validator (light surface, all checks pass;
 * the green/amber pair sits in the CVD 6–8 band, so every chart also has a legend,
 * 2px gaps between segments and a table view as secondary encoding).
 */
export const SERIES_COLORS = {
  solid: '#1d8a5e',
  inProgress: '#4f74c4',
  fragile: '#c27a1a',
} as const;

export const SINGLE_SERIES_COLOR = '#1d8a5e';

export interface StackSeries<K extends string = string> {
  key: K;
  label: string;
  color: string;
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const step = n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function Legend<K extends string>({ series }: { series: Array<StackSeries<K>> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Stacked vertical bars (one per category) with a hover/focus tooltip, a legend and
 * a table toggle. Bars are buttons so keyboard users get the same tooltip.
 */
export function StackedBarChart<T extends object>({
  title,
  data,
  series,
  categoryKey,
  formatCategory,
  unit = '',
}: {
  title: string;
  data: T[];
  series: Array<StackSeries<keyof T & string>>;
  categoryKey: keyof T & string;
  formatCategory: (value: string) => string;
  unit?: string;
}) {
  const val = (d: T, key: string): number => Number((d as Record<string, unknown>)[key]) || 0;
  const cat = (d: T): string => String((d as Record<string, unknown>)[categoryKey]);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const totals = data.map((d) => series.reduce((sum, s) => sum + (val(d, s.key)), 0));
  const max = niceMax(Math.max(0, ...totals));
  const H = 160;
  const ticks = [0, max / 2, max];

  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {series.length > 1 ? <Legend series={series} /> : <span />}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-semibold text-green-700 hover:underline cursor-pointer"
          aria-expanded={showTable}
        >
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-3 text-[11px] uppercase tracking-wide text-muted">Period</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-2 pr-3 text-[11px] uppercase tracking-wide text-muted text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={cat(d)} className="border-b border-line/60 last:border-0">
                  <th scope="row" className="py-2 pr-3 font-normal text-ink-2 text-left">{formatCategory(cat(d))}</th>
                  {series.map((s) => (
                    <td key={s.key} className="py-2 pr-3 text-right tabular-nums text-ink">{val(d, s.key)}{unit}</td>
                  ))}
                  <td className="sr-only">Total {totals[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex flex-col justify-between text-[10px] text-muted tabular-nums text-right w-6 shrink-0" style={{ height: H }} aria-hidden>
              {[...ticks].reverse().map((t) => (
                <span key={t} className="leading-none">{Math.round(t)}</span>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="relative border-b border-line" style={{ height: H }}>
                {ticks.slice(1).map((t) => (
                  <div key={t} aria-hidden className="absolute left-0 right-0 border-t border-dashed border-line/70" style={{ bottom: `${(t / max) * 100}%` }} />
                ))}
                <div className="absolute inset-0 flex items-end gap-[6%] px-[3%]">
                  {data.map((d, i) => {
                    const label = formatCategory(cat(d));
                    const parts = series
                      .map((s) => ({ s, v: val(d, s.key) }))
                      .filter((p) => p.v > 0);
                    const description = `${label}: ${series.map((s) => `${s.label} ${val(d, s.key)}${unit}`).join(', ')}`;
                    return (
                      <button
                        key={cat(d)}
                        type="button"
                        aria-label={description}
                        onMouseEnter={() => setActive(i)}
                        onMouseLeave={() => setActive(null)}
                        onFocus={() => setActive(i)}
                        onBlur={() => setActive(null)}
                        className="relative flex-1 h-full flex flex-col justify-end items-stretch cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded"
                      >
                        <span className="flex flex-col-reverse gap-[2px] w-full max-w-10 mx-auto" style={{ height: `${(totals[i] / max) * 100}%` }}>
                          {parts.map((p, idx) => (
                            <span
                              key={p.s.key}
                              className={cn(idx === parts.length - 1 && 'rounded-t-[4px]')}
                              style={{ background: p.s.color, flexGrow: p.v, flexBasis: 0, minHeight: 2 }}
                            />
                          ))}
                        </span>
                        {active === i && (
                          <span
                            role="tooltip"
                            className="absolute z-10 bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-white px-2.5 py-1.5 text-left shadow-large text-[11px] text-ink"
                          >
                            <span className="block font-semibold mb-0.5">{label}</span>
                            {series.map((s) => (
                              <span key={s.key} className="flex items-center gap-1.5">
                                <span aria-hidden className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                                {s.label}: <span className="tabular-nums">{val(d, s.key)}{unit}</span>
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-[6%] px-[3%] mt-1.5" aria-hidden>
                {data.map((d) => (
                  <span key={cat(d)} className="flex-1 text-center text-[10px] text-muted truncate">
                    {formatCategory(cat(d))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}

/** Horizontal bars for a ranked breakdown (e.g. mistakes by type), value labels in ink. */
export function HorizontalBars({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure>
      <figcaption className="sr-only">{title}</figcaption>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-center justify-between gap-3 text-xs mb-1">
              <span className="text-ink-2 truncate">{r.label}</span>
              <span className="text-ink font-semibold tabular-nums">{r.value}</span>
            </div>
            <div className="h-2 rounded-full bg-sand overflow-hidden" aria-hidden>
              <div className="h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: SINGLE_SERIES_COLOR }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
