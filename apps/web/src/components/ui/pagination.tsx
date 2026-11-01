'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one shared pager for server-paginated lists.
 *
 * It takes raw `{ page, limit, total }` (the shape every paginated endpoint returns via
 * `meta.pagination`) and computes the page count itself, so callers never do the math.
 * Styled to match the footer that `DataTable` renders for client-side paging — a left-aligned
 * "X–Y of N" range and right-aligned prev / "Page X of Y" / next — so a page that fetches a
 * page at a time looks identical to one that pages in the browser.
 *
 * Renders nothing when everything fits on a single page.
 */
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  disabled = false,
  itemName = 'results',
  className,
}: {
  /** Current 1-based page. */
  page: number;
  /** Rows per page. */
  limit: number;
  /** Total rows across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Dim the controls while the next page is loading. */
  disabled?: boolean;
  /** Plural noun for the count label, e.g. "invoices". */
  itemName?: string;
  className?: string;
}) {
  const safeLimit = Math.max(1, limit);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const current = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1) return null;

  const from = total === 0 ? 0 : (current - 1) * safeLimit + 1;
  const to = Math.min(total, current * safeLimit);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted', className)}
    >
      <span aria-live="polite">
        {from}–{to} of {total} {itemName}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(current - 1)}
          disabled={disabled || current <= 1}
          aria-label="Previous page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-sand disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="tabular-nums text-ink-2" aria-live="polite">
          Page {current} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(current + 1)}
          disabled={disabled || current >= totalPages}
          aria-label="Next page"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-ink transition-colors hover:bg-sand disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
