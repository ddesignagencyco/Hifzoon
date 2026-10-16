# Hifzoon — Frontend Integration Direction

**Last updated:** 2026-10-16 · **Branch:** `feat-webhooks` · **API prefix:** `/api/v1`

This is the hand-off note for the frontend team. It records the backend
behaviour the UI must build against, and in particular the things that changed
recently (security hardening + "broken endpoint" fixes). The contract of record
is the committed OpenAPI spec at `.openapi/openapi.json`, served live at
`/api/docs` — when in doubt, trust the spec, not this note.

---

## 1. Conventions every request shares

- **Base URL:** `/api/v1` (see `servers` in the spec).
- **Envelope:** every success response is `{ "data": ..., "meta": { "requestId": ... } }`.
  Every error is `{ "error": { "code", "message", "details?" }, "meta": { "requestId" } }`.
- **Auth:** send the access token as `Authorization: Bearer <token>` (15 min TTL).
- **Strict validation:** the API rejects **unknown fields with `400`**
  (`whitelist` + `forbidNonWhitelisted`). Do not send extra properties "just in case".
- **Query enums are validated.** An invalid `?status=`/`?type=` now returns `400`,
  where it used to 500. Send only the documented enum values.
- **Conflict handling:** duplicate unique values (e.g. a CMS slug) return `409`,
  not `500`. Surface these as actionable field errors.
- **Timeouts/limits:** JSON body limit 2 MB; large uploads go through signed S3 URLs.

---

## 2. Authentication — read this first (changed)

### Refresh token is now a cookie, not a body field

`POST /auth/login`, `POST /auth/refresh` and the OAuth callback no longer return
`refreshToken` in the JSON body. It is set as an **httpOnly cookie** named
`hifzoon_refresh`, scoped to `Path=/api/v1/auth`, `SameSite=Strict`.

What this means for the frontend:

- Do **not** look for `data.refreshToken` — it is intentionally absent.
- The browser must be configured to **send credentials**:
  - `fetch(url, { credentials: 'include' })`, or
  - `axios` with `withCredentials: true`.
- CORS is configured with `credentials: true`; dev origins must be in the
  server's `CORS_ORIGINS`.
- On logout, call the logout endpoint and then `clearRefreshCookie` happens
  server-side; also clear any in-memory access token you hold.
- The refresh token is **never** readable from JS (httpOnly). Do not try to
  read `document.cookie` for it.

### Login with 2FA (two-step)

`POST /auth/login` returns one of:

- **2FA disabled / code supplied and correct** → `200` with `{ accessToken, ... }`
  (refresh token set as cookie).
- **2FA enabled, no code supplied** → `401` with `error.code = "TWO_FACTOR_REQUIRED"`.
  The UI should then prompt for the 6-digit code and **retry login including `code`**.
- **Code supplied but wrong** → `401` with `error.code = "INVALID_TWO_FACTOR_CODE"`.

Branch on `error.code`, not on the HTTP status or message text.

### Sensitive account actions require re-auth

Enabling/disabling 2FA (`POST /auth/2fa/setup`, `POST /auth/2fa/disable`) now
require the user to re-prove identity in the same request: send `password`
(and/or `code`). Without it the API returns `401`/`403`. Design the UI to ask
for the password before these calls rather than failing after the fact.

### Refresh flow

`POST /auth/refresh` reads the refresh token **from the cookie**; you do not send
it in the body. Refresh tokens rotate, and replaying a revoked one revokes the
whole session (theft detection) — handle a `401` on refresh by sending the user
back to login, and do **not** auto-retry refresh in a tight loop.

---

## 3. What changed, module by module

Each bullet is a backend fix that changes what the UI will see.

### Auth (`AUTH`)

- `TWO_FACTOR_REQUIRED` / `INVALID_TWO_FACTOR_CODE` codes as above.
- Disabling 2FA returns the 8 recovery codes once at setup — present them for the
  user to save; they are never returned again.

### Lessons (S3 mistakes, S13 lesson cards)

- Mistake endpoints and lesson-card endpoints are now **class-scoped**: a student
  only sees mistakes for classes they are in; staff/owner checks apply. Expect
  `403` when opening another student's card/mistake.
- Draft lesson cards are **hidden** from non-staff reads; a `get` on a draft as a
  non-owner no longer returns content.
- `advanceLesson` enforces the per-level lesson cap (a `400` when exceeded).

### Parent portal (S4 charts, S14 messaging)

- `GET /parent-portal/students/:studentId/charts` is now **ownership-checked**:
  a guardian can only chart their own child. A `403` means the wrong child id.
- Messaging (FR-PAR-06) is family↔teacher, pinned to a student/enrolment:
  - **The family starts the thread.** A teacher cannot open a thread; the UI
    should only offer "Message teacher" on the guardian side.
    Teacher-side read/reply is allowed once a thread exists.
    (`openThread` from staff returns `403`.)
