import { Logger } from '@nestjs/common';

import type { AppConfig } from '../config/env.schema';

type Capture = (error: unknown, context?: Record<string, unknown>) => void;

let capture: Capture | undefined;
const teardown: Array<() => Promise<unknown>> = [];
let started = false;

/**
 * Env-gated observability bootstrap (PLAT-BE-05, NFR-MNT-02).
 *
 * Both exporters are opt-in. With the default config (`OTEL_ENABLED=false`,
 * `SENTRY_ENABLED=false`) this function imports neither SDK, so unit tests, e2e and a
 * plain `docker compose up` pay nothing for telemetry they are not sending anywhere.
 *
 * Called before the Nest application is created so the OpenTelemetry instrumentations
 * are registered before the framework opens its first socket. A cold failure to start an
 * exporter is logged and swallowed on purpose: losing traces must never stop the API from
 * serving traffic.
 */
export async function startTelemetry(config: AppConfig): Promise<void> {
  if (started) return;
  started = true;

  const logger = new Logger('Telemetry');
  await startTracing(config, logger);
  await startErrorReporting(config, logger);
}

async function startTracing(config: AppConfig, logger: Logger): Promise<void> {
  if (!config.OTEL_ENABLED) return;

  try {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] = await Promise.all([
      import('@opentelemetry/sdk-node'),
      import('@opentelemetry/auto-instrumentations-node'),
      import('@opentelemetry/exporter-trace-otlp-http'),
    ]);

    const endpoint = config.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/+$/, '');
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(
        endpoint ? { url: `${endpoint}/v1/traces` } : {},
      ),
      instrumentations: [
        // `fs` spans are enormous at this request volume and tell us nothing, so the one
        // noisiest instrumentation is the one thing deliberately switched off.
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();
    teardown.push(() => sdk.shutdown());
    const destination = config.OTEL_EXPORTER_OTLP_ENDPOINT
      ? ` → ${config.OTEL_EXPORTER_OTLP_ENDPOINT}`
      : '';
    logger.log(`OpenTelemetry tracing enabled${destination}`);
  } catch (error) {
    logger.warn(`OTEL_ENABLED but tracing failed to start: ${asMessage(error)}`);
  }
}

async function startErrorReporting(config: AppConfig, logger: Logger): Promise<void> {
  if (!config.SENTRY_ENABLED) return;
  if (!config.SENTRY_DSN) {
    logger.warn('SENTRY_ENABLED is set but SENTRY_DSN is missing; error reporting stays off');
    return;
  }

  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      // Tracing is owned by OpenTelemetry above; leaving Sentry's own sampler at 0 avoids
      // paying twice for spans and keeps a single trace tree (NFR-MNT-02).
      tracesSampleRate: 0,
    });

    capture = (error, context) => {
      Sentry.withScope((scope) => {
        if (context) scope.setContext('request', context);
        Sentry.captureException(error);
      });
    };
    teardown.push(() => Sentry.close(2000));
    logger.log('Sentry error reporting enabled');
  } catch (error) {
    logger.warn(`SENTRY_ENABLED but Sentry failed to start: ${asMessage(error)}`);
  }
}

/** Reports an unhandled error to Sentry when configured; a no-op otherwise. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  capture?.(error, context);
}

/** Flushes exporters on shutdown so buffered spans and events are not lost. */
export async function stopTelemetry(): Promise<void> {
  await Promise.allSettled(teardown.map((fn) => fn()));
  teardown.length = 0;
  capture = undefined;
  started = false;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
