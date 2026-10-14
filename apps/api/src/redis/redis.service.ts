import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

import { AppConfigService } from '../config/app-config.service';

/**
 * One shared Redis connection for caching, BullMQ and the Socket.IO adapter
 * (TRD section 4.1). BullMQ requires `maxRetriesPerRequest: null`, so the queue
 * factory builds its own connections; this instance is for application use.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    this.client = this.createClient('hifzoon');
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }

  get connection(): Redis {
    if (!this.client) this.client = this.createClient('hifzoon');
    return this.client;
  }

  /** BullMQ-safe connection options (blocking commands need retries disabled). */
  queueConnectionOptions(): RedisOptions {
    const url = new URL(this.config.redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username || undefined,
      password: url.password || undefined,
      tls: this.config.redisTls ? {} : undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  /** Duplicating connection, safe to use for pub/sub (Socket.IO adapter). */
  createClient(label: string): Redis {
    const url = this.config.redisUrl;
    const client = new Redis(url, {
      tls: this.config.redisTls ? {} : undefined,
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    client.on('error', (error: Error) => this.logger.error(`[${label}] ${error.message}`));
    return client;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.connection.ping()) === 'PONG';
    } catch (error) {
      this.logger.error(`Redis ping failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** Read-through cache helper: JSON in, JSON out, TTL in seconds. */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.connection.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.connection.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.connection.del(...keys);
  }

  /** Namespaced key builder so modules cannot collide. */
  key(...parts: Array<string | number>): string {
    return ['hifzoon', ...parts].join(':');
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
