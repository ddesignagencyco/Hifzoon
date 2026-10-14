import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: Record<string, { status: 'up' | 'down'; latencyMs: number; error?: string }>;
  timestamp: string;
}

/**
 * Liveness and readiness (PLAT-BE-05, NFR-MNT-02).
 *
 * `/health/live` answers "is the process up" and never touches a dependency, so a
 * database blip cannot cause the orchestrator to kill a healthy process.
 * `/health/ready` answers "should traffic be routed here" and checks every
 * dependency the request path needs.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness probe (PLAT-BE-05)' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  @Public()
  @Get('ready')
  @SkipThrottle()
  @ApiOperation({ summary: 'Readiness probe including database and Redis (NFR-MNT-02)' })
  async ready(): Promise<HealthReport> {
    const [db, redis] = await Promise.all([
      this.timed(() => this.prisma.ping()),
      this.timed(() => this.redis.ping()),
    ]);

    const report: HealthReport = {
      status: db.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database: db, redis },
      timestamp: new Date().toISOString(),
    };
    return report;
  }

  private async timed(
    check: () => Promise<boolean>,
  ): Promise<{ status: 'up' | 'down'; latencyMs: number; error?: string }> {
    const startedAt = Date.now();
    try {
      const ok = await check();
      return {
        status: ok ? 'up' : 'down',
        latencyMs: Date.now() - startedAt,
        ...(ok ? {} : { error: 'check returned false' }),
      };
    } catch (error) {
      return { status: 'down', latencyMs: Date.now() - startedAt, error: (error as Error).message };
    }
  }
}
