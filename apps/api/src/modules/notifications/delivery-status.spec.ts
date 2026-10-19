import { nextNotificationStatus } from './delivery-status';

/**
 * Monotonic delivery status (FR-NTF-03).
 *
 * WhatsApp redelivers receipts and does not guarantee ordering. These tests exist
 * because the failure they prevent is silent: a redelivered `sent` walking a READ
 * message back to SENT makes the parent portal report a message the family had
 * demonstrably read as undelivered, and there is no error anywhere to explain it.
 */
describe('nextNotificationStatus', () => {
  it('advances forward through the ladder', () => {
    expect(nextNotificationStatus('SENT', 'DELIVERED')).toBe('DELIVERED');
    expect(nextNotificationStatus('DELIVERED', 'READ')).toBe('READ');
    expect(nextNotificationStatus('QUEUED', 'SENT')).toBe('SENT');
  });

  it('ignores a duplicate receipt', () => {
    expect(nextNotificationStatus('DELIVERED', 'DELIVERED')).toBeNull();
    expect(nextNotificationStatus('READ', 'READ')).toBeNull();
  });

  it('ignores a late receipt that overtook a newer one', () => {
    // The exact real-world race: `delivered` arrives after we already saw `read`.
    expect(nextNotificationStatus('READ', 'DELIVERED')).toBeNull();
    expect(nextNotificationStatus('READ', 'SENT')).toBeNull();
  });

  it('applies a failure even from a state that looked successful', () => {
    // This is the case the webhook exists for: we recorded SENT, and the provider then
    // told us the send actually failed.
    expect(nextNotificationStatus('SENT', 'FAILED')).toBe('FAILED');
    expect(nextNotificationStatus('DELIVERED', 'FAILED')).toBe('FAILED');
  });

  it('does not resurrect a failed or skipped message with a late receipt', () => {
    expect(nextNotificationStatus('FAILED', 'DELIVERED')).toBeNull();
    expect(nextNotificationStatus('FAILED', 'READ')).toBeNull();
    expect(nextNotificationStatus('SKIPPED', 'DELIVERED')).toBeNull();
  });

  it('ignores a status outside the ladder rather than guessing', () => {
    expect(nextNotificationStatus('SENT', 'WAT')).toBeNull();
    expect(nextNotificationStatus('WAT', 'SENT')).toBeNull();
  });
});
