import type { AppConfig } from '../config/env.schema';

import { captureError, startTelemetry, stopTelemetry } from './telemetry';

const base = {
  NODE_ENV: 'test',
  OTEL_ENABLED: false,
  SENTRY_ENABLED: false,
} as AppConfig;

describe('telemetry bootstrap (PLAT-BE-05)', () => {
  afterEach(async () => {
    await stopTelemetry();
  });

  it('is inert when both exporters are disabled', async () => {
    await startTelemetry(base);

    // The default deployment must not import either SDK or throw when reporting an error.
    expect(() => captureError(new Error('boom'))).not.toThrow();
  });

  it('does not throw when error reporting is enabled without a DSN', async () => {
    await expect(
      startTelemetry({ ...base, SENTRY_ENABLED: true, SENTRY_DSN: undefined }),
    ).resolves.toBeUndefined();

    expect(() => captureError(new Error('boom'))).not.toThrow();
  });

  it('stops cleanly even when nothing was started', async () => {
    await expect(stopTelemetry()).resolves.toBeUndefined();
  });
});
