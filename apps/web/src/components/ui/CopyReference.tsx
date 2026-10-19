'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Internal identifiers (UUIDs, storage keys, request ids) are never shown as visible text.
 * When support genuinely needs one, it sits behind this small button: the value is copied
 * to the clipboard and is otherwise only in the hover tooltip.
 */
export function CopyReference({
  value,
  label = 'reference',
  text = 'Copy reference',
}: {
  value: string;
  /** What the value is, for the accessible name and tooltip (e.g. "payment reference"). */
  label?: string;
  /** Visible button text. */
  text?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the value is still in the tooltip */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={`${label}: ${value}`}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:text-ink hover:bg-sand cursor-pointer shrink-0 align-middle"
    >
      {copied ? <Check className="w-3 h-3" aria-hidden /> : <Copy className="w-3 h-3" aria-hidden />}
      <span aria-live="polite">{copied ? 'Copied' : text}</span>
    </button>
  );
}
