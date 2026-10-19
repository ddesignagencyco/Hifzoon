import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@hifzoon/shared';
import {
  createPrivateKey,
  createSign,
  createVerify,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

import { AppError } from '../../../common/errors/app-error';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  AuthorizationUrlInput,
  ExchangeInput,
  OAuthProfile,
  OAuthProviderAdapter,
} from './oauth-provider';
import { providerError, postForm, str } from './oauth.http';

const AUTH_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const JWKS_ENDPOINT = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

/** Apple caps a client secret at six months; 30 days keeps rotation uneventful. */
const CLIENT_SECRET_TTL_SECONDS = 30 * 86_400;

/**
 * "Sign in with Apple" (FR-AUTH-01).
 *
 * Apple is the awkward one of the two, and the awkwardness is worth writing down:
 *
 *   - **The client secret is a JWT, not a string.** Apple wants a short-lived ES256
 *     assertion signed with the team's `.p8` key. Handing it a static secret does not
 *     work, so it is minted per request from `APPLE_PRIVATE_KEY`.
 *
 *   - **There is no userinfo endpoint.** The profile is inside the `id_token`, which
 *     must be verified locally against Apple's published JWKS — signature, `iss`, `aud`
 *     and `nonce` — because an unverified `id_token` is just an attacker-supplied blob.
 *
 *   - **The email is only sent once**, on the very first authorization for a given
 *     Services ID. Every later sign-in returns a subject and nothing else. So `email`
 *     being null is *normal* and must not be treated as a failure: it is resolved by
 *     `providerUserId` instead.
 *
 * Apple posts the callback as `application/x-www-form-urlencoded` (response_mode
 * form_post), which is why the controller accepts either a JSON body or form fields.
 */
@Injectable()
export class AppleOAuthProvider implements OAuthProviderAdapter {
  readonly name = 'apple' as const;

