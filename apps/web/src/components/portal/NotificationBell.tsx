'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks';
import { useMarkNotificationsRead, useNotifications, useUnreadNotifications } from '@/hooks/useNotifications';
import { describeNotification } from '@/lib/api/modules/notifications';
import { PortalKey } from '@/lib/portal/nav';
import { hrefForNotification, notificationsPageFor } from '@/lib/portal/notification-links';
import { ErrorState, formatDateTime } from '@/components/ui/primitives';

/**
 * Header bell: the five most recent notifications (FR-NTF-02), each linking to what it is
 * about in this portal, with the unread count from the API (M59).
 */
export function NotificationBell({ portal }: { portal: PortalKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const roles = currentUser?.roles ?? [];
  const query = useNotifications(1, 5);
  const unread = useUnreadNotifications();
  const markRead = useMarkNotificationsRead();
  const items = query.data?.items ?? [];
  const count = unread.data?.unread ?? 0;
  const seeAll = notificationsPageFor(portal);

  const toggle = () => {
    // Opening the bell marks the ones it shows as read (M59: read state lives in the API).
    if (!open) {
      const ids = items.filter((n) => !n.readAt).map((n) => n.id);
      if (ids.length > 0) markRead.mutate(ids);
    }
    setOpen((v) => !v);
  };

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
        onClick={toggle}
        aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
        aria-expanded={open}
        className="relative p-2 rounded-full text-ink-2 hover:bg-sand cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-green-950" aria-hidden>
            {count > 9 ? '9+' : count}
          </span>
        )}
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
                const href = hrefForNotification(n, portal, roles);
                const content = (
                  <>
                    <p className={n.readAt ? 'text-sm text-ink-2' : 'text-sm font-semibold text-ink'}>{title}</p>
                    {body && <p className="text-xs text-muted line-clamp-2 mt-0.5">{body}</p>}
                    <p className="text-[11px] text-muted mt-1">{formatDateTime(n.createdAt)}</p>
                  </>
                );
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-cream">
                        {content}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {seeAll && (
            <Link
              href={seeAll}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-xs font-semibold text-green-700 border-t border-line hover:bg-cream rounded-b-2xl"
            >
              See all notifications
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
