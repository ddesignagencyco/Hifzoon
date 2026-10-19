import { describe, it, expect } from 'vitest';
import { statusTone } from '@/components/ui/primitives';

describe('statusTone', () => {
  it('tones class cancellations red whoever cancelled', () => {
    expect(statusTone('CANCELLED_FAMILY')).toBe('red');
    expect(statusTone('CANCELLED_TEACHER')).toBe('red');
    expect(statusTone('CANCELLED')).toBe('red');
  });

  it('keeps the existing tones', () => {
    expect(statusTone('COMPLETED')).toBe('green');
    expect(statusTone('SCHEDULED')).toBe('gold');
    expect(statusTone('unknown')).toBe('neutral');
  });
});
