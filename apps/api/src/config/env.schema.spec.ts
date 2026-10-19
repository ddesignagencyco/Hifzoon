import { loadConfig } from './env.schema';

function parse(source: Record<string, string>) {
  return loadConfig({
    NODE_ENV: 'development',
    PORT: '4000',
    API_PREFIX: 'api/v1',
    CORS_ORIGINS: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://hifzoon:hifzoon@localhost:5435/hifzoon?schema=public',
    REDIS_URL: 'redis://localhost:6382',
    JWT_ACCESS_SECRET: 'dev-only-access-secret-change-me-0000000000000000000',
    JWT_REFRESH_SECRET: 'dev-only-refresh-secret-change-me-1111111111111111',
    JWT_ACCESS_TTL: '15m',
    JWT_ISSUER: 'hifzoon-api',
    JWT_AUDIENCE: 'hifzoon-web',
    TWO_FACTOR_ENCRYPTION_KEY: 'dev-only-2fa-key-change-me-22222222222222222',
    TOKEN_PEPPER: 'dev-only-token-pepper-change-me-3333333333333',
    ...source,
  });
}

describe('env.schema mail configuration', () => {
  it('accepts smtp with a host', () => {
    const env = parse({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost' });
    expect(env.MAIL_PROVIDER).toBe('smtp');
    // Defaults are MailHog's, so SMTP_HOST alone is a working local setup.
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
    expect(env.SMTP_ALLOW_UNTRUSTED).toBe(false);
  });

  // Without this, MAIL_PROVIDER=smtp falls through to the log adapter and mail is
  // reported as sent when nothing was delivered.
  it('rejects smtp without a host', () => {
    expect(() => parse({ MAIL_PROVIDER: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('leaves SMTP_HOST optional for the other providers', () => {
    expect(parse({ MAIL_PROVIDER: 'file' }).SMTP_HOST).toBeUndefined();
    expect(parse({ MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_x' }).SMTP_HOST).toBeUndefined();
  });

  it('coerces the port from a string', () => {
    expect(parse({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: '2525' }).SMTP_PORT).toBe(2525);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parse({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_PORT: '70000' })).toThrow();
  });

  it('reads the certificate-verification bypass as a boolean', () => {
    expect(parse({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_ALLOW_UNTRUSTED: 'true' }).SMTP_ALLOW_UNTRUSTED).toBe(
      true,
    );
    expect(parse({ MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_ALLOW_UNTRUSTED: 'false' }).SMTP_ALLOW_UNTRUSTED).toBe(
      false,
    );
  });

  // `log` and `file` deliver nothing. That is a fine local default and a silent data-loss
  // bug in production, so production has to choose a real provider.
  it('allows log and file in development', () => {
    expect(parse({ MAIL_PROVIDER: 'file' }).MAIL_PROVIDER).toBe('file');
    expect(parse({ MAIL_PROVIDER: 'log' }).MAIL_PROVIDER).toBe('log');
  });

  it.each(['log', 'file'])('refuses %s in production', (provider) => {
    expect(() => parse({ NODE_ENV: 'production', MAIL_PROVIDER: provider })).toThrow(/delivers nothing/);
  });

  it('allows smtp in production', () => {
    const env = parse({ NODE_ENV: 'production', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com' });
    expect(env.MAIL_PROVIDER).toBe('smtp');
  });

  it('rejects an unknown provider', () => {
    expect(() => parse({ MAIL_PROVIDER: 'mailhog' })).toThrow();
  });
});