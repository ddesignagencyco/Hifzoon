import { submittableFrom } from './lesson-cards.service';

describe('submittableFrom (mirrors assertClassFinished)', () => {
  const endsAt = new Date('2026-11-06T15:00:00.000Z');

  it('opens 10 minutes before the class ends', () => {
    expect(submittableFrom({ status: 'LIVE', endsAt })).toEqual(
      new Date('2026-11-06T14:50:00.000Z'),
    );
  });

  it('is open at once for a completed class', () => {
    expect(submittableFrom({ status: 'COMPLETED', endsAt })).toBeNull();
  });
});
