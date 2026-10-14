import { type AppConfigService } from '../../config/app-config.service';
import { CryptoService } from './crypto.service';

/**
 * NFR-SEC-01, CMP-BE-05 — password hashing, token hashing and column encryption.
 *
 * These run against the real implementations (argon2, node crypto), because a mocked
 * hash is worth nothing: the properties that matter — that a plaintext token is not
 * recoverable from storage, that a tampered ciphertext fails to decrypt — only exist
 * in the actual algorithms.
 */
function buildCrypto(): CryptoService {
  const config = {
    value: {
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-11',
      TWO_FACTOR_ENCRYPTION_KEY: 'test-2fa-encryption-key-22222222',
      TOKEN_PEPPER: 'test-token-pepper-3333333333',
      NODE_ENV: 'test',
    },
  } as unknown as AppConfigService;

  return new CryptoService(config);
}

describe('CryptoService (NFR-SEC-01)', () => {
  const crypto = buildCrypto();

  describe('password hashing', () => {
    it('NFR-SEC-01 produces an argon2id hash, not the password', async () => {
      const hash = await crypto.hashPassword('Hifzoon!Dev2026');

      expect(hash).toMatch(/^\$argon2id\$/);
      expect(hash).not.toContain('Hifzoon!Dev2026');
    });

    it('NFR-SEC-01 verifies the right password and rejects the wrong one', async () => {
      const hash = await crypto.hashPassword('Hifzoon!Dev2026');

      await expect(crypto.verifyPassword(hash, 'Hifzoon!Dev2026')).resolves.toBe(true);
      await expect(crypto.verifyPassword(hash, 'Hifzoon!Dev2027')).resolves.toBe(false);
    });

    it('NFR-SEC-01 salts, so the same password hashes differently every time', async () => {
      const [a, b] = await Promise.all([
        crypto.hashPassword('same-password'),
        crypto.hashPassword('same-password'),
      ]);
      expect(a).not.toBe(b);
    });

    it('NFR-SEC-01 returns false rather than throwing on a malformed hash', async () => {
      await expect(crypto.verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    });
  });

  describe('token hashing', () => {
    it('NFR-SEC-04 stores only a peppered HMAC of the reset token', () => {
      const token = crypto.issueOpaqueToken(32);
      const stored = crypto.hashToken(token);

      expect(stored).toHaveLength(64); // sha256 hex
      expect(stored).not.toContain(token);
      // Deterministic, so a replayed token is still recognisable.
      expect(crypto.hashToken(token)).toBe(stored);
    });

    it('NFR-SEC-04 produces a different hash for a different token', () => {
      expect(crypto.hashToken('token-a')).not.toBe(crypto.hashToken('token-b'));
    });

    it('NFR-SEC-04 compares tokens in constant time and handles length mismatch', () => {
      expect(crypto.safeEqual('abc123', 'abc123')).toBe(true);
      expect(crypto.safeEqual('abc123', 'abc124')).toBe(false);
      expect(crypto.safeEqual('abc', 'abcdef')).toBe(false);
    });
  });

  describe('column encryption (CMP-BE-05)', () => {
    it('CMP-BE-05 round-trips a value', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = crypto.encrypt(secret, 'two_factor');

      expect(encrypted).not.toContain(secret);
      expect(crypto.decrypt(encrypted, 'two_factor')).toBe(secret);
    });

    it('CMP-BE-05 uses a fresh IV, so the same plaintext encrypts differently', () => {
      const a = crypto.encrypt('same', 'data');
      const b = crypto.encrypt('same', 'data');
      expect(a).not.toBe(b);
    });

    it('CMP-BE-05 refuses a tampered ciphertext (authenticated encryption)', () => {
      const encrypted = crypto.encrypt('sensitive', 'two_factor');
      const [version, iv, tag, data] = encrypted.split('.');
      const flipped = `${version}.${iv}.${tag}.${data.slice(0, -2)}AA`;

      expect(() => crypto.decrypt(flipped, 'two_factor')).toThrow();
    });

    it('CMP-BE-05 separates purposes, so a 2FA blob cannot be read as data', () => {
      const encrypted = crypto.encrypt('secret', 'two_factor');
      expect(() => crypto.decrypt(encrypted, 'data')).toThrow();
    });

    it('CMP-BE-05 rejects a malformed payload', () => {
      expect(() => crypto.decrypt('garbage', 'data')).toThrow(/Malformed encrypted payload/);
    });
  });

  describe('codes', () => {
    it('FR-AUTH-01 generates a 6-digit TOTP-sized code as zero-padded digits', () => {
      for (let i = 0; i < 50; i += 1) {
        expect(crypto.generateNumericCode(6)).toMatch(/^\d{6}$/);
      }
    });

    it('CR-10 verification codes are the right length', () => {
      expect(crypto.generateNumericCode(6)).toHaveLength(6);
    });
  });
});
