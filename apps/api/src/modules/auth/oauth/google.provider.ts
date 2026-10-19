import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../config/app-config.service';
import type {
  AuthorizationUrlInput,
  ExchangeInput,
  OAuthProfile,
  OAuthProviderAdapter,
} from './oauth-provider';
import { providerError, postForm } from './oauth.http';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

/**
 * Google "Sign in with Google" (FR-AUTH-01).
 *
 * Verification strategy: exchange the code at Google's own token endpoint (which is
 * PKCE-bound, so the code cannot have been minted for a different challenge), then read
 * the profile from the userinfo endpoint over TLS with that access token. Decoding the
 * `id_token` locally instead would mean shipping key handling for no benefit — the
 * token endpoint is the authority, and it is the call that actually proves the code was
 * issued for *this* client and *this* redirect URI.
 *
 * `offline` access is deliberately not requested: Hifzoon issues its own long-lived
 * refresh tokens, so Google's refresh token would be a second, unrevoked credential
 * sitting in the database for no benefit.
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProviderAdapter {
  readonly name = 'google' as const;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.value.GOOGLE_CLIENT_ID && this.config.value.GOOGLE_CLIENT_SECRET);
  }

  missingEnv(): string[] {
    const missing: string[] = [];
    if (!this.config.value.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
    if (!this.config.value.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
    return missing;
  }

  authorizationUrl(input: AuthorizationUrlInput): string {
    const url = new URL(AUTH_ENDPOINT);
    url.searchParams.set('client_id', this.config.value.GOOGLE_CLIENT_ID ?? '');
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    // `openid` is what makes Google return `email_verified`; without it the assertion
    // this whole adapter depends on is simply absent.
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', input.state);
    url.searchParams.set('nonce', input.nonce);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchange(input: ExchangeInput): Promise<OAuthProfile> {
    const token = await postForm(TOKEN_ENDPOINT, {
      code: input.code,
      client_id: this.config.value.GOOGLE_CLIENT_ID ?? '',
      client_secret: this.config.value.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: input.codeVerifier,
    });

    if (typeof token.access_token !== 'string' || !token.access_token) {
      throw providerError('google', 'token response contained no access_token');
    }

    const response = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
    });
    if (!response.ok) {
      throw providerError('google', `userinfo returned HTTP ${response.status}`);
    }

    const claims = (await response.json()) as {
      sub?: unknown;
      email?: unknown;
      email_verified?: unknown;
      name?: unknown;
      picture?: unknown;
    };

    if (typeof claims.sub !== 'string' || !claims.sub) {
      throw providerError('google', 'userinfo contained no subject id');
    }

    // Google may return `email_verified` as a boolean or as the string "true"; both are
    // real-world responses and treating the string as false would lock out real users.
    const emailVerified =
      claims.email_verified === true ||
      (typeof claims.email_verified === 'string' && claims.email_verified === 'true');

    return {
      providerUserId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email.toLowerCase() : null,
      emailVerified,
      name: typeof claims.name === 'string' ? claims.name : null,
      pictureUrl: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}
