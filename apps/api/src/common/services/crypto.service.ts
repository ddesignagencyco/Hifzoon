import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { hkdfSync } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Key management and token hashing.
 *
 *  - Argon2id for passwords (NFR-SEC-01). The native module is loaded lazily so the
 *    worker, the OpenAPI generator and unit tests without a native build still run.
 *  - AES-256-GCM for column-level encryption of 2FA secrets and ID documents
 *    (CMP-BE-02, CMP-BE-05), with the key derived per purpose via HKDF.
 *  - HMAC-SHA256 with a pepper for refresh / reset / verification tokens: a leaked
 *    database alone cannot be replayed against the API.
 */
@Injectable()
export class CryptoService {
  private readonly pepper: string;
  private readonly dataKey: Buffer;
  private readonly twoFactorKey: Buffer;

  constructor(private readonly config: AppConfigService) {
    const env = config.value;
    this.pepper = env.TOKEN_PEPPER;
    this.dataKey = deriveKey(env.TWO_FACTOR_ENCRYPTION_KEY, 'hifzoon:data:v1');
    this.twoFactorKey = deriveKey(env.TWO_FACTOR_ENCRYPTION_KEY, 'hifzoon:2fa:v1');
  }

  async hashPassword(plain: string): Promise<string> {
    const { default: argon2 } = await import('argon2');
    return argon2.hash(plain, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verifyPassword(hash: string, plain: string): Promise<boolean> {
    const { default: argon2 } = await import('argon2');
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** Dummy hash used to equalise timing when the email does not exist (NFR-SEC-04). */
  async dummyVerify(): Promise<void> {
    await this.verifyPassword(
      '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$J8Xk3wR5u1sQ0lZ2mZ1Yb0h3NqQ0h3NqQ0h3NqQ0h3NqQ',
      'invalid',
    );
  }

  /** Opaque random token handed to the user; only the HMAC of it is stored. */
  issueOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  hashToken(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  /** Constant-time compare for anything token-shaped (webhooks, invite codes). */
  safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  encrypt(value: string, purpose: EncryptionPurpose = 'data'): string {
    const key = this.keyFor(purpose);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  decrypt(payload: string, purpose: EncryptionPurpose = 'data'): string {
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.keyFor(purpose),
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Numeric OTP for 2FA challenges and guardian verification (FR-AUTH-01, CR-10). */
  generateNumericCode(digits = 6): string {
    const max = 10 ** digits;
    const value = randomBytes(4).readUInt32BE(0) % max;
    return value.toString().padStart(digits, '0');
  }

  randomId(bytes = 16): string {
    return randomBytes(bytes).toString('base64url');
  }

  private keyFor(purpose: EncryptionPurpose): Buffer {
    return purpose === 'two_factor' ? this.twoFactorKey : this.dataKey;
  }
}

export type EncryptionPurpose = 'data' | 'two_factor';

function deriveKey(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), info, 32));
}
