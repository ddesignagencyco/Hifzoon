'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api/http';

type ToastTone = 'success' | 'error';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (errorOrMessage: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId++;
      // The same message twice in a row (e.g. several sections failing on one outage,
      // or a retry that fails again) shows once.
      setItems((current) =>
        current.some((t) => t.tone === tone && t.message === message)
          ? current
          : [...current.slice(-3), { id, tone, message }],
      );
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (errorOrMessage) =>
        push('error', typeof errorOrMessage === 'string' ? errorOrMessage : getErrorMessage(errorOrMessage)),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-large text-sm',
              item.tone === 'success' ? 'border-green-600/30' : 'border-red/30',
            )}
          >
            {item.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 shrink-0" aria-hidden />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5 text-red shrink-0" aria-hidden />
            )}
            <p className="flex-1 text-ink">{item.message}</p>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="text-muted hover:text-ink cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Toasts for mutation feedback. Falls back to console outside a provider (tests). */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? FALLBACK_TOASTS;
}

/** Stable no-op API outside a provider (unit tests), so effects depending on it don't re-run. */
const FALLBACK_TOASTS: ToastApi = {
  success: () => undefined,
  error: () => undefined,
};
