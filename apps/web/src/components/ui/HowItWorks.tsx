import React from 'react';
import { cn } from '@/lib/utils';

/** A short numbered "How this works" strip that explains a queue page's flow in a few steps. */
export function HowItWorks({ steps, className }: { steps: React.ReactNode[]; className?: string }) {
  return (
    <section aria-label="How this works" className={cn('mb-6 rounded-xl border border-line bg-white px-4 py-3', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-600 mb-2">How this works</p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-ink-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-800 text-[11px] font-semibold text-white">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
