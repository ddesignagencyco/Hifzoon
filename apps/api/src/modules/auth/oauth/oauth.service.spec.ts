import { ErrorCode, Role } from '@hifzoon/shared';

import { OAuthService } from './oauth.service';
import type { ExchangeInput, OAuthProfile, OAuthProviderAdapter } from './oauth-provider';

/**
 * Federated sign-in rules (FR-AUTH-01).
 *
 * Prisma and Redis are mocked at the query level so these tests assert the *decisions*
 * the service makes, not the shape of its internals: which row it looks up, and whether
 * it creates an account, links one, or refuses.
 *
 * The cases that matter most are the refusals. A silent account link is the failure mode
 * that turns an OAuth rollout into an account-takeover vector, so "an existing password
 * account must not be claimed by a matching email" is pinned here explicitly.
 */
function buildHarness(
  options: {
    profile?: Partial<OAuthProfile>;
    existingLink?: { userId: string } | null;
    userByEmail?: Record<string, unknown> | null;
    userById?: Record<string, unknown> | null;
    corsOrigins?: string[] | true;
    configured?: boolean;
  } = {},
) {
  const profile: OAuthProfile = {
    providerUserId: 'google-sub-1',
    email: 'parent@example.com',
    emailVerified: true,
    name: 'Ayesha Khan',
    pictureUrl: null,
    ...options.profile,
  };

  const state = {
    profile,
    created: [] as Array<Record<string, unknown>>,
    links: [] as Array<Record<string, unknown>>,
    consumedStates: new Set<string>(),
    storedStates: new Map<string, unknown>(),
    sessions: 0,
  };

  const prisma = {
    oAuthAccount: {
      findUnique: jest.fn(async () => options.existingLink ?? null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.links.push(data);
        return data;
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.email) return options.userByEmail ?? null;
        return options.userById ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
        return {
          id: 'new-user-1',
          email: data.email,
          name: data.name,
          language: 'en',
          timeZone: 'UTC',
          status: 'ACTIVE',
          twoFactorEnabled: false,
          lastActiveAt: null,
          roles: [{ role: 'GUARDIAN' }],
        };
      }),
      update: jest.fn(async () => ({ id: 'user-1' })),
    },
  };

  const redis = {
    key: (...parts: Array<string | number>) => ['hifzoon', ...parts].join(':'),
    // Round-trips through a string exactly as ioredis does, so the service cannot get
    // away with storing a live object reference it would still hold at callback time.
    setJson: jest.fn(async (key: string, value: unknown) => {
      state.storedStates.set(key, JSON.stringify(value));
    }),
    connection: {
      getdel: jest.fn(async (key: string) => {
        const value = state.storedStates.get(key) ?? null;
        state.storedStates.delete(key);
        if (value) state.consumedStates.add(key);
        return value;
      }),
    },
  };

  const exchange = jest.fn(async (_input: ExchangeInput) => profile);

  const adapter: OAuthProviderAdapter = {
    name: 'google',
    isConfigured: () => options.configured ?? true,
    missingEnv: () => ((options.configured ?? true) ? [] : ['GOOGLE_CLIENT_ID']),
    authorizationUrl: (input) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}&nonce=${input.nonce}&challenge=${input.codeChallenge}`,
    exchange,
  };

  const auth = {
    issueSession: jest.fn(async () => {
      state.sessions += 1;
      return {
        accessToken: 'access-token',
        expiresIn: 900,
        refreshToken: 'refresh-token',
        user: {
          id: 'user-1',
          email: null,
          name: 'A',
          roles: [Role.GUARDIAN],
          status: 'ACTIVE',
          twoFactorEnabled: false,
          lastActiveAt: null,
        },
      };
    }),
  };

  const audit = { record: jest.fn(async () => undefined) };
  const config = { value: { corsOrigins: options.corsOrigins ?? ['http://localhost:3000'] } };

  const service = new OAuthService(
    prisma as never,
    redis as never,
    auth as never,
    audit as never,
    config as never,
    { google: adapter },
  );

  return { service, prisma, redis, adapter, exchange, auth, audit, state, profile };
}

const CALLBACK = { code: 'auth-code', redirectUri: 'http://localhost:3000/auth/callback' };

describe('OAuthService.start', () => {
  it('mints state, nonce and a PKCE challenge, and stores the verifier server-side', async () => {
    const { service, redis, state } = buildHarness();

    const start = await service.start('google', { redirectUri: CALLBACK.redirectUri });

    expect(start.state).toHaveLength(43);
    expect(start.expiresIn).toBe(600);
    expect(start.authorizationUrl).toContain(`state=${start.state}`);
    // The verifier must never appear in anything sent to the provider.
    expect(start.authorizationUrl).not.toContain('codeVerifier');

    const stored = JSON.parse([...state.storedStates.values()][0] as string) as Record<
      string,
      unknown
    >;
    expect(stored.codeVerifierFor).toEqual(expect.any(String));
    expect(redis.setJson).toHaveBeenCalledWith(expect.any(String), stored, 600);
  });

  it('refuses an unconfigured provider with the env vars that are missing', async () => {
    const { service } = buildHarness({ configured: false });

    await expect(
      service.start('google', { redirectUri: CALLBACK.redirectUri }),
    ).rejects.toMatchObject({
      code: ErrorCode.NOT_IMPLEMENTED,
      details: { missingEnv: ['GOOGLE_CLIENT_ID'] },
    });
  });

  it('refuses a redirect URI outside the allowed origins (open-redirect guard)', async () => {
    const { service } = buildHarness();

    await expect(
      service.start('google', { redirectUri: 'https://evil.example/steal' }),
    ).rejects.toMatchObject({ code: ErrorCode.OAUTH_STATE_INVALID });
  });

  it('allows any origin when CORS_ORIGINS is *, which is development only', async () => {
    const { service } = buildHarness({ corsOrigins: true });

    await expect(
      service.start('google', { redirectUri: 'https://anywhere.example/cb' }),
    ).resolves.toMatchObject({ expiresIn: 600 });
  });

  it('rejects an unknown provider rather than defaulting to one', async () => {
    const { service } = buildHarness();

    await expect(
      service.start('facebook', { redirectUri: CALLBACK.redirectUri }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe('OAuthService.callback', () => {
  /** Runs /start so a live `state` exists, then completes the callback with it. */
  async function startThenCallback(
    harness: ReturnType<typeof buildHarness>,
    overrides: { linkToUserId?: string } = {},
  ) {
    const { service } = harness;
    const { state } = await service.start('google', {
      redirectUri: CALLBACK.redirectUri,
      linkToUserId: overrides.linkToUserId ?? null,
    });
    return service.callback('google', { ...CALLBACK, state }, {});
  }

  it('signs in an existing linked user without creating anything', async () => {
    const harness = buildHarness({
      existingLink: { userId: 'user-1' },
      userById: {
        id: 'user-1',
        email: 'parent@example.com',
        name: 'Ayesha',
        language: 'en',
        timeZone: 'UTC',
        status: 'ACTIVE',
        twoFactorEnabled: false,
        lastActiveAt: null,
        roles: [{ role: 'GUARDIAN' }],
      },
    });

    await startThenCallback(harness);

    expect(harness.auth.issueSession).toHaveBeenCalledTimes(1);
    expect(harness.prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates an account on a first sign-in, with no password and email verified', async () => {
    const harness = buildHarness();

    await startThenCallback(harness);

    expect(harness.prisma.user.create).toHaveBeenCalledTimes(1);
    const created = harness.prisma.user.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(created.email).toBe('parent@example.com');
    // No password means a later OAuth sign-in for the same address may link freely.
    expect(created.passwordHash).toBeNull();
    expect(created.emailVerifiedAt).toBeInstanceOf(Date);
    expect(created.roles).toEqual({ create: [{ role: 'GUARDIAN' }] });
  });

  it('refuses a state that was never issued', async () => {
    const harness = buildHarness();

    await expect(
      harness.service.callback('google', { ...CALLBACK, state: 'x'.repeat(43) }, {}),
    ).rejects.toMatchObject({ code: ErrorCode.OAUTH_STATE_INVALID });
    expect(harness.exchange).not.toHaveBeenCalled();
  });

  it('refuses a replayed state — GETDEL removes it after one use', async () => {
    const harness = buildHarness();
    const { service } = harness;

    const { state } = await service.start('google', { redirectUri: CALLBACK.redirectUri });
    await expect(service.callback('google', { ...CALLBACK, state }, {})).resolves.toBeDefined();

    // Exactly the same callback a second time, as an attacker replaying a captured URL.
    await expect(service.callback('google', { ...CALLBACK, state }, {})).rejects.toMatchObject({
      code: ErrorCode.OAUTH_STATE_INVALID,
    });
  });

  it('refuses a callback whose redirect URI differs from the one it started with', async () => {
    const harness = buildHarness();
    const { state } = await harness.service.start('google', {
      redirectUri: CALLBACK.redirectUri,
    });

    await expect(
      harness.service.callback(
        'google',
        { ...CALLBACK, state, redirectUri: 'http://localhost:3000/other' },
        {},
      ),
    ).rejects.toMatchObject({ code: ErrorCode.OAUTH_STATE_INVALID });
  });

  it('passes the stored PKCE verifier and nonce to the provider', async () => {
    const harness = buildHarness();
    await startThenCallback(harness);

    const exchanged = harness.exchange.mock.calls[0][0];
    expect(exchanged.codeVerifier).toEqual(expect.any(String));
    expect(exchanged.nonce).toEqual(expect.any(String));
  });

  it('refuses to create an account from an unverified email', async () => {
    const harness = buildHarness({ profile: { emailVerified: false } });

    await expect(startThenCallback(harness)).rejects.toMatchObject({
      code: ErrorCode.OAUTH_EMAIL_UNVERIFIED,
    });
    expect(harness.prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses when the provider shares no email at all (Apple after first sign-in)', async () => {
    const harness = buildHarness({ profile: { email: null } });

    await expect(startThenCallback(harness)).rejects.toMatchObject({
      code: ErrorCode.OAUTH_EMAIL_UNVERIFIED,
    });
  });

  describe('account linking', () => {
    const passwordAccount = {
      id: 'user-9',
      email: 'parent@example.com',
      name: 'Ayesha',
      language: 'en',
      timeZone: 'UTC',
      status: 'ACTIVE',
      twoFactorEnabled: false,
      lastActiveAt: null,
      passwordHash: 'argon2-hash',
      roles: [{ role: 'GUARDIAN' }],
    };

    it('refuses to silently claim an existing account that has a password', async () => {
      const harness = buildHarness({ userByEmail: passwordAccount });

      await expect(startThenCallback(harness)).rejects.toMatchObject({
        code: ErrorCode.OAUTH_LINK_REQUIRED,
      });
      expect(harness.prisma.oAuthAccount.create).not.toHaveBeenCalled();
      expect(harness.auth.issueSession).not.toHaveBeenCalled();
    });

    it('links automatically when the existing account has no password', async () => {
      const harness = buildHarness({
        userByEmail: { ...passwordAccount, passwordHash: null },
        userById: passwordAccount,
      });

      await startThenCallback(harness);

      expect(harness.prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9' }) }),
      );
      expect(harness.auth.issueSession).toHaveBeenCalledTimes(1);
    });

    it('links to the signed-in account when the caller presents a matching token', async () => {
      const harness = buildHarness({ userByEmail: passwordAccount, userById: passwordAccount });

      await startThenCallback(harness, { linkToUserId: 'user-9' });

      expect(harness.prisma.oAuthAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9' }) }),
      );
    });

    it('does not link to a signed-in account that does not own that email', async () => {
      const harness = buildHarness({ userByEmail: passwordAccount, userById: passwordAccount });

      await expect(
        startThenCallback(harness, { linkToUserId: 'someone-else' }),
      ).rejects.toMatchObject({ code: ErrorCode.OAUTH_LINK_REQUIRED });
    });
  });

  describe('account state', () => {
    const linkedUser = {
      existingLink: { userId: 'user-1' },
      userById: {
        id: 'user-1',
        email: 'parent@example.com',
        name: 'Ayesha',
        language: 'en',
        timeZone: 'UTC',
        status: 'DISABLED',
        twoFactorEnabled: false,
        lastActiveAt: null,
        roles: [{ role: 'GUARDIAN' }],
      },
    };

    it('refuses a disabled account — a lockout must not be bypassable via OAuth', async () => {
      const harness = buildHarness(linkedUser);

      await expect(startThenCallback(harness)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
      expect(harness.auth.issueSession).not.toHaveBeenCalled();
    });

    it('refuses a locked account', async () => {
      const harness = buildHarness({
        ...linkedUser,
        userById: { ...linkedUser.userById, status: 'LOCKED' },
      });

      await expect(startThenCallback(harness)).rejects.toMatchObject({
        code: ErrorCode.ACCOUNT_LOCKED,
      });
    });

    it('refuses an OAuth sign-in to a staff account with 2FA enabled', async () => {
      const harness = buildHarness({
        ...linkedUser,
        userById: {
          ...linkedUser.userById,
          status: 'ACTIVE',
          twoFactorEnabled: true,
          roles: [{ role: 'SUPER_ADMIN' }],
        },
      });

      await expect(startThenCallback(harness)).rejects.toMatchObject({
        code: ErrorCode.TWO_FACTOR_REQUIRED,
      });
      expect(harness.auth.issueSession).not.toHaveBeenCalled();
    });
  });
});
