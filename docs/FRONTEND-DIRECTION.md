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
  Every error is **flat**: `{ statusCode, code, message, details?, requestId, timestamp }`.
  (Corrected from an earlier note in this file, which described a nested
  `{ "error": { ... } }` shape the API never returned.)
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
  The UI should then prompt for the 6-digit code and **retry login with the field named
  `twoFactorCode`** — the field is `twoFactorCode`, not `code`, and it also accepts a
  recovery code.
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
- The 8 recovery codes are returned once, by `two-factor/setup`; present them then.
  Disabling 2FA deletes any unused codes and does not return them.

### Lessons (S3 mistakes, S13 lesson cards)

- Mistake endpoints and lesson-card endpoints are now **class-scoped**: a student
  only sees mistakes for classes they are in; staff/owner checks apply. Expect
  `403` when opening another student's card/mistake.
- Lesson cards are **hidden** from non-staff reads until they are shared: a `get` on an
  unshared card returns `404` for a guardian or student, and the recording's
  `storageKey` is stripped from every family response.
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
- A thread must name one of your children (`studentId` is required) and its
  `enrolmentId` is resolved server-side. Contact details in a message body are
  redacted and the message is flagged for moderation.

### Scheduling (`S5–S8`, `B11`)

- All mutating and timetable routes are role-gated and ownership-checked:
  - Availability is editable only by the owning teacher or staff.
  - **Who cancelled is derived server-side.** `POST /scheduling/classes/:id/cancel` no
    longer takes `by` or `noticeHours`; send only `reason`. A guardian cancelling inside
    the notice window is charged, outside it they receive a make-up credit; a teacher or
    staff cancellation always issues one (FR-SCH-04). The response echoes `by`,
    `charged`, `makeUpCredits` and the `noticeHours` that was applied.
  - A **family** reschedule is refused inside the same notice window (400); staff and the
    owning teacher may always move a class.
- **Booking now refuses what the slot finder hides:** a teacher who does not teach the
  course (`400`, field `teacherId`) and a time outside their availability in their own
  zone (`409 SLOT_UNAVAILABLE`). Booked trials create a TRIAL enrolment with that
  teacher, so teacher marking and family watching work immediately (B21, B25, B28).
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
- **A guardian gets `GUARDIAN_VIEWER` only when one of their children is on that
  class.** It is no longer enough to have an enrolment with the class's teacher —
  that let any family taught by the same Ustadh watch any of their classes.
- Recording requires recording consent to be on; starting a recording without
  consent is refused.

### Consent (S15)

- Guardian-verification `POST /consent/verifications` (start) and its confirm
  step now check that the guardian actually belongs to the claimed family.
  A mismatch is a `403`, not a silent success.

### Teachers (B2, B8, B9)

- **Applications:** `documents` are now validated and correctly persisted
  (previously sent but silently dropped). Send them as the documented **map**
  `{ "ID?": "<storage key>", "CERTIFICATE?": ..., "REFERENCE?": ..., "BACKGROUND_CHECK?": ... }`
  — it is an object keyed by document type, not an array of `{ type, key }` — and an
  unknown key returns `400`.
- **Profile change requests:** `changes` must be a JSON object of allowed fields:
  `bio`, `photoUrl`, `introVideoUrl`, `recitationSampleUrl`, `qualifications`,
  `languages`, `subjects`, `ageGroups`. An unknown field is rejected with `400` naming
  it, rather than stored and dropped at approval.
- **Public teacher list and detail now include `userId`, `introVideoUrl` and
  `recitationSampleUrl`**, so the directory's play buttons work on live teachers.
- **`GET /teachers/me`** returns your own profile at any point in the hiring pipeline
  (the public route 404s until you are cleared), including its id and availability.
- **`GET` teacher applications supports `?status=`** with enum validation
  (`400` on a bad value instead of `500`).

### QA (B4, B14)

- Submitting a **teacher rating** is now public (`@Public`) — no auth needed.
- **Replying to a rating requires the `TEACHER` role** and must be the teacher
  the rating belongs to. A reply from the wrong teacher now correctly returns
  `403` (a bug made this always fail before, even for the right teacher).
- A guardian may rate a **completed** class their child attended; they do not have to
  have personally joined the call. Family timetable rows carry `canRate` and `rated` so
  the portal does not have to guess.
- A guardian may rate a **completed** class their child attended; they do not have to
  have personally joined the call. Family timetable rows carry `canRate` and
  `rated` so the portal does not have to guess.

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

## 4. Corrections from web team v4.2.0

Where this note and the code disagreed, the code won and this note was corrected. The
statements above are now accurate; the ones that were wrong have been:

- **Error shape** — errors are flat `{ statusCode, code, message, details?, requestId,
  timestamp }`, not `{ error: { … } }`.
- **Login retry field** — the code field is `twoFactorCode`, not `code`.
- **Recovery codes** — returned by `two-factor/setup`, once. Disabling deletes them.
- **Application documents** — a map keyed by document type, not an array.
- **Cancelling as a family** — charged only *inside* the notice window; outside it the
  family receives a make-up credit (FR-SCH-04), which the policy pages already said.
- **Guardian rating** — guardian-scoped, and no longer requires having personally joined
  the call; see `canRate` on timetable rows.
- **Draft lesson cards** — hidden from non-staff reads until shared, on `get` as well as
  on the list.
- **OAuth linking** — decided at `/auth/oauth/start` from the access token; the callback
  does not take one.
- **Section numbering** — §3 used to appear twice.

## 5. Error codes worth branching on

| `code` (top level, not nested under `error`) | Where | UI behaviour |
| --- | --- | --- |
| `TWO_FACTOR_REQUIRED` | login | Show 2FA code prompt, retry with `twoFactorCode`. |
| `INVALID_TWO_FACTOR_CODE` | login, 2fa confirm | Inline "code is wrong", allow retry. |
| `CONFLICT` | CMS save (slug), duplicate trial | Field-level conflict message. |
| `VALIDATION_FAILED` (400) | any body/query | Map `details` to form fields. class-validator routes answer `[{ field, messages }]`; zod routes `[{ path, message }]`. |
| `FORBIDDEN` (403) | cross-family/teacher access | "You do not have access" page, not a generic error. |
| `REAUTH_REQUIRED` (403) | sensitive account actions | Ask for the password or a 2FA code. **Not** an expired session — do not refresh and retry. |
| `TWO_FACTOR_ENROLMENT_REQUIRED` (403) | any staff route before 2FA enrolment | Send the user to `POST /auth/two-factor/setup`; only identity and enrolment routes answer. |
| `NOT_FOUND` (404) | missing resources | Empty state. |

---

## 5. Local verification

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
