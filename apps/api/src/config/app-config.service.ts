import { Injectable } from '@nestjs/common';

import { AppConfig, loadConfig } from './env.schema';

/**
 * Thin wrapper over the validated env so feature code depends on one injectable
 * instead of reaching for `process.env` (PORT-01: no provider specifics outside
 * `integrations/`).
 */
@Injectable()
export class AppConfigService {
  private readonly config: AppConfig = loadConfig();

  get value(): AppConfig {
    return this.config;
  }

  get nodeEnv(): string {
    return this.config.NODE_ENV;
  }

  get port(): number {
    return this.config.PORT;
  }

  get apiPrefix(): string {
    return this.config.API_PREFIX;
  }

  get isTest(): boolean {
    return this.config.isTest;
  }

  get isProduction(): boolean {
    return this.config.isProduction;
  }

  get databaseUrl(): string {
    return this.config.DATABASE_URL;
  }

  get redisUrl(): string {
    return this.config.REDIS_URL;
  }

  get redisTls(): boolean {
    return this.config.REDIS_TLS;
  }

  get cookieDomain(): string | undefined {
    return this.config.COOKIE_DOMAIN || undefined;
  }

  get cookieSecure(): boolean {
    return this.config.COOKIE_SECURE;
  }

  get storage(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
    signedUrlTtlSeconds: number;
  } {
    const s = this.config;
    return {
      endpoint: s.STORAGE_ENDPOINT,
      region: s.STORAGE_REGION,
      bucket: s.STORAGE_BUCKET,
      accessKey: s.STORAGE_ACCESS_KEY,
      secretKey: s.STORAGE_SECRET_KEY,
      forcePathStyle: s.STORAGE_FORCE_PATH_STYLE,
      signedUrlTtlSeconds: s.STORAGE_SIGNED_URL_TTL_SECONDS,
    };
  }
}
