import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AppConfigService } from '../config/app-config.service';

/**
 * Prisma lifecycle wrapper. Also the single place that logs slow queries and maps
 * Prisma errors, so no feature module has to remember to.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    const log: Prisma.LogDefinition[] = [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ];
    if (config.nodeEnv === 'development') log.push({ emit: 'event', level: 'query' });

    super({ datasources: { db: { url: config.databaseUrl } }, log });

    const slowQueryMs = 200;
    this.$on('warn' as never, (event: Prisma.LogEvent) => this.logger.warn(event.message));
    this.$on('error' as never, (event: Prisma.LogEvent) => this.logger.error(event.message));
    this.$on('query' as never, (event: Prisma.QueryEvent) => {
      if (event.duration >= slowQueryMs) {
        this.logger.warn(`Slow query ${event.duration}ms: ${event.query}`);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Health probe for the readiness endpoint (NFR-MNT-02). */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`Database ping failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Runs `work` inside a transaction with the caller's roles exposed to the
   * `app.user_roles` GUC, which the RLS policy on case_record reads (FR-QA-05).
   */
  async withRoleContext<T>(
    roles: string[],
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_roles', ${roles.join(',')}, true)`;
      return work(tx);
    });
  }
}
