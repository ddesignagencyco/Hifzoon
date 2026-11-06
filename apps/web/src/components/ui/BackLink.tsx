'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/**
 * "← Back" to the page that opened this one (e.g. a reader opened from Practice or a child's
 * Mistakes tab), falling back to `fallback` when the page was opened directly.
 */
export function BackLink({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-green-800 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </button>
  );
}
