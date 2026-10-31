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

  get cloudinary(): {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
    signedUrlTtlSeconds: number;
  } {
    const s = this.config;
    return {
      cloudName: s.CLOUDINARY_CLOUD_NAME ?? '',
      apiKey: s.CLOUDINARY_API_KEY ?? '',
      apiSecret: s.CLOUDINARY_API_SECRET ?? '',
      signedUrlTtlSeconds: s.STORAGE_SIGNED_URL_TTL_SECONDS,
    };
  }

  /**
   * LiveKit Egress's S3 target. Cloudinary has no S3-compatible endpoint, so class
   * recordings need a separate bucket; everything else is stored in Cloudinary.
   */
  get recordingStorage(): {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
  } | null {
    const s = this.config;
    if (
      !s.RECORDING_STORAGE_ENDPOINT ||
      !s.RECORDING_STORAGE_BUCKET ||
      !s.RECORDING_STORAGE_ACCESS_KEY ||
      !s.RECORDING_STORAGE_SECRET_KEY
    ) {
      return null;
    }
    return {
      endpoint: s.RECORDING_STORAGE_ENDPOINT,
      region: s.RECORDING_STORAGE_REGION,
      bucket: s.RECORDING_STORAGE_BUCKET,
      accessKey: s.RECORDING_STORAGE_ACCESS_KEY,
      secretKey: s.RECORDING_STORAGE_SECRET_KEY,
      forcePathStyle: s.RECORDING_STORAGE_FORCE_PATH_STYLE,
    };
  }
}
