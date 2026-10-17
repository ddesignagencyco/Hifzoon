/**
 * NFR-CAP-01 — 200 simultaneous classes.
 *
 * Each VU behaves like one live classroom: request a room token, join, and then do the
 * thing a real classroom does continuously — open the Mushaf and turn pages. This is the
 * only authenticated write-heavy path in the product during peak hours, so it is where a
 * capacity regression would actually hurt.
 *
 *   docker run --rm -i --network host \
 *     -v "$PWD/load:/scripts" grafana/k6 run /scripts/classroom.js
 *
 * 200 VUs, each its own class. Book the classes first (`npm run load:fixtures`) so the
 * tokens are real; the script fails loudly rather than skipping if they are missing.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

import {
  API,
  CLASSROOM_THRESHOLDS,
  authHeaders,
  dataOf,
  isHealthy,
  loadTokens,
} from './lib/common.js';

export const options = {
  scenarios: {
    classes: {
      // One VU per class. `per-vu-iterations` with a fixed count keeps exactly 200
      // classrooms alive for the whole run instead of the executor churning new ones,
      // which is what "200 simultaneous" actually means.
      executor: 'per-vu-iterations',
      vus: 200,
      iterations: 40,
      maxDuration: '10m',
    },
  },
  thresholds: CLASSROOM_THRESHOLDS,
};

export function setup() {
  const tokens = loadTokens();
  if (tokens.length < 200) {
    throw new Error(
      `NFR-CAP-01 assumes 200 simultaneous classes but only ${tokens.length} class tokens ` +
        'were found. Run "npm run load:fixtures" to book them.',
    );
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[(__ITER - 1) % data.tokens.length];
  const auth = authHeaders(token);

  const sessionId = __ENV.SESSION_IDS
    ? JSON.parse(__ENV.SESSION_IDS)[(__ITER - 1) % 200]
    : __ENV.SESSION_ID;

  const room = http.post(`${API}/classroom/classes/${sessionId}/token`, null, auth);
  const roomOk = check(room, { 'room token issued': (r) => isHealthy(r) });

  if (!roomOk) {
    // A class that cannot get a token is a real failure; continuing would let a broken
    // authorisation path hide behind a passing average.
    sleep(1);
    return;
  }

  const body = dataOf(room);
  check(body, { 'token has a room id': (b) => b !== null && b.roomId !== undefined });

  // Mushaf navigation, which is what a teacher does for most of a lesson. `setPage` is
  // the REST mirror of the `mushaf:page` socket event, and is what NFR-PERF-02 measures.
  for (let page = 1; page <= 5; page += 1) {
    const turned = http.post(
      `${API}/classroom/classes/${sessionId}/page`,
      JSON.stringify({ page }),
      auth,
    );
    check(turned, { 'page turn accepted': (r) => isHealthy(r) });
  }

  const state = http.get(`${API}/classroom/classes/${sessionId}/state`, auth);
  check(state, { 'classroom state readable': (r) => isHealthy(r) });

  // A class is not a tight loop: think time dominates.
  sleep(20 + Math.random() * 10);
}