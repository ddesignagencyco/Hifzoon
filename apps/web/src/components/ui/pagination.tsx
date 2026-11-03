'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

/**
 * The one shared pager for server-paginated lists (shadcn/ui pagination pattern).
 *
 * Takes raw `{ page, limit, total }` — the shape every paginated endpoint returns via
 * `meta.pagination` — and renders numbered pages with first/last always visible and an
 * ellipsis for the gaps, plus Previous / Next. Pass `onLimitChange` to show the
 * "Rows per page" selector; without it, a left-aligned "X–Y of N" count is shown instead.
 *
 * Renders nothing when everything fits on one page and the page size cannot be changed.
 */
export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
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
  /** Provide to show the "Rows per page" selector. */
  onLimitChange?: (limit: number) => void;
  pageSizeOptions?: number[];
  /** Dim the controls while the next page is loading. */
  disabled?: boolean;
  /** Plural noun for the count label when no size selector is shown, e.g. "invoices". */
  itemName?: string;
  className?: string;
}) {
  const safeLimit = Math.max(1, limit);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const current = Math.min(Math.max(1, page), totalPages);

  if (totalPages <= 1 && !onLimitChange) return null;

  const from = total === 0 ? 0 : (current - 1) * safeLimit + 1;
  const to = Math.min(total, current * safeLimit);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1 text-sm', className)}
    >
      {onLimitChange ? (
        <label className="flex items-center gap-2 text-xs text-muted">
          <span className="whitespace-nowrap">Rows per page</span>
          <select
            value={safeLimit}
            disabled={disabled}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            aria-label="Rows per page"
            className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:opacity-50"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="hidden tabular-nums sm:inline">
            {from}–{to} of {total}
          </span>
        </label>
      ) : (
        <span className="text-xs text-muted tabular-nums" aria-live="polite">
          {from}–{to} of {total} {itemName}
        </span>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-1" aria-live="polite">
          <PageButton
            onClick={() => onPageChange(current - 1)}
            disabled={disabled || current <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Previous</span>
          </PageButton>

          {pageItems(current, totalPages).map((item, i) =>
            item === 'ellipsis' ? (
              <span key={`gap-${i}`} className="px-1.5 text-muted select-none" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                disabled={disabled}
                aria-current={item === current ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={cn(
                  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-sm tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50',
                  item === current
                    ? 'border-green-700 bg-green-50 font-semibold text-green-800'
                    : 'border-transparent text-ink hover:bg-sand',
                )}
              >
                {item}
              </button>
            ),
          )}

          <PageButton
            onClick={() => onPageChange(current + 1)}
            disabled={disabled || current >= totalPages}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PageButton>
        </div>
      )}
    </nav>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-transparent px-2 text-sm text-ink transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      {children}
    </button>
  );
}

/**
 * Page tokens with first/last always shown and an ellipsis for the gaps, e.g. for page 5
 * of 10: [1, '…', 4, 5, 6, '…', 10]. Adjacent gaps of one collapse to the real number.
 */
function pageItems(current: number, totalPages: number): Array<number | 'ellipsis'> {
  const delta = 1;
  const kept: number[] = [];
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
      kept.push(i);
    }
  }
  const out: Array<number | 'ellipsis'> = [];
  let prev: number | undefined;
  for (const i of kept) {
    if (prev !== undefined) {
      if (i - prev === 2) out.push(prev + 1);
      else if (i - prev > 2) out.push('ellipsis');
    }
    out.push(i);
    prev = i;
  }
  return out;
}
