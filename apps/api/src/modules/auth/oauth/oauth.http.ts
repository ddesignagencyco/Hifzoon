import { ErrorCode } from '@hifzoon/shared';

import { AppError } from '../../../common/errors/app-error';

/**
 * Token-endpoint plumbing shared by the OAuth adapters.
 *
 * Both providers want the same thing — a form POST that returns JSON, with the
 * provider's own error text preserved. Preserving that text matters: `invalid_grant`
 * means the code was already used (a replay), while `invalid_client` means the secret is
 * wrong, and collapsing both into "OAuth failed" makes the two impossible to tell apart
 * from a log.
 */

/** Provider misbehaved, or rejected us. Surfaces as 502, never as a 500. */
export function providerError(provider: string, detail: string, status?: number): AppError {
  return new AppError(
    ErrorCode.PROVIDER_ERROR,
    `OAuth provider "${provider}" rejected the request`,
    { provider, detail, ...(status === undefined ? {} : { status }) },
  );
}

/** POSTs `application/x-www-form-urlencoded` and parses the JSON response. */
export async function postForm(
  url: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    });
  } catch (error) {
    throw new AppError(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      'Could not reach the OAuth provider',
      { url, reason: (error as Error).message },
    );
  }

  const raw = await response.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    throw providerError(new URL(url).host, 'token endpoint returned a non-JSON body', response.status);
  }

  if (!response.ok) {
    throw providerError(
      new URL(url).host,
      typeof parsed.error === 'string' ? parsed.error : `HTTP ${response.status}`,
      response.status,
    );
  }

  return parsed;
}

/** Reads a string field out of an unknown JSON object. */
export function str(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  return typeof value === 'string' && value.length > 0 ? value : null;
}