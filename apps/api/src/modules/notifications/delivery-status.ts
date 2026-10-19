/**
 * Notification delivery status progression (FR-NTF-03).
 *
 * WhatsApp reports delivery asynchronously, and **out of order**. A `delivered` receipt
 * can arrive before the `sent` one this process just wrote, `read` can arrive twice, and
 * Meta redelivers everything it did not get a 200 for. So status is a *position*, and
 * every update moves it forward or is discarded.
 *
 * Without this, a redelivered `sent` receipt would walk a message that was already
 * marked READ back to SENT, and the parent portal would report a message the family had
 * demonstrably read as undelivered. The failure is silent and looks like a UI bug.
 *
 * Comparisons here are against plain strings rather than the shared `NotificationStatus`
 * enum, because `current` comes back from the database as Prisma's own enum type.
 * Comparing two different enum declarations with `===` is exactly the mistake this
 * linter rule exists to catch, and silently never matching would be the worst outcome:
 * every receipt would look like a duplicate.
 */

/** Higher wins. FAILED and SKIPPED are terminal and sit outside the ladder. */
const PROGRESSION = ['QUEUED', 'SENT', 'DELIVERED', 'READ'] as const;

const RANK = new Map<string, number>(PROGRESSION.map((status, index) => [status, index]));

/**
 * Returns the status to write, or `null` when the update must be ignored.
 *
 * `null` means "this event tells us nothing we did not already know", which is the
 * correct response to a duplicate or an out-of-order delivery — not an error, and never
 * a downgrade.
 */
export function nextNotificationStatus(current: string, incoming: string): string | null {
  // FAILED is absorbing in one direction only. A late `delivered` receipt after we
  // recorded a send failure does not resurrect the message: the provider's own failure
  // code was the more recent fact, and overwriting it would hide a broken integration.
  // The same applies to SKIPPED, which means we decided not to send.
  if (current === 'FAILED' || current === 'SKIPPED') return null;

  // A failure is always applied, whatever we previously believed — a message we thought
  // was delivered but that the provider then reported as failed is precisely what this
  // webhook exists to tell us.
  if (incoming === 'FAILED') return 'FAILED';

  const currentRank = RANK.get(current);
  const incomingRank = RANK.get(incoming);
  if (currentRank === undefined || incomingRank === undefined) return null;

  // Equal or behind: a duplicate, or a receipt that overtook the one we already have.
  if (incomingRank <= currentRank) return null;

  return PROGRESSION[incomingRank];
}
