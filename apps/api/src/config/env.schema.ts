import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at boot (TRD section 5.1,
 * PLAT-BE-01). A missing or malformed value fails the process rather than surfacing
 * as a runtime 500 later.
 */

const booleanish = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback)
    .transform((v) => v === 'true' || v === '1');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Production refuses the placeholder secrets shipped in `.env.example` (NFR-SEC-01). */
const strongSecret = (min: number) =>
  z
    .string()
    .min(min, `must be at least ${min} characters`)
    .refine(
      (v) => !v.includes('change-me') || process.env.NODE_ENV !== 'production',
      'placeholder secret rejected in production (NFR-SEC-01)',
    );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('api/v1'),
    CORS_ORIGINS: csv.default('http://localhost:3000'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    REDIS_TLS: booleanish('false'),

    JWT_ACCESS_SECRET: strongSecret(32),
    JWT_REFRESH_SECRET: strongSecret(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_ISSUER: z.string().default('hifzoon-api'),
    JWT_AUDIENCE: z.string().default('hifzoon-web'),
    TWO_FACTOR_ENCRYPTION_KEY: strongSecret(16),
    TOKEN_PEPPER: strongSecret(16),
    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: booleanish('true'),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),

    STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_BUCKET: z.string().default('hifzoon'),
    STORAGE_ACCESS_KEY: z.string().default('minioadmin'),
    STORAGE_SECRET_KEY: z.string().default('minioadmin'),
    STORAGE_FORCE_PATH_STYLE: booleanish('true'),
    STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    OTEL_ENABLED: booleanish('false'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    SENTRY_ENABLED: booleanish('false'),
    SENTRY_DSN: z.string().optional(),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

    VIDEO_PROVIDER: z.enum(['fake', 'livekit']).default('fake'),
    PAYMENT_PROVIDER: z.enum(['fake', 'stripe', 'paypal']).default('fake'),
    MAIL_PROVIDER: z.enum(['log', 'resend', 'ses']).default('log'),
    WHATSAPP_PROVIDER: z.enum(['fake', 'whatsapp_cloud']).default('fake'),
    QURAN_CONTENT_PROVIDER: z.enum(['fake', 'quran_foundation']).default('fake'),
    SPEECH_PROVIDER: z.enum(['fake', 'openai']).default('fake'),

    LIVEKIT_URL: z.string().optional(),
    LIVEKIT_API_KEY: z.string().optional(),
    LIVEKIT_API_SECRET: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    PAYPAL_CLIENT_ID: z.string().optional(),
    PAYPAL_CLIENT_SECRET: z.string().optional(),
    PAYPAL_WEBHOOK_ID: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    QURAN_CONTENT_API_KEY: z.string().optional(),
    SPEECH_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const required = (
      key: 'GOOGLE_CLIENT_SECRET' | 'LIVEKIT_API_SECRET' | 'STRIPE_SECRET_KEY' | 'RESEND_API_KEY',
      provider: string,
      enabled: boolean,
    ) => {
      if (enabled && !env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when the provider is enabled`,
        });
      }
    };

    required('GOOGLE_CLIENT_SECRET', 'google', Boolean(env.GOOGLE_CLIENT_ID));
    required('LIVEKIT_API_SECRET', 'livekit', env.VIDEO_PROVIDER === 'livekit');
    required('STRIPE_SECRET_KEY', 'stripe', env.PAYMENT_PROVIDER === 'stripe');
    required('RESEND_API_KEY', 'resend', env.MAIL_PROVIDER === 'resend');

    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS=* is not allowed in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface AppConfig extends Env {
  isProduction: boolean;
  isTest: boolean;
  corsOrigins: string[] | true;
}

let cached: AppConfig | undefined;

/** Validates `process.env` once and memoises the result. */
export function loadConfig(overrides?: NodeJS.ProcessEnv): AppConfig {
  if (overrides) {
    const parsed = envSchema.parse(overrides);
    return toConfig(parsed);
  }
  if (!cached) {
    cached = toConfig(envSchema.parse(process.env));
  }
  return cached;
}

function toConfig(env: Env): AppConfig {
  return {
    ...env,
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
    corsOrigins: env.CORS_ORIGINS.includes('*') ? true : env.CORS_ORIGINS,
  };
}

/** Test helper — drops the memoised config so a test can boot with new values. */
export function resetConfigCache(): void {
  cached = undefined;
}
