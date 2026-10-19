import { describe, expect, it } from 'vitest';
import { formatUptime, healthApi } from '@/lib/api/modules/health';
import { envelope, mockApi } from '../helpers/fetch-mock';

describe('health API module', () => {
  it('reads liveness and readiness', async () => {
    mockApi({
      'GET /health/live': { body: envelope({ status: 'ok', uptimeSeconds: 90 }) },
      'GET /health/ready': {
        body: envelope({
          status: 'degraded',
          uptimeSeconds: 90,
          checks: { database: { status: 'up', latencyMs: 4 }, redis: { status: 'down', latencyMs: 2000, error: 'timeout' } },
          timestamp: '2026-10-19T10:00:00.000Z',
        }),
      },
    });
    expect((await healthApi.live()).uptimeSeconds).toBe(90);
    const ready = await healthApi.ready();
    expect(ready.status).toBe('degraded');
    expect(ready.checks.redis.error).toBe('timeout');
  });

  it('formats uptime compactly', () => {
    expect(formatUptime(45)).toBe('45s');
    expect(formatUptime(125)).toBe('2m');
    expect(formatUptime(7500)).toBe('2h 5m');
    expect(formatUptime(3 * 86400 + 4 * 3600)).toBe('3d 4h');
  });
});
