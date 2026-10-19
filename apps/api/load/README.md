# k6 load tests (NFR-CAP-01, REL-BE-01)

Load tests for the two requirements the SRS makes about capacity and latency:

| Requirement     | What it says                                                                | Script                      |
| --------------- | --------------------------------------------------------------------------- | --------------------------- |
| **NFR-CAP-01**  | 200 simultaneous classes and 5,000 active students without slowing down     | `classroom.js`, `browse.js` |
| **NFR-PERF-02** | A page turn appears on the student's screen within 500 ms for 95% of events | `classroom.js` (`setPage`)  |

> The socket-latency half of NFR-PERF-02 needs k6's experimental WebSockets support
> (`--experimental-websockets`). `classroom.js` measures the REST mirror of the
> `mushaf:page` event, which is the same code path minus the socket hop. A true
> end-to-end socket measurement needs a browser and Playwright, not k6 — that is
> CLS-FE-04's test, not this one's.

---

## Running them

k6 is not an npm dependency, and installing a second language toolchain for four scripts
is not worth it. The official Docker image is the runner:

```bash
# one-off smoke run from apps/api
docker run --rm -i --network host -v "$PWD/load:/scripts" grafana/k6 run /scripts/browse.js
```

If you prefer a local binary, install it from <https://grafana.com/docs/k6/latest/set-up/install-k6/>
and the commands below work verbatim.

---

## Step 1 — tokens

```bash
npm run load:tokens                    # 100 tokens
npm run load:tokens -- --count 5000    # what NFR-CAP-01 assumes
```

This registers and logs in real accounts through the public API and writes
`load/.tokens.json`. It exists because a load test that authenticates per iteration
measures Argon2id rather than the endpoint under test — Argon2 is deliberately expensive
and would dominate every number.

`.tokens.json` is gitignored. It contains 5,000 live bearer tokens.

**Start the API first**, otherwise the script exits with a clear message:

```bash
npm run dev:api
```

---

## Step 2 — the read load

Models what families actually do between classes: dashboard, schedule, profile, today's
bookings. Mostly reads, which is exactly the traffic that must not degrade while 200
classes are running elsewhere.

```bash
docker run --rm -i --network host \
  -v "$PWD/load:/scripts" \
  grafana/k6 run /scripts/browse.js
```

Arrival-rate model, 250 → 500 req/s. An arrival rate rather than a fixed VU count
because 5,000 students do not click at once, and a closed model would let slow responses
compound into a queue and report self-inflicted latency as a server problem.

---

## Step 3 — 200 simultaneous classes

`classroom.js` needs real `classSession` ids: a class that cannot get a room token fails
the check by design, so it will not silently pass against sessions that do not exist.

Book them with your normal flow — `scripts/full-flow-check.ts` walks the whole pipeline
(provision a teacher, clear the hiring steps until `readyToMatch`, create a family and
student, then `POST /scheduling/book`) and is the reference for how to do it. Collect the
resulting class session ids and pass them in:

```bash
docker run --rm -i --network host \
  -v "$PWD/load:/scripts" \
  grafana/k6 run -e SESSION_IDS='["id-1","id-2","…"]' /scripts/classroom.js
```

or, for a quick single-class smoke run:

```bash
docker run --rm -i --network host \
  -v "$PWD/load:/scripts" \
  grafana/k6 run -e SESSION_ID=<class-session-id> /scripts/classroom.js
```

Each VU is one classroom: request a room token, turn five Mushaf pages, read state, then
think for ~20–30 s. `per-vu-iterations` keeps exactly 200 alive for the whole run, which
is what "simultaneous" means — an executor churning VUs up and down would not test it.

Room tokens are refused outside the class's early-join window (10 minutes before to end
time), so the sessions you book must be **live right now**, not scheduled for later. That
is correct product behaviour; it just means the fixture has to be built at run time.

---

## Step 4 — both together

This is the shape the SRS actually describes, and it is the run that matters:

```bash
# terminal 1
docker run ... grafana/k6 run /scripts/classroom.js
# terminal 2
docker run ... grafana/k6 run /scripts/browse.js
```

If the read latency only degrades when classes are running, the contention is real and
the two features need separate capacity. If it degrades on its own, the problem is
simpler than you thought.

---

## Reading the numbers

Thresholds live in `load/lib/common.js` and are deliberately loose — 800 ms p95 for
reads, 1000 ms for classroom writes. These run against a laptop and a single Postgres
container; a threshold tight enough to catch a real regression would fail on machine
noise alone.

**Watch the shape, not the absolute value.** A p95 that goes from 40 ms to 400 ms is a
regression. A p95 of 120 ms on your hardware is fine and will be 15 ms in production.

Re-baseline these against the real deployment target before gating CI on them.

Health probes are deliberately excluded from the latency thresholds: `/health/live` does
no I/O and would drag p95 toward zero, making the number look better than the product is.

---

## What these do not test

- **Nothing is wired into CI.** A load test needs a seeded database, a running server and
  a quiet machine. On a shared GitHub runner it measures the runner. Run these on a
  staging box, on a schedule, and store the results — do not gate a PR on them.
- **No database fixture at 5,000 real students.** `browse.js` warns when it has fewer
  than 100 tokens. Simulated concurrency across fewer accounts still exercises the
  connection pool, Redis and the query plans, which is the part most likely to break.
- **No WebSocket load.** Socket.IO fan-out for 200 rooms is a separate test, and
  `classroom.js`'s `setPage` calls only measure the write path.
