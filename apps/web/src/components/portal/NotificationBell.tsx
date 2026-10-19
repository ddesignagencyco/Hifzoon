'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { describeNotification } from '@/lib/api/modules/notifications';
import { ErrorState, formatDateTime } from '@/components/ui/primitives';

/** Header bell: the five most recent in-app notifications (FR-NTF-02). */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const query = useNotifications(1, 5);
  const items = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${total ? ` (${total})` : ''}`}
        aria-expanded={open}
        className="relative p-2 rounded-full text-ink-2 hover:bg-sand cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {total > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gold" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-line shadow-large z-40">
          <p className="px-4 pt-3 pb-2 text-xs font-semibold text-ink border-b border-line">Notifications</p>
          {query.isLoading ? (
            <p className="px-4 py-6 text-xs text-muted text-center">Loading…</p>
          ) : query.isError ? (
            <ErrorState
              error={query.error}
              title="Could not load notifications"
              onRetry={() => query.refetch()}
              className="py-6"
            />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted text-center">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-line">
              {items.map((n) => {
                const { title, body } = describeNotification(n);
                return (
                  <li key={n.id} className="px-4 py-3">
                    <p className="text-sm text-ink">{title}</p>
                    {body && <p className="text-xs text-muted line-clamp-2 mt-0.5">{body}</p>}
                    <p className="text-[11px] text-muted mt-1">{formatDateTime(n.createdAt)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
