'use client';

import React, { useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, EmptyState, ErrorState, LoadingState } from '@/components/ui/primitives';
import { useMushafPage, useMushafPageWords } from '@/hooks/useMushaf';
import {
  AyahRef,
  AyahWords,
  MushafLayout,
  MushafPage,
  ayahsOnPage,
  layoutLabel,
  toArabicDigits,
} from '@/lib/api/modules/mushaf';
import { humanizeRule, tajweedColour } from './tajweed';

export interface WordPosition {
  surah: number;
  ayah: number;
  wordIndex: number;
}

const AMIRI: React.CSSProperties = { fontFamily: "'Amiri', serif" };

function samePos(a: WordPosition | null | undefined, b: WordPosition | null | undefined) {
  return !!a && !!b && a.surah === b.surah && a.ayah === b.ayah && a.wordIndex === b.wordIndex;
}

function sameAyah(a: AyahRef | null | undefined, b: AyahRef | null | undefined) {
  return !!a && !!b && a.surah === b.surah && a.ayah === b.ayah;
}

/**
 * Renders one Mushaf page from the API (FR-CLS-03/04/05).
 *
 * - Licensed deployments: words for every ayah on the page, RTL in Amiri, with the
 *   class highlight, optional Tajweed colours and optional word selection.
 * - Unlicensed deployments (`licensed: false`, e.g. the development fake provider):
 *   only the page structure (lines and ayah references) is shown, with a clear notice.
 *   Quran text is never substituted (CR-11).
 */
