# Backend reply — Hifzoon Web Team requirements v4.2.0

**From:** backend team
**Date:** 2026-10-18
**Branch:** `feat-webhooks`
**Format:** `FIXED <commit>` / `WONTFIX <reason>` / `QUESTION`

State at time of writing: typecheck clean, lint unchanged (4 pre-existing `apps/api/load/*`
errors), **280 unit tests / 23 suites**, **45 e2e tests / 4 suites**, all green.

Every "Fix first" item is done. The items below are what remains open, and why.

---

## Fix-first list — all delivered

| ID | Reply |
| --- | --- |
| S12 | FIXED `4b226d2` — `GUARDIAN_VIEWER` now requires a `ClassStudent` row for *this* class. e2e: other-family guardian → 403, own guardian → 201 (`test/classroom-viewer.e2e-spec.ts`). |
| B28 → B21, B25 | FIXED `4b226d2`, option (a) as recommended. A booked trial creates a `TRIAL` enrolment with the class's teacher; `teacherOwnsStudent` also accepts "teaches a class this student is on", so trials booked before this deploy work too. Signing up after a trial upgrades that row instead of forking it. |
| B23 | FIXED `4b226d2` — the `!` is gone; four tests cover no-preferences, inside, outside (wrapping midnight) and safety-critical. |
| S20 | FIXED `4b226d2` — membership created with `verifiedAt: null`, written only by the confirm step. |
| M42 | FIXED `4b226d2` — **restricted session** (see note below), 403 `TWO_FACTOR_ENROLMENT_REQUIRED` off an allow-list of identity/enrolment routes. |
| B26, B27 | FIXED `a665669` — booking re-asks what the slot finder asks: the teacher must teach the course (400, field `teacherId`) and the class must fit an availability window in the teacher's own zone (409 `SLOT_UNAVAILABLE`). |
| B20, Q21 | FIXED `a665669` — reset email carries `${APP_WEB_URL}/reset-password?token=…`; `MAIL_PROVIDER` gained `file` (writes `.eml` to `MAIL_CAPTURE_DIR`, the default in dev and `.env.example`) and a real `resend` adapter. `ses` was removed from the enum rather than silently falling back to a fake. |
| B22, B24 | FIXED `a665669` — subscribing issues the first invoice (returned as `firstInvoice`); a trial outcome is refused for a class that has not happened or was cancelled and updates only that class's enrolments. |

### One thing to know about M42

We took the **restricted session** rather than the error code, because enrolment is
itself an authenticated call: refusing sign-in would leave nobody able to enrol. An
unenrolled staff member signs in normally and receives 403 `TWO_FACTOR_ENROLMENT_REQUIRED`
on everything except `/auth/me`, `/auth/refresh`, `/auth/logout`,
`/auth/two-factor/setup`, `/auth/two-factor/confirm`. The flag is read live from the account
on each request, so it lifts the moment enrolment completes.

Enforcement is on by default (`TWO_FACTOR_ENROLMENT_ENFORCED`). The e2e harness sets it
false, because a fixture cannot present a TOTP code. **Locally, seeded staff will hit the
restriction on first sign-in** and can enrol through the banner you already built — set
`TWO_FACTOR_ENROLMENT_ENFORCED=false` if you want to keep moving without it.

---

## 🔴 P0 — security (all delivered)

| ID | Reply |
| --- | --- |
| S7 | FIXED `492f9d7` — `by` is derived from the caller's role and what they own; the notice window comes from `scheduling.cancellation_notice_hours`; `by` and `noticeHours` are gone from the DTO. |
| S8 | FIXED `492f9d7` — a family reschedule inside the notice window is refused; staff and the owning teacher may always move a class. |
| S13 | FIXED `492f9d7` — `get()` 404s an unshared card for a family reader, and `recording.storageKey` is stripped from family responses. |
| S14 | FIXED `492f9d7` — `studentId` is required for a family, the enrolment is resolved rather than trusted, and contact details are redacted and audited. |
| S15 | FIXED `492f9d7` — a data request's `studentId` must be in the family; a web consent grant can no longer claim `SIGNED_FORM` or `ID_CHECK`. |
| S19 | **Decided as you offered**: staff *may* act, and every override writes `bil.staff.<action>` to the audit log. `actorRoles` now reach `subscribe`/`cancel`/`pause`/`resume`/`startCheckout`. |