- Use the thread/message list endpoints as documented; there is no group or
  "message the school" channel.

### Scheduling (`S5–S8`, `B11`)

- All mutating and timetable routes are role-gated and ownership-checked:
  - Availability is editable only by the owning teacher or staff.
  - Cancelling/rescheduling a session requires being a party to it; cancelling
    as a family member **charges** the session (no makeup credit), cancelling as
    teacher/staff issues a **makeup credit**. The UI copy should reflect this.
- **Open-slots filtering by course was fixed.** Passing `courseId` now returns
  slots for that course; previously it could return the wrong/none. Pass the real
  course **id** (not the course code).
- Malformed/invalid dates in slot queries now return `400` instead of `500`.
- Timetable endpoints accept a `from`/`to` range and are ownership-scoped.

### Classroom (S11, S12)

- All classroom state operations are now access-checked:
  - **Read** (attendance sheet, snapshot) requires class membership (staff, the
    teacher, or a guardian of a student in the class).
  - **Control** (close attendance, set page/highlight/layout/tajweed, start
    recording) requires the owning teacher or staff.
- Socket `STATE_SYNC`/join flows now carry the user's identity; a guardian who is
  not attached to the class will be rejected on connect. Make sure the socket
  connects with the access token.
- Recording requires recording consent to be on; starting a recording without
  consent is refused.

### Consent (S15)

- Guardian-verification `POST /consent/verifications` (start) and its confirm
  step now check that the guardian actually belongs to the claimed family.
  A mismatch is a `403`, not a silent success.

### Teachers (B2, B8, B9)

- **Applications:** `documents` are now validated and correctly persisted
  (previously sent but silently dropped). Send them as the documented array of
  `{ type, key }` — an invalid `type` returns `400`.
- **Profile change requests:** `changes` must be a JSON object of allowed fields;
  unknown fields are rejected. `qualifications` pass through as-is.
- **Public teacher list now includes `userId`.** Use it to open a profile detail;
  the previous list items omitted it, causing id mismatches on the detail call.
- **`GET` teacher applications supports `?status=`** with enum validation
  (`400` on a bad value instead of `500`).

### QA (B4, B14)

- Submitting a **teacher rating** is now public (`@Public`) — no auth needed.
- **Replying to a rating requires the `TEACHER` role** and must be the teacher
  the rating belongs to. A reply from the wrong teacher now correctly returns
  `403` (a bug made this always fail before, even for the right teacher).
- Guardian-facing rating submission endpoints are guardian-scoped.

### Admin console (B5)

- Course/specialisation fields are now surfaced under the correct key
  (`subjects`); the admin list returns usable data.
- Staff-only endpoints (`/admin/...`) require `ADMIN`/`SUPER_ADMIN`
  (some also `SUPERVISOR`). Build nav/guards to match.

### Admissions (B10)

- **CMS save:** a duplicate `slug` now returns `409` (was `500`). Show it as a
  slug field error.
- **CMS save:** omitting `status` on an edit **no longer unpublishes** a live
  post — the previous status is preserved. To unpublish, send
  `status: "DRAFT"` explicitly.
- **Editorial/list and teacher-change endpoints validate `?status=`/`?type=`**
  and return `400` on invalid values (was `500`).
- Public trial booking flow (FR-ADM-03): anonymous visitors **cannot** book a
  trial directly; trials are booked for an existing student (staff or an
  authenticated family flow). If the UI has a public "book a trial" CTA, it
  should route into the inbox/lead capture rather than POST `/trials`.

---

## 3. Error codes worth branching on

| `error.code` | Where | UI behaviour |
| --- | --- | --- |
| `TWO_FACTOR_REQUIRED` | login | Show 2FA code prompt, retry with `code`. |
| `INVALID_TWO_FACTOR_CODE` | login, 2fa confirm | Inline "code is wrong", allow retry. |
| `CONFLICT` | CMS save (slug), duplicate trial | Field-level conflict message. |
| `VALIDATION_FAILED` (400) | any body/query | Map `details` to form fields. |
| `FORBIDDEN` (403) | cross-family/teacher access | "You don't have access" page, not a generic error. |
| `NOT_FOUND` (404) | missing resources | Empty state. |

---

## 4. Local verification

```bash
# from repo root
npm run typecheck --workspace @hifzoon/api   # clean
npm test  --workspace @hifzoon/api           # 238 tests, 17 suites
npm run lint                                 # only pre-existing apps/api/load/* parser errors
```

- Interactive API: `http://localhost:<PORT>/api/docs`.
- Committed spec: `.openapi/openapi.json` (regenerated in CI; do not hand-edit).
- CORS uses `credentials: true`; set the frontend origin in the backend's
  `CORS_ORIGINS` for cookie-based refresh to work.
