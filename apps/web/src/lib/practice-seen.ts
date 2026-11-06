import { useSyncExternalStore } from 'react';
import type { PracticeAssignment } from '@/lib/api/modules/practice';

/**
 * Which teacher replies to practice the family has seen, kept in this browser only
 * (`localStorage`): assignment id → when it was last opened. A reply newer than that is unseen.
 */
const KEY = 'hifzoon.practice.seen';
const EVENT = 'hifzoon:practice-seen';
/** Older replies are not "new" even if this browser never opened them. */
export const REVIEW_NEW_FOR_MS = 14 * 24 * 3_600_000;

function read(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

let cache: { raw: string | null; value: Record<string, number> } = { raw: null, value: {} };
function snapshot(): Record<string, number> {
  if (typeof window === 'undefined') return cache.value;
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cache.raw) cache = { raw, value: read() };
  return cache.value;
}

/** The assignment was opened: its replies so far are seen. */
export function markPracticeSeen(assignmentId: string, at = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [assignmentId]: at }));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage full or blocked: the badge just stays.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function usePracticeSeen(): Record<string, number> {
  return useSyncExternalStore(subscribe, snapshot, () => cache.value);
}

/**
 * The sidebar count for Practice: assignments not practised yet, plus those with a teacher reply
 * this browser has not opened since (each assignment counted once).
 */
export function countPracticeAttention(
  rows: readonly Pick<PracticeAssignment, 'id' | 'status' | 'sessionCount' | 'lastReview'>[] | undefined,
  seen: Record<string, number>,
  now = Date.now(),
): number | undefined {
  if (!rows) return undefined;
  return rows.filter((a) => {
    const notStarted = a.status === 'ASSIGNED' && a.sessionCount === 0;
    const at = a.lastReview ? Date.parse(a.lastReview.at) : NaN;
    const newReply = Number.isFinite(at) && now - at < REVIEW_NEW_FOR_MS && at > (seen[a.id] ?? 0);
    return notStarted || newReply;
  }).length;
}
