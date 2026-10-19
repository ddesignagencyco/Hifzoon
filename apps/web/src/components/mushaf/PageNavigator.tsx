'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { UiButton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { MUSHAF_MAX_PAGE, MUSHAF_MIN_PAGE, isValidPage } from '@/lib/api/modules/mushaf';

/** Previous / next / go-to-page controls for the Mushaf (teacher-only in class). */
export function PageNavigator({
  page,
  onChange,
  pending = false,
  idPrefix = 'mushaf',
  tone = 'light',
}: {
  page: number;
  onChange: (page: number) => void;
  pending?: boolean;
  idPrefix?: string;
  /** `dark` for the classroom's meeting toolbar. */
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  const btn = dark
    ? 'bg-white/10 text-white border-white/20 hover:bg-white/20 focus-visible:ring-offset-green-950'
    : undefined;
  const [input, setInput] = useState(String(page));
  const [lastPage, setLastPage] = useState(page);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Keep the box in sync when the page changes elsewhere (adjusting state during render).
  if (lastPage !== page) {
    setLastPage(page);
    setInput(String(page));
    setError(null);
  }

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(input);
    if (!isValidPage(n)) {
      const problem = `Enter a page from ${MUSHAF_MIN_PAGE} to ${MUSHAF_MAX_PAGE}`;
      setError(problem);
      toast.error(problem);
      return;
    }
    setError(null);
    if (n !== page) onChange(n);
  };

  const inputId = `${idPrefix}-page-input`;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <UiButton
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={pending || page <= MUSHAF_MIN_PAGE}
        icon={<ChevronLeft className="w-4 h-4" aria-hidden />}
        aria-label="Previous page"
        className={btn}
      >
        <span className="hidden sm:inline">Previous</span>
      </UiButton>
      <form onSubmit={go} className="flex items-start gap-1.5" noValidate>
        <label htmlFor={inputId} className="sr-only">
          Go to page
        </label>
        <div>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={MUSHAF_MIN_PAGE}
            max={MUSHAF_MAX_PAGE}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={cn(
              'h-8 w-20 rounded-full border px-3 text-xs focus:outline-none focus:ring-2',
              dark ? 'bg-white/10 text-white focus:ring-gold' : 'bg-white text-ink focus:ring-gold/40',
              error ? 'border-red' : dark ? 'border-white/20' : 'border-line',
            )}
          />
          {error && (
            <p id={`${inputId}-error`} className="sr-only">
              {error}
            </p>
          )}
        </div>
        <UiButton type="submit" variant="secondary" size="sm" loading={pending} className={btn}>
          Go
        </UiButton>
      </form>
      <UiButton
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={pending || page >= MUSHAF_MAX_PAGE}
        aria-label="Next page"
        className={btn}
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="w-4 h-4" aria-hidden />
      </UiButton>
    </div>
  );
}
