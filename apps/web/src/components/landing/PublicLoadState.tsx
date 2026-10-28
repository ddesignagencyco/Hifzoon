'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { BrandLoader } from '@/components/ui/BrandLoader';

/**
 * Loading / failed / empty states for public-site lists (courses, teachers, plans, FAQs).
 * The site never substitutes invented records: when the API has nothing, it says so.
 */
export function PublicLoadState({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  what,
  emptyText,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  isEmpty: boolean;
  onRetry?: () => void;
  /** Plural noun for messages, e.g. "teachers". */
  what: string;
  emptyText?: string;
  children: React.ReactNode;
}) {
  if (isLoading && isEmpty) {
    return <BrandLoader variant="section" label={`Loading ${what}…`} />;
  }
  if (isError && isEmpty) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center text-sm text-[#6b7772]">
        <p>We couldn&apos;t load the {what} right now.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e6dfd1] bg-white px-4 py-2 text-xs font-semibold text-[#143a2f] hover:bg-[#f3eee4] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden /> Try again
          </button>
        )}
      </div>
    );
  }
  if (isEmpty) {
    return <p className="text-center text-sm text-[#6b7772] py-16">{emptyText ?? `No ${what} to show yet.`}</p>;
  }
  return <>{children}</>;
}
