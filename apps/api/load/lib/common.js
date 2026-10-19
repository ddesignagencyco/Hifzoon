/**
 * Shared k6 helpers for the load suite (NFR-CAP-01).
 *
 * Everything the scripts need to know about the deployment lives here so the four test
 * files do not each invent their own base URL, thresholds and failure handling.
 */

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
export const API = `${BASE_URL}/api/v1`;

/**
 * Tokens written by `npm run load:tokens`.
 *
 * A load test that logs in on every iteration measures the login endpoint instead of
 * the thing under test — Argon2id is deliberately expensive, so login-bound runs tell
 * you nothing about whether 5,000 students can browse their portal. Credentials are
 * resolved once in `setup()` and the tokens are handed to every VU.
 */
export function loadTokens() {
  const raw = __ENV.TOKENS_FILE || './load/.tokens.json';
  try {
    const parsed = JSON.parse(open(raw));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('empty');
    }
    return parsed;
  } catch (error) {
    // Failing loudly beats silently testing one account 5,000 times, which would pass
    // while proving nothing about concurrent per-user load.
    throw new Error(
      `Could not load access tokens from "${raw}". ` +
        `Run "npm run load:tokens" first (see load/README.md). Cause: ${error.message}`,
    );
  }
}

/** The health probe is excluded from latency thresholds on purpose — see README. */
export const HEALTH_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
};

/**
 * Thresholds for a read-heavy authenticated workload.
 *
 * 800 ms p95 is deliberately loose. These run against a developer laptop and a single
 * container, and a threshold tight enough to catch a real regression here would fail on
 * machine noise alone. The useful signal is the *shape* — a p95 that jumps from 40 ms to
 * 400 ms — not the absolute number. Re-baseline these on the deployment target.
 */
export const READ_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{expected_response:true}': ['p(95)<800'],
  checks: ['rate>0.98'],
};

/** Classroom join/leave is burstier and touches Redis and the DB per event. */
export const CLASSROOM_THRESHOLDS = {
  http_req_failed: ['rate<0.02'],
  'http_req_duration{expected_response:true}': ['p(95)<1000'],
  checks: ['rate>0.95'],
};

export function authHeaders(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
}

/** Envelope helper: every success is `{ data, meta }` (TRD section 5.1). */
export function dataOf(response) {
  try {
    return response.json('data');
  } catch (error) {
    return null;
  }
}

export function isHealthy(response) {
  return response.status === 200 && dataOf(response) !== null;
}
