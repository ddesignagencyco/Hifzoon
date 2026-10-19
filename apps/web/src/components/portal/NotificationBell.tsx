'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useAuth } from '@/hooks';
import { useNotifications } from '@/hooks/useNotifications';
import { describeNotification } from '@/lib/api/modules/notifications';
import { PortalKey } from '@/lib/portal/nav';
import {
  hasUnseenNotifications,
  hrefForNotification,
  notificationsPageFor,
  notificationsSeenKey,
  readNotificationsSeenAt,
  writeNotificationsSeenAt,
} from '@/lib/portal/notification-links';
import { ErrorState, formatDateTime } from '@/components/ui/primitives';

/**
 * Header bell: the five most recent in-app notifications (FR-NTF-02). Each one links to what
 * it is about in this portal. The dot means "new since the bell was last opened" — the API has
 * no read state yet (backend M59), so that moment is remembered in this browser.
 */
export function NotificationBell({ portal }: { portal: PortalKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { currentUser } = useAuth();
  const roles = currentUser?.roles ?? [];
  const seenKey = notificationsSeenKey(currentUser?.id);
  // Keyed by user: the session can resolve after the first render, or another account sign in.
  const [seen, setSeen] = useState(() => ({ key: seenKey, at: readNotificationsSeenAt(seenKey) }));
  const seenAt = seen.key === seenKey ? seen.at : readNotificationsSeenAt(seenKey);
  const query = useNotifications(1, 5);
  const items = query.data?.items ?? [];
  const unseen = hasUnseenNotifications(items, seenAt);
  const seeAll = notificationsPageFor(portal);

  const toggle = () => {
    if (!open && query.data) {
      // Opening the bell marks everything listed as seen.
      // Never earlier than the newest item, so a clock behind the server can't keep the dot lit.
      const newest = items[0]?.createdAt;
      const now = newest && Date.parse(newest) > Date.now() ? newest : new Date().toISOString();
      writeNotificationsSeenAt(seenKey, now);
      setSeen({ key: seenKey, at: now });
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
        aria-label={unseen ? 'Notifications (new)' : 'Notifications'}
        aria-expanded={open}
        className="relative p-2 rounded-full text-ink-2 hover:bg-sand cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unseen && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gold" aria-hidden />}
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
                    <p className="text-sm text-ink">{title}</p>
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