  private readonly jwks = new Map<string, KeyObject>();

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = this.config.value;
    return Boolean(APPLE_CLIENT_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY);
  }

  missingEnv(): string[] {
    const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = this.config.value;
    const missing: string[] = [];
    if (!APPLE_CLIENT_ID) missing.push('APPLE_CLIENT_ID');
    if (!APPLE_TEAM_ID) missing.push('APPLE_TEAM_ID');
    if (!APPLE_KEY_ID) missing.push('APPLE_KEY_ID');
    if (!APPLE_PRIVATE_KEY) missing.push('APPLE_PRIVATE_KEY');
    return missing;
  }

  authorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', this.config.value.APPLE_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    // Apple only ever returned these two scopes.
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    // `form_post` rather than the query-string default: Apple only returns the user's
    // name on the first authorization, and only over POST.
    url.searchParams.set('response_mode', 'form_post');
    return url.toString();
  }

  async exchange(input: ExchangeInput): Promise<OAuthProfile> {
    const token = await postForm(TOKEN_ENDPOINT, {
      code: input.code,
      client_id: this.config.value.APPLE_CLIENT_ID ?? '',
      client_secret: this.clientSecret(),
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    });

    const idToken = str(token, 'id_token');
    if (!idToken) throw providerError('apple', 'token response contained no id_token');

    const claims = await this.verifyIdToken(idToken, input.nonce);

    return {
      providerUserId: claims.sub,
      // Null on every sign-in after the first: Apple withholds it. Not an error.
      email: claims.email ? claims.email.toLowerCase() : null,
      // Apple only includes an email when it has verified it at our request, so its
      // presence is the verification. Absent email → nothing to verify.
      emailVerified: Boolean(claims.email),
      name: null,
      pictureUrl: null,
    };
  }

  /** The ES256 client secret Apple expects, signed with the team key. */
  private clientSecret(): string {
    const { APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = this.config.value;
    if (!APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
      throw AppError.notImplemented('Sign in with Apple');
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: APPLE_KEY_ID, typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({
        iss: APPLE_TEAM_ID,
        iat: issuedAt,
        exp: issuedAt + CLIENT_SECRET_TTL_SECONDS,
        aud: APPLE_ISSUER,
        sub: APPLE_CLIENT_ID,
      }),
    );

    try {
      const privateKey = createPrivateKey(APPLE_PRIVATE_KEY);
      const signer = createSign('SHA256');
      signer.update(`${header}.${payload}`);
      signer.end();
      // `ieee-p1363` makes Node emit the fixed-length r||s signature Apple expects.
      // Without it ES256 produces DER, and Apple rejects the token as malformed —
      // a failure that surfaces as an opaque `invalid_client`.
      const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
      return `${header}.${payload}.${signature.toString('base64url')}`;
    } catch (error) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'Could not sign the Apple client secret', {
        reason: (error as Error).message,
      });
    }
  }

  /**
   * Verifies the `id_token` against Apple's published keys.
   *
   * Every check here is load-bearing. Signature alone is not enough: without `aud` an
   * Apple token minted for *another* app would be accepted here, and without the
   * `nonce` comparison a token intercepted from another session would replay.
   */
  private async verifyIdToken(
    idToken: string,
    expectedNonce: string,
  ): Promise<{ sub: string; email: string | null }> {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw providerError('apple', 'id_token is not a three-part JWT');

    const [rawHeader, rawPayload, rawSignature] = parts;
    let header: { kid?: unknown; alg?: unknown };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as typeof header;
      claims = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
    } catch {
      throw providerError('apple', 'id_token header or payload is not valid JSON');
    }

    if (header.alg !== 'RS256') {
      throw providerError('apple', `unexpected id_token algorithm "${String(header.alg)}"`);
    }

    const keyId = typeof header.kid === 'string' ? header.kid : '';
    const key = await this.signingKey(keyId);
    const verifier = createVerify('SHA256');
    verifier.update(`${rawHeader}.${rawPayload}`);
    verifier.end();
    if (!verifier.verify(key, Buffer.from(rawSignature, 'base64url'))) {
      throw providerError('apple', 'id_token signature did not verify against Apple JWKS');
    }

    if (claims.iss !== APPLE_ISSUER) {
      throw providerError('apple', `unexpected issuer "${String(claims.iss)}"`);
    }
    if (claims.aud !== this.config.value.APPLE_CLIENT_ID) {
      throw providerError('apple', 'id_token audience is not this Services ID');
    }
    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw providerError('apple', 'id_token contained no subject');
    }
    if (claims.nonce !== expectedNonce) {
      // A token replayed from another sign-in attempt: the nonce binds it to *our*
      // authorisation URL, and it is the one check a stolen token cannot pass.
      throw providerError('apple', 'id_token nonce does not match this sign-in attempt');
    }
    const exp = typeof claims.exp === 'number' ? claims.exp : 0;
    if (exp * 1000 <= Date.now()) throw providerError('apple', 'id_token has expired');

    return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
  }

  /** Fetches and caches Apple's JWKS, refreshing once when a `kid` is unknown. */
  private async signingKey(kid: string): Promise<KeyObject> {
    const cached = this.jwks.get(kid);
    if (cached) return cached;

    const keys = await this.fetchJwks();
    for (const jwk of keys) {
      const key = jwkToPublicKey(jwk);
      if (key) this.jwks.set(jwk.kid, key);
    }

    const key = this.jwks.get(kid);
    if (!key) {
      throw providerError('apple', `no Apple signing key for kid "${kid}"`);
    }
    return key;
  }

  private async fetchJwks(): Promise<Array<{ kid: string; kty?: string; n?: string; e?: string }>> {
    const response = await fetch(JWKS_ENDPOINT, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new AppError(ErrorCode.DEPENDENCY_UNAVAILABLE, 'Could not fetch Apple signing keys', {
        status: response.status,
      });
    }
    const body = (await response.json()) as { keys?: unknown };
    return Array.isArray(body.keys) ? (body.keys as Array<{ kid: string }>) : [];
  }
}

/** Turns one JWKS entry into a usable public key, or null if it is not an RSA key. */
function jwkToPublicKey(jwk: {
  kid: string;
  kty?: string;
  n?: string;
  e?: string;
}): KeyObject | null {
  if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) return null;
  try {
    return createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e } as never, format: 'jwk' });
  } catch {
    return null;
  }
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
