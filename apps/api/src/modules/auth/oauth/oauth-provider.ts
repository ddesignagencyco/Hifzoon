/**
 * OAuth adapter contract (FR-AUTH-01, NFR-PORT-01).
 *
 * The same rule the video/payment/mail providers follow: feature code depends on this
 * interface, never on Google's or Apple's request formats. Adding a third provider is a
 * new file here plus one line in `oauth.module.ts`, not a rewrite of `OAuthService`.
 *
 * Every adapter must implement the whole flow — build the authorization URL, then turn
 * the callback's `code` into a *verified* profile. "Verified" means the identity was
 * checked against the provider's own signature, not merely decoded.
 */
export type OAuthProviderName = 'google' | 'apple';

export const OAUTH_PROVIDER_NAMES: readonly OAuthProviderName[] = ['google', 'apple'];

export interface OAuthProfile {
  /** Stable, provider-scoped subject id. Never an email — emails change. */
  providerUserId: string;
  /** Null when the provider withholds it (Apple only returns an email once). */
  email: string | null;
  /** Whether the provider asserts this email is verified. Gates every sign-in. */
  emailVerified: boolean;
  name: string | null;
  pictureUrl: string | null;
}

export interface AuthorizationUrlInput {
  redirectUri: string;
  state: string;
  nonce: string;
  /** S256 code challenge; both providers support PKCE. */
  codeChallenge: string;
}

export interface ExchangeInput {
  code: string;
  redirectUri: string;
  /** Verifier for the challenge issued at `/start`. */
  codeVerifier: string;
  nonce: string;
}

export interface OAuthProviderAdapter {
  readonly name: OAuthProviderName;
  /** False when the deployment has no credentials for this provider. */
  isConfigured(): boolean;
  /** Env var names to name in the 501, so the fix is obvious. */
  missingEnv(): string[];
  authorizationUrl(input: AuthorizationUrlInput): string;
  exchange(input: ExchangeInput): Promise<OAuthProfile>;
}
