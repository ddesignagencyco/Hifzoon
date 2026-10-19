import { http } from '../http';

/** `apps/api/src/health/health.controller.ts` — public probes (PLAT-BE-05, NFR-MNT-02). */
export interface LiveReport {
  status: 'ok';
  uptimeSeconds: number;
}

export interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface ReadyReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: { database: DependencyCheck; redis: DependencyCheck };
  timestamp: string;
}

export const healthApi = {
  live: () => http.get<LiveReport>('/health/live'),
  ready: () => http.get<ReadyReport>('/health/ready'),
};

/** "3d 4h", "2h 5m", "45s". */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
