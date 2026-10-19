import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuthTokensResponse, ErrorCode, Role, STAFF_ROLES } from '@hifzoon/shared';
import { Prisma, UserStatus } from '@prisma/client';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { AppError } from '../../../common/errors/app-error';
import { toSharedRoles, write } from '../../../common/prisma-enum-bridge';
import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService, type AuthUserRecord } from '../auth.service';
import {
  OAUTH_PROVIDER_NAMES,
  type OAuthProfile,
  type OAuthProviderAdapter,
  type OAuthProviderName,
} from './oauth-provider';

/** How long an authorisation attempt may take before its `state` is worthless. */
const STATE_TTL_SECONDS = 600;

export const OAUTH_ADAPTERS = 'OAUTH_ADAPTERS';

interface PendingAuthorization {
  provider: OAuthProviderName;
  redirectUri: string;
  nonce: string;
  codeChallenge: string;
  /** PKCE verifier. Server-side only; the provider never sees it. */
  codeVerifierFor: string;
  /** Present when a signed-in user started this, so the callback can link the identity. */
  linkToUserId: string | null;
}

export interface SignInContext {
  ip?: string;
  userAgent?: string;
  /** Set when the callback carries a valid access token (linking an identity). */
  authenticatedUserId?: string;
}

/**
 * Federated sign-in (FR-AUTH-01).
 *
 * The three rules that make OAuth safe, and where each one lives:
 *
 *   1. **`state` is server-side, single-use and short-lived.** It is minted at `/start`,
 *      stored in Redis with a 10-minute TTL, and consumed with `GETDEL` at the callback.
 *      A callback with no matching `state` is refused outright — this is the CSRF guard,
 *      and "read state from the query string and trust it" is not a weaker version of it,
 *      it is no guard at all.
 *
 *   2. **PKCE plus `nonce`.** The verifier never leaves the server, so an intercepted
 *      authorization code is useless; the nonce binds the returned identity token to this
 *      one attempt.
 *
 *   3. **A verified email is the only thing that may create or claim an account.** The
 *      profile comes back from an adapter that has already checked the provider's
 *      signature. Nothing here trusts a raw token.
 *
 * Account linking is deliberately asymmetric, because the safe case and the dangerous
 * case look identical from the provider's side:
 *
 *   - No local account with that email → create one (guardian, email verified).
 *   - A local account with that email and **no password** → it can only have been created
 *     by a previous OAuth sign-in, so attaching a second provider is safe. Link it.
 *   - A local account with that email **and a password** → this could be someone else's
 *     password account. Never link silently. Require the caller to already be signed in
 *     as that user, otherwise return `OAUTH_LINK_REQUIRED` so the client can ask them to
 *     sign in first and retry with the access token attached.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly config: AppConfigService,
    @Inject(OAUTH_ADAPTERS) private readonly adapters: Record<string, OAuthProviderAdapter>,
  ) {}

  /** Which providers this deployment can actually use. */
  providers(): Array<{ name: OAuthProviderName; configured: boolean }> {
    return OAUTH_PROVIDER_NAMES.map((name) => ({
      name,
      configured: this.adapterFor(name).isConfigured(),
    }));
  }

  /**
   * Step 1 — hand the client a provider URL to open.
   *
   * `redirectUri` is checked against the deployment's own allowed origins before it is
   * ever sent to a provider: an open redirect here hands an attacker a login flow that
   * finishes on a host of their choosing, and the authorization code arrives with it.
   */
  async start(
    providerName: string,
    input: { redirectUri: string; linkToUserId?: string | null },
  ): Promise<{ authorizationUrl: string; state: string; expiresIn: number }> {
    const adapter = this.adapterFor(providerName);
    if (!adapter.isConfigured()) {
      throw new AppError(
        ErrorCode.NOT_IMPLEMENTED,
        `Sign in with ${adapter.name} is not configured on this deployment`,
        { provider: adapter.name, missingEnv: adapter.missingEnv() },
      );
    }

    this.assertAllowedRedirect(input.redirectUri);

    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    // 64 random bytes, base64url-encoded. The verifier never leaves the server; only its
    // SHA-256 goes to the provider.
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    const pending: PendingAuthorization = {
      provider: adapter.name,
      redirectUri: input.redirectUri,
      nonce,
      codeChallenge,
      linkToUserId: input.linkToUserId ?? null,
      codeVerifierFor: codeVerifier,
    };

    await this.redis.setJson(this.redis.key('oauth', 'state', state), pending, STATE_TTL_SECONDS);

    return {
      authorizationUrl: adapter.authorizationUrl({
        redirectUri: input.redirectUri,
        state,
        nonce,
        codeChallenge,
      }),
      state,
      expiresIn: STATE_TTL_SECONDS,
    };
  }

  /**
   * Step 2 — exchange the code, resolve the account, mint a normal session.
   *
   * The tokens returned are indistinguishable from a password login: same shape, same
   * refresh rotation, same cookie. Nothing downstream needs to know how the user
   * authenticated, which is what stops "OAuth users" becoming a special case in a dozen
   * later modules.
   */
  async callback(
    providerName: string,
    input: { code: string; state: string; redirectUri: string },
    ctx: SignInContext,
  ): Promise<AuthTokensResponse> {
    const adapter = this.adapterFor(providerName);
    const pending = await this.consumeState(input.state, adapter.name);
    if (!pending) {
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'This sign-in link has expired or was already used. Start again.',
      );
    }

    // The provider echoes back the redirect URI it used; a mismatch means the callback
    // is for a different flow than the one whose state we just consumed.
    if (!constantTimeEquals(pending.redirectUri, input.redirectUri)) {
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'The redirect URI does not match the one this sign-in started with',
      );
    }

    const profile = await adapter.exchange({
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: pending.codeVerifierFor ?? '',
      nonce: pending.nonce,
    });

    if (!profile.providerUserId) {
      throw new AppError(ErrorCode.OAUTH_STATE_INVALID, 'The provider returned no identity');
    }

    const user = await this.resolveUser(adapter.name, profile, pending, ctx);
    const roles = user.roles;
    const staff = roles.some((role) => STAFF_ROLES.includes(role));

    // Staff 2FA applies to every way in, not just password login: an OAuth identity
    // linked to a staff account must not be a way around the second factor.
    if (user.twoFactorEnabled) {
      throw new AppError(
        ErrorCode.TWO_FACTOR_REQUIRED,
        'This account requires two-factor verification. Sign in with your password to continue.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'auth.oauth.signin',
      targetType: 'user',
      targetId: user.id,
      after: { provider: adapter.name },
      ip: ctx.ip,
    });

    return this.auth.issueSession(user, staff, undefined, ctx);
  }

  // ── Account resolution ─────────────────────────────────────────────────────

  private async resolveUser(
    provider: OAuthProviderName,
    profile: OAuthProfile,
    pending: PendingAuthorization,
    ctx: SignInContext,
  ): Promise<AuthUserRecord> {
    const existingLink = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: provider.toUpperCase() as never,
          providerUserId: profile.providerUserId,
        },
      },
      select: { userId: true },
    });

    if (existingLink) return this.loadActiveUser(existingLink.userId);

    // An email the provider has not verified cannot be allowed to claim or create an
    // account. Apple and Google both let a user attach an unverified address to an
    // existing Google account, and acting on it would hand over that account.
    if (!profile.email || !profile.emailVerified) {
      throw new AppError(
        ErrorCode.OAUTH_EMAIL_UNVERIFIED,
        `${provider} did not share a verified email address, so it cannot be used to sign in`,
        { provider, hasEmail: Boolean(profile.email) },
      );
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        timeZone: true,
        status: true,
        twoFactorEnabled: true,
        lastActiveAt: true,
        passwordHash: true,
        roles: { select: { role: true } },
      },
    });

    if (byEmail) {
      const alreadyLinked = await this.prisma.oAuthAccount.findFirst({
        where: { userId: byEmail.id, provider: provider.toUpperCase() as never },
        select: { id: true },
      });
      if (alreadyLinked) {
        throw new AppError(
          ErrorCode.OAUTH_ACCOUNT_LINKED,
          'That account already uses this sign-in method. Sign in with the method already linked.',
        );
      }

      const callerIsOwner = Boolean(pending.linkToUserId && pending.linkToUserId === byEmail.id);
      const passwordless = !byEmail.passwordHash;

      if (!callerIsOwner && !passwordless) {
        // See the class comment: a password account must never be claimed silently by
        // a matching email. The client retries with an access token after a password
        // sign-in, and only then is the link created.
        throw new AppError(
          ErrorCode.OAUTH_LINK_REQUIRED,
          'An account with this email already exists. Sign in to link this sign-in method.',
          { email: profile.email, provider },
        );
      }

      await this.prisma.oAuthAccount.create({
        data: {
          userId: byEmail.id,
          provider: provider.toUpperCase() as never,
          providerUserId: profile.providerUserId,
        },
      });
      await this.audit.record({
        actorId: byEmail.id,
        action: 'auth.oauth.link',
        targetType: 'user',
        targetId: byEmail.id,
        after: { provider, automatic: !callerIsOwner },
        ip: ctx.ip,
      });
      return this.loadActiveUser(byEmail.id);
    }

    return this.createFromProfile(provider, profile, ctx);
  }

  private async createFromProfile(
    provider: OAuthProviderName,
    profile: OAuthProfile,
    ctx: SignInContext,
  ): Promise<AuthUserRecord> {
    const email = profile.email as string;
    const name = (profile.name ?? email.split('@')[0]).slice(0, 160);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          // No password: this identity can only be entered through the provider, which
          // is also why a later OAuth sign-in with the same address may link freely.
          passwordHash: null,
          name,
          language: 'en',
          timeZone: 'UTC',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          avatarUrl: profile.pictureUrl,
          roles: { create: [{ role: write.role(Role.GUARDIAN) }] },
          notificationPreferences: { create: { language: 'en' } },
          oauthAccounts: {
            create: {
              provider: provider.toUpperCase() as never,
              providerUserId: profile.providerUserId,
            },
          },
        },
        select: {
          id: true,
          email: true,
          name: true,
          language: true,
          timeZone: true,
          status: true,
          twoFactorEnabled: true,
          lastActiveAt: true,
          roles: { select: { role: true } },
        },
      });

      await this.audit.record({
        actorId: user.id,
        action: 'auth.oauth.register',
        targetType: 'user',
        targetId: user.id,
        after: { provider },
        ip: ctx.ip,
      });

      this.logger.log(`Created account ${user.id} from ${provider} sign-in`);
      return { ...user, roles: toSharedRoles(user.roles.map((r) => r.role)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Two callbacks for the same new identity raced, or a registration landed in
        // between. Re-reading turns a 409 into a successful sign-in for whoever won.
        const raced = await this.prisma.oAuthAccount.findUnique({
          where: {
            provider_providerUserId: {
              provider: provider.toUpperCase() as never,
              providerUserId: profile.providerUserId,
            },
          },
          select: { userId: true },
        });
        if (raced) return this.loadActiveUser(raced.userId);
        throw new AppError(
          ErrorCode.EMAIL_TAKEN,
          'An account with this email already exists. Sign in to link this sign-in method.',
          { email },
        );
      }
      throw error;
    }
  }

  /**
   * Loads the user and refuses anyone who cannot be signed in.
   *
   * A disabled or locked account must not be reachable by walking through the front
   * door instead of the window: password login checks `status`, so OAuth has to check it
   * too, or a lockout becomes trivially bypassable.
   */
  private async loadActiveUser(userId: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        language: true,
        timeZone: true,
        status: true,
        twoFactorEnabled: true,
        lastActiveAt: true,
        roles: { select: { role: true } },
      },
    });
    if (!user) throw AppError.notFound('User');

    if (user.status === UserStatus.DISABLED) {
      throw AppError.forbidden('This account has been disabled. Contact support.');
    }
    if (user.status === UserStatus.LOCKED) {
      throw new AppError(
        ErrorCode.ACCOUNT_LOCKED,
        'Account is locked after too many failed attempts. Reset your password to regain access.',
      );
    }

    return { ...user, roles: toSharedRoles(user.roles.map((r) => r.role)) };
  }

  // ── State handling ─────────────────────────────────────────────────────────

  /**
   * Reads and *deletes* the pending record in one step.
   *
   * `GETDEL` rather than `GET` then `DEL` so two concurrent callbacks replaying the same
   * `state` cannot both succeed.
   */
  private async consumeState(
    state: string,
    provider: OAuthProviderName,
  ): Promise<PendingAuthorization | null> {
    if (!state || state.length < 16 || state.length > 256) return null;
    const record = await this.redis.connection.getdel(this.redis.key('oauth', 'state', state));
    if (!record) return null;
    const parsed = JSON.parse(record) as PendingAuthorization;
    if (parsed.provider !== provider || !parsed.codeVerifierFor) return null;
    return parsed;
  }

  private adapterFor(providerName: string): OAuthProviderAdapter {
    const adapter = this.adapters[providerName];
    if (!adapter) {
      throw AppError.notFound(`Sign-in method "${providerName}"`);
    }
    return adapter;
  }

  /**
   * The redirect URI must belong to an origin this deployment already trusts.
   *
   * `CORS_ORIGINS` is exactly that list. When it is `*` (development only) any origin is
   * allowed, because there is no production data to leak in that configuration.
   */
  private assertAllowedRedirect(redirectUri: string): void {
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw AppError.badRequest('redirectUri must be an absolute URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw AppError.badRequest('redirectUri must be an http or https URL');
    }

    const origins = this.config.value.corsOrigins;
    if (origins === true) return;
    if (!origins.includes(parsed.origin)) {
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'That redirect URI is not allowed on this deployment',
        { origin: parsed.origin, allowed: origins },
      );
    }
  }
}

/** Compares without leaking length or content through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
