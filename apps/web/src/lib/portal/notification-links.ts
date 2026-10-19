import { Role } from '@/lib/types';
import { NotificationRecord } from '@/lib/api/modules/notifications';
import { billingEnabled } from '@/lib/features';
import { canAccessPath, PORTALS, PortalKey } from './nav';

const enc = encodeURIComponent;

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** `https://app.hifzoon.com/classroom/<id>` (reminder `joinUrl`) → `<id>`. */
export function classIdFromJoinUrl(joinUrl: string | undefined): string | undefined {
  if (!joinUrl) return undefined;
  const match = /\/classroom\/([^/?#]+)/.exec(joinUrl);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

/** Templates about a class that has no classroom link in its payload (cancelled, moved, booked). */
const TIMETABLE_TYPES = new Set(['class.cancelled', 'class.rescheduled', 'trial.booked', 'class.missed']);

function candidateHref(n: NotificationRecord, portal: PortalKey): string | null {
  const payload = (n.payload ?? {}) as Record<string, unknown>;

  const caseId = payloadString(payload, 'caseId');
  if (caseId) {
    if (portal === 'supervisor') return `/supervisor/cases/${enc(caseId)}`;
    if (portal === 'safeguarding' || portal === 'admin') return `/safeguarding/cases/${enc(caseId)}`;
    return null;
  }

  const threadId = payloadString(payload, 'threadId');
  if (threadId) {
    return portal === 'parent' || portal === 'teacher' ? `/${portal}/messages/${enc(threadId)}` : null;
  }

  const lessonCardId = payloadString(payload, 'lessonCardId');
  if (lessonCardId) {
    // The payload has no student id, so the parent route resolves the child from the card.
    if (portal === 'parent') return `/parent/lesson-cards/${enc(lessonCardId)}`;
    if (portal === 'supervisor') return `/supervisor/lesson-cards/${enc(lessonCardId)}`;
    return null;
  }

  const classId = payloadString(payload, 'classId') ?? classIdFromJoinUrl(payloadString(payload, 'joinUrl'));
  if (classId) {
    return portal === 'parent' || portal === 'teacher' || portal === 'student' ? `/${portal}/classroom/${enc(classId)}` : null;
  }

  if (TIMETABLE_TYPES.has(n.type)) {
    return portal === 'parent' || portal === 'teacher' ? `/${portal}/timetable` : null;
  }
  if (n.type === 'consent.data-request') return portal === 'parent' ? '/parent/privacy' : null;
  if (n.type === 'class.teacher-change') return portal === 'parent' ? '/parent/children' : null; // lists the family's requests
  if (n.type === 'billing.payment-failed') return portal === 'parent' && billingEnabled() ? '/parent/billing' : null;
  return null;
}

/**
 * Where a notification should take the viewer in the portal they are using, from the ids its
 * payload carries (`caseId`, `threadId`, `lessonCardId`, `classId`/`joinUrl`) or its template
 * type. `null` when the notification has nowhere useful to go in that portal, or when `roles`
 * is given and those roles can't open the target.
 */
export function hrefForNotification(n: NotificationRecord, portal: PortalKey, roles?: readonly Role[]): string | null {
  const href = candidateHref(n, portal);
  if (!href) return null;
  if (roles && !canAccessPath(href, [...roles])) return null;
  return href;
}

/** The portal's notifications page, when its sidebar has one ("See all" in the bell). */
export function notificationsPageFor(portal: PortalKey): string | null {
  const href = `${PORTALS[portal].basePath}/notifications`;
  return PORTALS[portal].nav.some((item) => item.href === href) ? href : null;
}

/*
 * "New since you last looked." The API has no read state yet (backend M59), so the bell
 * remembers in this browser when it was last opened. Storage can be unavailable (private
 * mode, blocked site data): every access is guarded and the bell still works without it.
 */
export function notificationsSeenKey(userId: string | null | undefined): string {
  return `hifzoon:notifications-seen:${userId ?? 'anonymous'}`;
}

export function readNotificationsSeenAt(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeNotificationsSeenAt(key: string, iso: string): void {
  try {
    window.localStorage.setItem(key, iso);
  } catch {
    // Non-critical: the dot just stays until storage works again.
  }
}

/** True when any item is newer than the last time the bell was opened (or it never was). */
export function hasUnseenNotifications(items: readonly Pick<NotificationRecord, 'createdAt'>[], seenAt: string | null): boolean {
  if (items.length === 0) return false;
  if (!seenAt) return true;
  const seen = Date.parse(seenAt);
  if (Number.isNaN(seen)) return true;
  return items.some((n) => Date.parse(n.createdAt) > seen);
}
