import type { Response } from 'express';
import type { AuthTokensResponse } from '@hifzoon/shared';

import { type AppConfigService } from '../../config/app-config.service';

/**
 * The refresh cookie lives here and nowhere else (TRD section 6).
 *
 * Two controllers set it — password login and OAuth callback — and they must not be able
 * to disagree about `path`, `sameSite` or `secure`. A refresh cookie scoped to the wrong
 * path simply stops being sent, which presents to the user as being logged out at random
 * intervals rather than as a bug, so the options are defined once and shared.
 */
export const REFRESH_COOKIE = 'hifzoon_refresh';

/**
 * Path-scoped to the auth routes, so it is not attached to every request.
 *
 * Q6 — derived from `API_PREFIX` rather than written out. A hard-coded `/api/v1/auth`
 * silently stops matching the moment the prefix changes, and the symptom is a refresh
 * cookie that is set but never sent back: sessions that expire for no visible reason.
 */
function cookiePath(config: AppConfigService): string {
  const prefix = config.value.API_PREFIX.replace(/^\/+|\/+$/g, '');
  return `/${prefix}/auth`;
}

const MAX_AGE_MS = 30 * 86_400_000;

export function refreshCookieOptions(config: AppConfigService) {
  const { value } = config;
  return {
    httpOnly: true,
    secure: value.COOKIE_SECURE,
    domain: value.COOKIE_DOMAIN || undefined,
    sameSite: 'strict' as const,
    path: cookiePath(config),
  };
}

export function setRefreshCookie(
  res: Response,
  config: AppConfigService,
  refreshToken: string | undefined,
): void {
  if (!refreshToken) return;
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...refreshCookieOptions(config),
    maxAge: MAX_AGE_MS,
  });
}

export function clearRefreshCookie(res: Response, config: AppConfigService): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(config));
}

/**
 * Sets the refresh cookie and returns the response body with the refresh token removed.
 *
 * The token reaches the client in the httpOnly cookie only: returning it in the JSON body
 * as well would let any page script read it, which defeats the point of `httpOnly` (NFR-SEC-01).
 */
export function respondWithTokens(
  res: Response,
  config: AppConfigService,
  tokens: AuthTokensResponse,
): AuthTokensResponse {
  setRefreshCookie(res, config, tokens.refreshToken);
  const { refreshToken: _refreshToken, ...body } = tokens;
  return body;
}

/** Reads the refresh token from the cookie jar, for clients that do not send a body. */
export function readRefreshCookie(cookies: string | undefined): string | undefined {
  if (!cookies) return undefined;
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
