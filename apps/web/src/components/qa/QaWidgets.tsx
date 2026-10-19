'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, Star } from 'lucide-react';
import { Badge, EmptyState, humanize } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { STANDARD_RUBRIC, TeacherRatingSummary, TeacherScorecard } from '@/lib/api/modules/qa';

export function criterionLabel(key: string): string {
  return STANDARD_RUBRIC.items.find((i) => i.key === key)?.label ?? humanize(key);
}

/** Rubric score out of 5 as a coloured badge. */
export function ScoreBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted">No reviews</span>;
  const tone = value < 3 ? 'red' : value < 4 ? 'amber' : 'green';
  return <Badge tone={tone}>{value.toFixed(1)} / 5</Badge>;
}

export function RatingInline({ summary }: { summary: TeacherRatingSummary | undefined }) {
  if (!summary) return <span className="text-xs text-muted">—</span>;
  if (summary.average === null || summary.count === 0) return <span className="text-xs text-muted">No family ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink">
      <Star className="w-3.5 h-3.5 text-gold fill-current" aria-hidden />
      <span className="font-semibold tabular-nums">{summary.average.toFixed(1)}</span>
      <span className="text-xs text-muted">({summary.count})</span>
    </span>
  );
}

/** Star distribution bars (FR-QA-02). */
export function RatingDistribution({ summary }: { summary: TeacherRatingSummary }) {
  if (summary.count === 0) {
    return <EmptyState title="No family ratings yet" description="Guardians rate classes they attended." />;
  }
  const max = Math.max(...summary.distribution.map((d) => d.count), 1);
  return (
    <div className="space-y-3">
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold text-ink tabular-nums">{summary.average?.toFixed(1)}</span>
        <span className="text-xs text-muted">from {summary.count} rating{summary.count === 1 ? '' : 's'}</span>
      </p>
      <ul className="space-y-1.5">
        {summary.distribution.map((d) => (
          <li key={d.stars} className="flex items-center gap-2 text-xs">
            <span className="w-8 text-muted tabular-nums">{d.stars}★</span>
            <span className="flex-1 h-2 rounded-full bg-sand overflow-hidden" aria-hidden>
              <span className="block h-full bg-gold rounded-full" style={{ width: `${(d.count / max) * 100}%` }} />
            </span>
            <span className="w-8 text-right text-ink-2 tabular-nums">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Per-criterion averages with the "needs a conversation" (< 3/5) flag. */
export function ScorecardCriteria({ scorecard }: { scorecard: TeacherScorecard }) {
  if (scorecard.reviewsCount === 0) {
    return (
      <EmptyState
        title="No QA reviews in this window"
        description={`Nothing reviewed in the last ${scorecard.windowMonths} month${scorecard.windowMonths === 1 ? '' : 's'}.`}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {scorecard.criteria.map((c) => (
        <li key={c.key}>
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="text-ink-2 min-w-0">
              {criterionLabel(c.key)}
              {c.flag && (
                <span className="ml-2 inline-flex items-center gap-1 text-red font-semibold">
                  <AlertTriangle className="w-3 h-3" aria-hidden /> Below 3
                </span>
              )}
            </span>
            <span className="text-ink font-semibold tabular-nums shrink-0">
              {c.average.toFixed(1)} <span className="text-muted font-normal">({c.count})</span>
            </span>
          </div>
          <span className="mt-1 block h-2 rounded-full bg-sand overflow-hidden" aria-hidden>
            <span
              className={cn('block h-full rounded-full', c.flag ? 'bg-red' : c.average < 4 ? 'bg-amber' : 'bg-green-600')}
              style={{ width: `${(c.average / 5) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TeacherInitial({ name }: { name: string }) {
  return (
    <span className="w-8 h-8 rounded-full bg-green-800 text-gold text-xs font-semibold flex items-center justify-center shrink-0" aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** A link styled like `UiButton` (avoids nesting a button inside an anchor). */
export function LinkButton({
  href,
  children,
  icon,
  variant = 'primary',
  size = 'md',
  className,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-5 text-sm',
        variant === 'primary'
          ? 'bg-green-800 text-white hover:bg-green-700 border border-green-800'
          : 'bg-white text-ink border border-line hover:bg-sand',
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