## 🔴 P0 — broken endpoints

| ID | Reply |
| --- | --- |
| B2 | FIXED `0665fd0` — `languages`, `subjects`, `ageGroups` supported; an unknown key is a 400 naming it; the same allow-list drives approval. |
| B8 | FIXED `0665fd0` — step, derived status and approval are one transaction, and the pipeline order is enforced. |
| B10 | FIXED `e1ae34d` — `newTeacherId` accepted (required to approve), successor must be cleared, the enrolment moves and future `SCHEDULED` classes follow. |
| B11 | FIXED `e1ae34d` — sorted before the limit, and `teacherId` is now a query param. |
| B14 + M43 | FIXED `e1ae34d` — any guardian of a student on a `COMPLETED` class may rate; family timetable rows carry `teacherId`, `course` and `canRate`/`rated`. |
| B16 | FIXED `492f9d7` — an on-time family cancellation earns the make-up credit FR-SCH-04 promises; only a late one is charged. **The policy-page copy you have is now correct.** |
| B17 | FIXED `0665fd0` — unknown document key is a 400 on the public route. |
| B18 | FIXED `e1ae34d` — a non-UUID `courseId` is a 400. |
| B19 | FIXED `0665fd0` — `skip` is passed, and rows carry `failureReason`. |

## 🟡 P1 — delivered

| ID | Reply |
| --- | --- |
| M1 | FIXED `0665fd0` — `GET /teachers/me`. |
| M5 | FIXED `1d43337` — logout works on the refresh cookie alone (`@OptionalAuth()`); an expired token no longer traps a user on a shared machine. |
| M6 | FIXED `1d43337` — class-validator failures now answer `[{ field, messages }]`. |
| M7 | FIXED `e1ae34d` — a `STUDENT`/`CHILD_STUDENT` sees their own enrolments. |
| M8 | FIXED `e1ae34d` — student list carries `notes` and `mushafLayout` (new column + migration `20261018000000_student_mushaf_layout`). |
| M10 | FIXED `abdc8c0` — DATA_COLLECTION consent is required **only** for under-13s, per CR-01. |
| M11 | FIXED `abdc8c0` — deleted children are out of the privacy summary; the verification email names the family instead of printing its id. |
| M12 | FIXED `e1ae34d` — family listing reports `verified` from the primary guardian. |
| M13, M43 | FIXED `e1ae34d` — timetable rows carry `teacherId`, `course`, `canRate`, `rated`; cancelled classes are kept. |
| M15 | FIXED `e1ae34d` — `GET /teacher-changes` is guardian-scoped to their own family. |
| M18 | FIXED `1d43337` — per-class mistakes carry `source`, `confirmed`, `dismissedAt`. |
| M21 | FIXED `1d43337` — the pre-class brief carries class `status`. |
| M34 / §7.5 | FIXED (this commit) — `POST /uploads/presign` `{ kind, contentType, size }` → `{ key, url, method: PUT, headers, expiresInSeconds, maxBytes }`. Public, rate limited, `audio/webm\|mp3\|wav\|m4a` ≤ 25 MB, `pdf/jpg/png` ≤ 10 MB. You can drop the data-URL workaround. |
| M40 | FIXED `fe8e8ba` — producers for booked trial, cancelled class, rescheduled class, teacher change is still manual, and **new message** (`message.new`). Recipients are the class's primary guardians, deduplicated. |
| §7.4 | FIXED `e5902fe` — `recitationSampleUrl` on both the teacher list and detail. |

## 🟢 P2 — delivered

