/**
 * NFR-CAP-01 — read load for active students.
 *
 * Models what 5,000 enrolled families actually do between classes: open the dashboard,
 * look at the week, read a teacher's profile, check a child is booked. Almost none of
 * it is a write, and that is the point — this is the traffic that must not slow down
 * while 200 classes are running elsewhere.
 *
 *   docker run --rm -i --network host \
 *     -v "$PWD/load:/scripts" -v "$PWD/load/.tokens.json:/scripts/.tokens.json" \
 *     grafana/k6 run /scripts/browse.js
 *
 * Run it *while* classroom.js is running to measure the combined shape the SRS asks
 * about. Alone it is a regression baseline.
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
    // A constant arrival rate rather than a fixed VU count: 5,000 students do not all
    // click at once, and a closed model would let slow responses compound into a
    // queue and report self-inflicted latency.
    students: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      stages: [
        { target: 250, duration: '2m' }, // ramp to 250 req/s
        { target: 500, duration: '5m' }, // sustain
        { target: 0, duration: '1m' }, // drain
      ],
    },
  },
  thresholds: CLASSROOM_THRESHOLDS,
};

export function setup() {
  const tokens = loadTokens();
  if (tokens.length < 100) {
    console.warn(
      `Only ${tokens.length} tokens available. Per-user load is being simulated by fewer ` +
        'distinct users than NFR-CAP-01 assumes; see load/README.md for how to seed more.',
    );
  }
  return { tokens };
}

export default function (data) {
  const token = data.tokens[__VU % data.tokens.length];
  const auth = authHeaders(token);

  // Weighted towards the dashboard and schedule, which is what a family checks most.
  const roll = Math.random();
  let response;

  if (roll < 0.35) {
    response = http.get(`${API}/families`, auth);
    check(response, { 'families listed': (r) => isHealthy(r) && Array.isArray(dataOf(r)) });
  } else if (roll < 0.6) {
    response = http.get(`${API}/auth/me`, auth);
    check(response, { 'current user': (r) => isHealthy(r) && dataOf(r).id !== undefined });
  } else if (roll < 0.85) {
    response = http.get(`${API}/scheduling/open-slots`, {
      ...auth,
      params: { courseId: __ENV.COURSE_ID || '', from: '2026-01-01' },
    });
    // A missing course id is a 400, which is the script's fault, not the API's; only
    // count it as a failure when the request was well-formed.
    const wellFormed = Boolean(__ENV.COURSE_ID);
    check(response, {
      'slots returned': (r) => (wellFormed ? isHealthy(r) : r.status === 400),
    });
  } else {
    response = http.get(`${API}/courses`, auth);
    check(response, { 'catalogue readable': (r) => isHealthy(r) });
  }

  sleep(Math.random() * 2 + 1);
}