export function MushafViewer({
  layout,
  page,
  highlight,
  tajweed = false,
  selected,
  onSelect,
  markers = [],
}: {
  layout: MushafLayout;
  page: number;
  highlight?: WordPosition | null;
  tajweed?: boolean;
  selected?: WordPosition | null;
  /** When provided, words (or ayahs when no text is available) become selectable buttons. */
  onSelect?: (pos: WordPosition) => void;
  /** Positions to underline, e.g. mistakes already logged in this class. */
  markers?: WordPosition[];
}) {
  const pageQuery = useMushafPage(layout, page);
  const refs = useMemo(() => ayahsOnPage(pageQuery.data), [pageQuery.data]);
  const licensed = pageQuery.data?.licensed === true;
  const wordQueries = useMushafPageWords(layout, refs, licensed);

  if (pageQuery.isLoading) return <LoadingState label={`Loading page ${page}…`} />;
  if (pageQuery.isError) return <ErrorState error={pageQuery.error} onRetry={() => pageQuery.refetch()} title="Could not load this Mushaf page" />;
  if (!pageQuery.data) return <EmptyState title="Page not available" />;

  const data = pageQuery.data;
  const caption = (
    <p className="text-[11px] text-muted">
      {layoutLabel(data.layout)} · page {data.page} · source: {data.source}
    </p>
  );

  if (!licensed) {
    return (
      <div className="space-y-3">
        <Alert tone="warning" title="Quran text is not licensed in this environment">
          The content provider (&ldquo;{data.source}&rdquo;) returned page structure only. Ayah positions are shown so the
          class can still follow along and mistakes can be logged; the text itself is never substituted.
        </Alert>
        {caption}
        <StructureView page={data} highlight={highlight} selected={selected} onSelect={onSelect} markers={markers} />
      </div>
    );
  }

  const wordsLoading = wordQueries.some((q) => q.isLoading);
  const wordsError = wordQueries.find((q) => q.isError);
  if (wordsLoading) return <LoadingState label="Loading ayah text…" />;
  if (wordsError) {
    return (
      <ErrorState
        error={wordsError.error}
        title="Could not load the ayah text"
        onRetry={() => wordQueries.forEach((q) => q.isError && q.refetch())}
      />
    );
  }

  const ayahs = wordQueries.map((q) => q.data).filter((d): d is AyahWords => !!d);
  const hasText = ayahs.some((a) => a.words.length > 0);
  if (!hasText) {
    return (
      <div className="space-y-3">
        <Alert tone="warning" title="No word data for this page">
          The provider returned no words for these ayahs. Ayah positions are shown instead.
        </Alert>
        {caption}
        <StructureView page={data} highlight={highlight} selected={selected} onSelect={onSelect} markers={markers} />
      </div>
    );
  }

  const rulesOnPage = tajweed
    ? Array.from(new Set(ayahs.flatMap((a) => a.words.flatMap((w) => w.tajweedRules)))).sort()
    : [];

  return (
    <div className="space-y-3">
      {caption}
      <div
        dir="rtl"
        lang="ar"
        style={AMIRI}
        className="rounded-xl bg-cream border border-line px-3 sm:px-6 py-5 text-[1.6rem] sm:text-3xl leading-[2.4] text-ink text-justify"
      >
        {ayahs.map((a) => (
          <span key={`${a.surah}:${a.ayah}`}>
            {a.words.map((w) => {
              const pos = { surah: a.surah, ayah: a.ayah, wordIndex: w.index };
              const isHighlight = samePos(highlight, pos);
              const isSelected = samePos(selected, pos);
              const isMarked = markers.some((m) => samePos(m, pos));
              const rule = tajweed ? w.tajweedRules[0] : undefined;
              const cls = cn(
                'rounded-md px-0.5 transition-colors',
                rule && tajweedColour(rule).text,
                isHighlight && 'bg-gold-100 ring-1 ring-gold',
                isSelected && 'bg-green-50 ring-2 ring-green-600',
                isMarked && 'underline decoration-red decoration-2 underline-offset-8',
              );
              const label = `Surah ${a.surah}, ayah ${a.ayah}, word ${w.index}${rule ? `, ${humanizeRule(rule)}` : ''}`;
              return (
                <React.Fragment key={w.index}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(pos)}
                      aria-pressed={isSelected}
                      aria-label={label}
                      title={label}
                      className={cn(cls, 'cursor-pointer hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold')}
                    >
                      {w.text}
                    </button>
                  ) : (
                    <span className={cls} aria-current={isHighlight ? 'true' : undefined} title={rule ? humanizeRule(rule) : undefined}>
                      {w.text}
                    </span>
                  )}{' '}
                </React.Fragment>
              );
            })}
            <span className="text-gold-600 text-xl mx-1" aria-label={`End of ayah ${a.ayah}`}>
              ۝{toArabicDigits(a.ayah)}
            </span>{' '}
          </span>
        ))}
      </div>
      {tajweed && rulesOnPage.length > 0 && (
        <ul aria-label="Tajweed colour key" className="flex flex-wrap gap-x-4 gap-y-1">
          {rulesOnPage.map((rule) => (
            <li key={rule} className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span className={cn('w-2.5 h-2.5 rounded-full', tajweedColour(rule).swatch)} aria-hidden />
              {humanizeRule(rule)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Lines with their ayah references — used when there is no licensed text. */
function StructureView({
  page,
  highlight,
  selected,
  onSelect,
  markers,
}: {
  page: MushafPage;
  highlight?: WordPosition | null;
  selected?: WordPosition | null;
  onSelect?: (pos: WordPosition) => void;
  markers: WordPosition[];
}) {
  return (
    <ol dir="rtl" className="rounded-xl bg-cream border border-line divide-y divide-line/70" aria-label={`Page ${page.page} lines`}>
      {page.lines.map((line) => {
        const valid = line.ayahs.filter((r) => r.surah >= 1 && r.surah <= 114 && r.ayah >= 1);
        return (
          <li key={line.lineNumber} className="flex items-center gap-3 px-3 py-2 min-h-11">
            <span className="text-[11px] text-muted w-6 text-center shrink-0" dir="ltr" aria-label={`Line ${line.lineNumber}`}>
              {line.lineNumber}
            </span>
            {valid.length === 0 ? (
              <span className="text-xs text-muted" dir="ltr">Continuation of the previous ayah</span>
            ) : (
              <span className="flex flex-wrap gap-1.5" dir="ltr">
                {valid.map((ref) => {
                  const isHighlight = sameAyah(highlight, ref);
                  const isSelected = sameAyah(selected, ref);
                  const isMarked = markers.some((m) => sameAyah(m, ref));
                  const cls = cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    isSelected
                      ? 'border-green-600 bg-green-50 text-green-800'
                      : isHighlight
                        ? 'border-gold bg-gold-100 text-gold-600'
                        : 'border-line bg-white text-ink-2',
                    isMarked && 'underline decoration-red decoration-2',
                  );
                  const label = `Surah ${ref.surah}, ayah ${ref.ayah}`;
                  return onSelect ? (
                    <button
                      key={`${ref.surah}:${ref.ayah}`}
                      type="button"
                      onClick={() => onSelect({ surah: ref.surah, ayah: ref.ayah, wordIndex: 0 })}
                      aria-pressed={isSelected}
                      aria-label={`Select ${label}`}
                      className={cn(cls, 'cursor-pointer hover:bg-sand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold')}
                    >
                      <BookOpen className="w-3 h-3" aria-hidden />
                      {ref.surah}:{ref.ayah}
                    </button>
                  ) : (
                    <span key={`${ref.surah}:${ref.ayah}`} className={cls} aria-current={isHighlight ? 'true' : undefined} aria-label={label}>
                      {ref.surah}:{ref.ayah}
                    </span>
                  );
                })}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