| ID | Reply |
| --- | --- |
| Q3 | FIXED `e5902fe` — settings saved as a form are validated first, then written in one transaction. |
| Q6 | FIXED `1d43337` — refresh cookie path derived from `API_PREFIX`. |
| Q7 | FIXED `1d43337` — non-staff 2FA setup is 403, not 201 `{required:false}`. |
| Q9 | FIXED `e5902fe` — PKR is now 1900000. **QUESTION:** the other currencies still look like monthly figures (USD 4900, GBP 3900 …) while PKR now reads as an annual one. Please confirm the intended price list; we did not want to invent it. |
| Q10 | FIXED `e5902fe` — `supervisor.teacher@hifzoon.test` holds SUPERVISOR + TEACHER. |
| Q11, Q24 | FIXED `e5902fe` — teacher account zones match their availability zone; the cleared teacher lists every seeded course code. |
| Q16 | FIXED `1d43337` — new `REAUTH_REQUIRED` code (403) distinct from an expired session; `two-factor/confirm` no longer writes a second copy of the recovery codes. |
| Q17 | FIXED `e5902fe` — `GET /webhooks/whatsapp` echoes `hub.challenge`, verified against the new `WHATSAPP_VERIFY_TOKEN`. |
| Q18 | FIXED `e5902fe` — rating a class recomputes `ratingAvg`, `ratingCount` and `publicRatingAvg` from real reviews. |
| Q19 | FIXED `1d43337` — refresh with no credential answers 204; a rejected token is still 401. |

---

## Still open — WONTFIX, with reasons

These are real and we have not done them. Nothing here is blocked on a decision; they are
simply the largest pieces, and doing them badly would have been worse than saying so.

| ID | Reply |
| --- | --- |
| **M35** | WONTFIX (this round) — Hifz tracker, AI coach, engagement/streaks/badges and certificate verification are four feature areas, not four fixes. FR-HFZ-* largely lands first: the Hifz rules engine is already built and stashed as `stash@{0}` (`HFZ-BE-02`), awaiting a decision to restore. |
| **M44** | WONTFIX — the `quran_foundation` adapter needs a real vendor key and licence (CR-11). We will not ship an adapter that cannot be exercised; the fake's behaviour (structure only, `licensed: false`) is correct until then. |
| **M36** | WONTFIX — Stripe/LiveKit adapters are vendor integrations requiring credentials and live testing against a provider account. |
| **M2, M37, §7.1** | WONFIX (this round) — Kids PIN login and student OTP are a new authentication surface with its own lockout, refresh and scoping rules. Worth its own pass, not a rushed one. |
| **M22–M27, M30, M31, M38, M39** | WONTFIX (this round) — admin list endpoints, CRM lead management, payroll detail, FAQ moderation, OAuth 2FA step and identity linking. Each is small; together they are a second release. |
| **M26, §7.2, §7.3** | QUESTION — public `POST /leads` and `POST /trials/public` create CRM records from anonymous callers. We need to know the rate limit and whether a provisional family is created, before we build something that writes to the pipeline unauthenticated. |
| **M41** | WONFIX (this round) — the examiner workspace: assessment list plus a result write, including who may sign one off. |
| **Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23** | WONFIX (this round) — idempotency enforcement, duplicate audit rows, conflict counting, list pagination, policy-page CMS content, the password policy (a product decision), session hygiene. |

## Answers to your questions

- **Was the reproduction right?** Yes, on every item we checked. S12, B23, B26, B27, B21 and
  B25 all reproduced from the code exactly as you described them.
- **Anything we found that you did not report?** Yes, three:
  1. `canAccessStudent` decided on the *first* role it recognised. Every self-registered
     account carries `GUARDIAN`, so a teacher who also held `TEACHER` was answered as a
     guardian and refused access to their own student's records — the read half of B21
     (`4a59553`).
  2. The e2e suite only passed if the shell that launched it happened to export the API
     secrets. It now loads `apps/api/.env` itself (`1d43337`).
  3. Q9's USD figure is `4900`, which is $49/month; the PKR you quoted implies an annual
     price. The currencies may not be describing the same period.
- **§6 corrections** — applied to `docs/FRONTEND-DIRECTION.md`, which now also has a
  "Corrections from web team v4.2.0" section listing what changed and why.