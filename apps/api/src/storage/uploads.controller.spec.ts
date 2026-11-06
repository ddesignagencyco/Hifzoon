import 'reflect-metadata';

import { UploadsController } from './uploads.controller';

/**
 * The presign endpoint is public, so its rate limit is the only thing between an
 * anonymous caller and the bucket's quota. Pinned so it is not loosened by accident.
 */
describe('UploadsController.presign rate limit', () => {
  const handler = UploadsController.prototype.presign;

  it('allows a dozen presigns per ten minutes per caller', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(12);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(600_000);
  });
});
