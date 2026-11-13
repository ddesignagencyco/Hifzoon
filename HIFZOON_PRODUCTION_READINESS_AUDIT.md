# HIFZOON — Full System Production Readiness QA Audit

**Date:** 2026-11-13 · **Branch:** `full-site-regression` (HEAD `d0d8332`, after the `dev` merge that landed the Nov‑2026 admin & supervision backend)
**Method:** Repository discovery → workflow mapping → role-by-role static trace (code + Prisma schema) → live build/test execution → targeted live API probes. Four read-only reviewers (student/guardian, teacher, cross-cutting security/integration, production-readiness) plus parent-session verification.
**Rules observed:** No application source, schema, migration, or data was modified. No commits. Build/lint/test commands were executed (non-mutating) against the live local stack.

> **Scope honesty.** Browser-driven Playwright flow testing could **not** be executed — the e2e suite is broken by a seed/test account-domain mismatch (finding **E2E‑01**), so 116/118 Playwright tests do not run. Dynamic evidence therefore comes from: the API unit/integration test suites (995 API assertions, 861/864 web tests — executed live), `tsc`/`eslint`/`npm audit` runs, live `_prisma_migrations` inspection, and direct live API probes (auth/2FA challenge, role-hierarchy, safeguarding visibility). Flows are otherwise traced statically through the code. Nothing below is marked "passed" unless it was executed or line-traced; speculative items are marked **SUSPECTED**.

---

## 1. Executive Summary

**Overall: strong, production-oriented codebase — not blocked for a correctly-pipelined deploy on build health, but with a short list of real pre-launch correctness fixes.**

The backend is unusually mature for a platform at this stage: authorization is enforced in three consistent layers (static `RolesGuard` + configurable `PermissionGuard` + per-record `PolicyService` ownership), 9 of 10 state machines are forward-only and race-safe, transactions and FK linkage are generally correct, the global error filter is leak-safe, and env validation fails fast with strong production guards. Strict ESLint passes clean on both packages and the web typecheck is clean.

**Important reconciliation:** much of the admin/supervision defect backlog from earlier in this engagement has since been **implemented by the team** (commits `89abe50`, `752f9cf`, `fccd5a8`, `97693e1` + a `dev` merge). Verified now in current code: the roles guard **does** imply `SUPER_ADMIN` where `ADMIN` is required; safeguarding cases **are** hidden from supervisors; supervisor scoping via `SupervisorAssignment` **is** enforced on every `PolicyService` path; configurable role permissions (`RolePermission`/`PermissionOverride`) **exist**; the hiring-lifecycle bugs (failed-step→REJECTED, existing-account→TEACHER role) **are fixed**. Those are no longer open issues.

**The real remaining exposures (most severe first):**

| Rank | ID | Severity | One-line |
|---|---|---|---|
| 1 | INT‑R1 | **High** | `Enrolment` has no unique constraint on `(studentId, courseId)`; non-atomic check-then-create → duplicate enrolment / double-billing path |
| 2 | STU‑01 | **High** | CR‑01 verified-guardian gate for under‑13 enrolment (`assertChildUsable`) is dead code — zero callers |
| 3 | E2E‑01 | **High** (test signal) | Entire Playwright e2e suite is non-functional — test accounts use `@hifzoon.test`, seed now uses `@yopmail.com` |
| 4 | CACHE‑01 | High (UX) | QA review submit leaves the review queue / past-reviews / rating stale |
| 5 | SEC‑01 | Medium | In-place promotion to a staff role skips the mandatory staff‑2FA enrolment (staff flag pinned to session) |
| 6 | SEC‑02 | Medium | `Enrolment` status is client-settable with no transition validation → illegal terminal→live reverts |
| 7 | STU‑02 | Medium | Self-registration never verifies email; `emailVerifiedAt` dead for password accounts |
| — | INT‑F1…F5, INT‑R2…R8, PROD‑02/04, TCH‑01 | Medium | Non-atomic multi-write sagas, missing uniqueness constraints, missing `migration_lock.toml`, `zod` DoS advisory, supervisor timetable scope bypass |

**Verdict:** **Needs fixing before launch** for the High items (double-billing race, CR‑01 consent gate, and restoring the e2e suite as a regression signal). Build/CI is green because CI/Docker/Render regenerate the Prisma client; the 31 local `tsc` errors are a stale-client dev-ergonomics gap, not a production defect.

---

## 2. Application Architecture

**Monorepo:** `apps/api` (NestJS 10, Prisma 6 / PostgreSQL 16, BullMQ/Redis, LiveKit, MinIO) · `apps/web` (Next.js 16, React 19, TanStack Query) · `packages/shared` (enums/DTOs/zod). Docker Compose for local infra; Render + Vercel for deploy.

**Roles (9):** `SUPER_ADMIN, ADMIN, SUPERVISOR, SAFEGUARDING_LEAD, EXAMINER, TEACHER, GUARDIAN, STUDENT, CHILD_STUDENT`. Users may hold several roles.

**Authorization (three layers, verified):**
1. `RolesGuard` — static `@Roles(...)`; **partial hierarchy**: `SUPER_ADMIN` is admitted where `ADMIN` is required (`roles.guard.ts:30`); no implication for other roles (by design).
2. `PermissionGuard` + `@RequirePermission('key')` — configurable role×permission matrix (`RolePermission`/`PermissionOverride`), default-deny, `SUPER_ADMIN` always allowed. Used by `admin/ops/*` and scheduling admin routes.
3. `PolicyService` — per-record ownership (guardian-family, teacher-enrolment, supervisor-assignment scoping). This is where real IDOR protection lives.

**Major modules:** auth/oauth, families, consent, admissions/trials, scheduling, classroom (LiveKit), lessons/lesson-cards/mistakes, hifz, mushaf, courses/curriculum/assessments, billing/payroll, teachers/hiring/interviews/training, qa/cases (safeguarding), crm, notifications, settings, permissions, audit, storage/uploads, webhooks, worker (BullMQ jobs).

**Key entities & status enums:** `Enrolment(EnrolmentStatus)`, `ClassSession(ClassStatus)`, `TrialOutcome(TrialOutcomeStatus)`, `TeacherApplication(TeacherHiringStatus)` + `HiringStep`, `InterviewSession`, `CaseRecord(CaseStatus)`, `Invoice/Subscription/Payment/Refund`, `PayrollPeriod`, `Assessment`, `SupervisorAssignment`, `Consent/FamilyMember/GuardianVerification`.

---

## 3. Complete Workflow Map (role-to-role data lifecycle)

**Trial → enrolment → class (student/guardian + teacher + admin):**
```
GUARDIAN register (auth.register) → User(ACTIVE, emailVerifiedAt=NULL) + GUARDIAN role
  └ Family + FamilyMember(verifiedAt=NULL)
      └ Student (under-13 → requiresConsent); grant DATA_COLLECTION → Consent(GRANTED)   ⚠ granter need not be verified (STU-01/02)
BOOK TRIAL (guardian self-book: scheduling.bookSlot | office: admissions.bookTrial)
  → [tx] ClassSession(TRIAL,SCHEDULED) + Enrolment(TRIAL) + ClassStudent(FK) + Lead(TRIAL_BOOKED) + reminders
ATTEND (classroom.issueRoomToken → ClassParticipant.minutesPresent)
COMPLETE (teacher: admissions.completeTrialOutcome) → [tx] TrialOutcome(won?, subscribeToken) + ClassSession=COMPLETED
  won → Enrolment stays TRIAL ; lost → Enrolment=CANCELLED
CONTINUE → subscribe → BillingService.activate → Enrolment TRIAL→ACTIVE   ⛔ GATED: billing disabled on this deployment
REGULAR CLASS (createRecurringSchedule / bookSlot REGULAR) → requires Enrolment ACTIVE + Subscription ACTIVE
```

**Teacher hiring → active:**
```
apply (teachers.applications) → TeacherApplication + full HiringStep pipeline + ApplicationDocument + HiringReference
  → steps (recitation → demo/interview → ID check → references → training) each evidence-gated server-side
  → APPROVED (completeApproval) → User + UserRole(TEACHER) + TeacherProfile(STANDARD tier) + PasswordResetToken + email
  → onboarding submit → profileCompletedAt ; tier assign ; availability ; readyToMatch=true (triple-enforced)
  → trial assignment → TrialOutcome → (billing) activate → regular classes → lesson cards / mistakes / QA review
```

**Supervision / QA / safeguarding:**
```
QA sample/draw → QaReview (scoped to SupervisorAssignment) → teacher reply loop → scorecard
Complaint → CaseRecord(COMPLAINT) visible to scoped supervisor ; SAFEGUARDING case visible ONLY to SAFEGUARDING_LEAD/SUPER_ADMIN (assertVisible) → forward-only CaseStatus → CLOSED(+note)
```

Full route→role→ownership matrix is in §7.

---

## 4. Role-Based Audit (findings by role)

### Student / Guardian / Child_Student
Backend is robust here: **no cross-family IDOR, no orphaned-record, no record-inaccessible-after-status-change** bugs were found; all parent-portal reads derive the actor from the session and call `assertGuardianOwnsStudent`/`canAccessStudent`, trial booking creates `ClassSession`+`Enrolment`+`ClassStudent` in one transaction, trial outcomes are idempotent, cancellation/charge derivation is server-side, and kids-PIN/child-login flows are transactional and throttled. **Open gaps:** STU‑01 (CR‑01 consent gate dead code — High), STU‑02 (no email verification — Medium), STU‑03 (`AddGuardianDto.email` not validated — Low), STU‑04 (consent cache — Low/suspected). **Config limitation:** with billing disabled the won-trial→paid-enrolment→regular-class lifecycle cannot complete (expected, not a defect).

### Teacher
Hiring/activation pipeline is well-guarded and persistence-correct; the three prior "known" hiring bugs are **fixed**. High-value teacher-owned records are ownership-checked, not just role-gated. **Open gaps are supervisor-scope inconsistencies and robustness:** TCH‑01 (supervisor can read any teacher's timetable + student names — Medium), TCH‑02 (brief route grants SUPERVISOR/ADMIN then hard-403s them — Low/Med), TCH‑03 (booking gate ignores `profileCompletedAt` → booked-but-unrunnable class — Low), TCH‑04 (missing `ParseUUIDPipe` → 500 — Low), TCH‑05 (availability staff-scope gate — Low), TCH‑06 (profile-complete cache — info).

### Admin / Super Admin
The Nov‑2026 admin backend is implemented and largely sound. `admin/console/*` account-management routes are `SUPER_ADMIN`-gated with self-demote / last-super-admin guards; `admin/ops/*` uses the permission matrix; refunds/write-offs are `SUPER_ADMIN`. **Open gaps:** SEC‑01 (role change doesn't revoke sessions / recompute staff flag — Medium), and the money-saga atomicity items (INT‑F3/F4/F5) surface in the admin billing area.

### Supervisor / Safeguarding Lead / Examiner
Supervisor scoping via `SupervisorAssignment` is correctly applied on every `PolicyService` path; safeguarding cases are correctly restricted. **Open gaps:** the pure-`@Roles` routes that don't call `PolicyService` leave a bare supervisor effectively global (SEC‑04 notification prefs — Low; SEC‑05 interviews / applications / CRM-by-area — Low/Info), plus TCH‑01. Examiner has a working exam workspace (`exams/mine`, atomic `result` write).

---

## 5. End-to-End Flow Results

| Flow | Method | Result |
|---|---|---|
| Teacher application → approval → account | Static trace + API jest suites | **PASS (traced/tested)** — pipeline, evidence gates, account creation all linked; see teacher transition table §8 |
| Trial booking → outcome | Static trace + jest | **PASS (traced/tested)** — atomic, idempotent, FK-linked |
| Student continuation → paid enrolment → regular class | Static | **BLOCKED (config)** — billing disabled; TRIAL→ACTIVE unreachable on this deployment |
| Supervision / QA review → reply → scorecard | Static | **PASS (traced)** — scoped; UX stale-cache gap CACHE‑01 |
| Safeguarding case lifecycle | Static + live probe | **PASS** — supervisors excluded; forward-only |
| API unit/integration suite (api) | **Executed live** | 73/83 suites, **995 assertions pass, 0 failures**; 10 suites fail to *compile* only (stale Prisma client) |
| Web unit suite (web) | **Executed live** | 861/864 pass; 3 fail (2 timeouts + 1 OAuth assertion) = host/env flakiness |
| **Playwright e2e (all portals)** | **Attempted live** | **BLOCKED — E2E‑01**: setup gate fails (test accounts `@hifzoon.test` vs seed `@yopmail.com`); 1 passed, 1 failed, **116 did not run** |
| Live API probes | **Executed** | SUPER_ADMIN→ADMIN hierarchy present; staff login returns `TWO_FACTOR_REQUIRED`; `_prisma_migrations` 48/48 in sync |

---

## 6. API and Database Findings

**INT‑R1 — Duplicate enrolment / double-bill (HIGH, CONFIRMED).** `Enrolment` has only `@@index([studentId,status])`/`@@index([teacherId,status])` — **no `@@unique([studentId,courseId])`** (`schema.prisma:1164-1193`). `billing.service.ts:775-824` (`startWithTeacher`) and `subscribe` do `findFirst(status in ACTIVE/PAUSED)` then `enrolment.create` non-atomically. Two concurrent subscribes for the same child+course both pass → duplicate enrolment → double-billing path (the exact case the code comment says must not happen). **Fix:** partial unique index on live `Enrolment(studentId,courseId)` + P2002 handling, or conditional create in a `$transaction`.

**Non-atomic multi-write sagas (MEDIUM):** INT‑F1 teacher application+pipeline (`teachers.service.ts:95-138`), INT‑F2 teacher provisioning (`:795-852`), INT‑F3 payment-webhook settlement (`billing.service.ts:1609-1705`), INT‑F4 refund total-only fallback has **no idempotency key** (`:1806-1818`) — the real exposure, INT‑F5 subscription `activate` 6-write saga (`:944-1042`). Each can leave an inconsistent half-state on mid-saga failure (most self-heal on webhook redelivery via `@unique` provider ids). INT‑F6/F7 CRM/add-guardian (Low). **Fix:** wrap each in `$transaction`; add idempotency key to F4.

**Missing uniqueness / race constraints (MED→LOW):** INT‑R2 duplicate INCOMPLETE subscription; INT‑R3 duplicate open application per email (`@@index` not `@@unique`); INT‑R4 duplicate `ClassParticipant` → inflated attendance; INT‑R5 **overlapping payroll periods** (class paid twice — only exact-range dup blocked); INT‑R6 trial weekly-cap via different slots; INT‑R7 promo global `maxRedemptions`; INT‑R8 duplicate weekly `ClassSession` on concurrent activate. **Good guards (do not re-flag):** `bookSlot` Postgres exclusion constraint prevents double-booking; `promoRedemption.redeem`, `recordHiringStep`, payroll `calculatePeriod`, Assessment result are all transactional/conditional.

**Delete safety:** deletes are conservative (Cascade from aggregate root or Restrict). One to watch: deleting a `TeacherProfile` **nulls** `Enrolment.teacherId`, and ownership checks key off `teacherId` — a delete silently strips ownership (in practice blocked by `ClassSession.teacher` Restrict).

**Stale generated Prisma client (PROD‑01):** `schema.prisma` modified 2026‑11‑12; generated client dates 2026‑11‑10 → 31 `tsc` errors + 10 jest compile failures locally. **CI/Render/Docker regenerate before build, so production is green.** Fix: add `postinstall: prisma generate` to `apps/api/package.json`.

**Migrations (PROD‑02/03):** `migration_lock.toml` is **missing/untracked** (restore with `provider="postgresql"`). The drift anticipated earlier is **not present** — live `_prisma_migrations` is 48/48 in sync; still verify staging/prod before `migrate deploy`.

**Performance / N+1 (PROD‑06, LOW‑MED):** worst read-path `billing.service.ts:1223` (`periodPriceFor` per trial-outcome row); `class-reminder.service.ts:85` (sequential over ≤1000 nightly sessions); `schedule-materialiser.service.ts:235` (per-student insert → should be `createMany`); per-row update loops at `billing.service.ts:2383/2730`. None on the public/auth hot path.

---

## 7. Authorization and Security Findings

**SEC‑01 — staff‑2FA mandate bypass on in-place promotion (MEDIUM, CONFIRMED).** `staff` is computed from roles only at login (`token.service.ts:32`) and copied forward on refresh (`auth.service.ts:522`); `setRoles` (`admin-console.service.ts:302`) doesn't revoke sessions. A GUARDIAN promoted to ADMIN gets full ADMIN authority on the next request but keeps `staff:false`, so the mandatory staff‑2FA enrolment interceptor never fires and the longer non-staff refresh TTL persists. **Fix:** revoke sessions on any role change (lowest-risk) or recompute `staff` on refresh.

**SEC‑02 — Enrolment state machine unguarded (MEDIUM, CONFIRMED).** `createEnrolment` accepts a client-settable `status` with no role gate (`courses.controller.ts:56`, `courses.service.ts:211/241`); `updateEnrolmentStatus` applies a naive `update` with **no from→to validation** (`:437`) → `CANCELLED→ACTIVE`, `COMPLETED→ACTIVE` accepted, and reverting CANCELLED→ACTIVE leaves auto-cancelled classes unrestored. **Severity capped** because the booking path independently requires an ACTIVE *subscription* (`scheduling.service.ts:659`), so this is data-integrity/UI-truth, not revenue bypass. **Fix:** gate create-status to staff; add a transition whitelist (copy the Assessment conditional-update pattern); forbid terminal→live.

**SEC‑03 (LOW):** enrolment status change does 3 writes without a `$transaction`. **SEC‑04 (LOW):** `GET /notifications/preferences/:userId` lets a bare supervisor read any user's prefs (no ownership scope). **SEC‑05 (LOW/INFO):** pure-`@Roles` routes where a bare supervisor is un-scoped (interviews, teacher applications, CRM by-area) — likely acceptable-by-design; confirm intent. **TCH‑01 (MED):** supervisor timetable scope bypass (§4).

**Confirmed healthy (known concerns mitigated):** roles-guard SUPER_ADMIN implication present; safeguarding `assertVisible` hides cases from supervisors; supervisor scoping enforced on PolicyService paths; public upload presign validated + rate-limited; teacher public file serving restricted to media (never certificates/ID). Global `ValidationPipe` `whitelist+forbidNonWhitelisted`; exception filter never leaks 5xx detail and redacts sensitive fields; env schema rejects placeholder secrets / `fake` payment / `log` mail / `CORS=*` in production.

**Full authorization matrix** (route → roles → ownership-checked) is reproduced from the cross-cutting review — see the appended matrix in the repo review notes; key rows: all `families/*`, `parent/*`, `classroom/*`, `consent/*`, `lesson-cards/*`, `qa/cases/*` are ownership-checked via `PolicyService`; `admin/console/*` account mutations are `SUPER_ADMIN`; webhooks are `@Public` with signature verification.

---

## 8. State Transition Findings

9 of 10 machines are **forward-only + enforced**; `Enrolment` is the exception (SEC‑02).

| Entity | Enforcement | Verdict |
|---|---|---|
| CaseRecord | `CASE_FLOW.indexOf` forward-only; CLOSED terminal + ≥1 note | ✅ enforced |
| TrialOutcome | PENDING→COMPLETED only, atomic tx, idempotent, refuses future/cancelled | ✅ enforced |
| ClassSession | only SCHEDULED/LIVE cancellable; `by` server-derived; conditional go-live; tx | ✅ enforced |
| Subscription | pause/resume/cancel reject illegal source states; ownership-checked | ✅ enforced (activate not atomic — INT‑F5) |
| Invoice | webhook-driven; `@unique` payment id + ProcessedWebhookEvent idempotency | ✅ enforced (writes not atomic — INT‑F3) |
| PayrollPeriod | OPEN→CALCULATED→EXPORTED forward-only; entry-paid guarded | ✅ enforced (open-overlap race — INT‑R5) |
| TeacherApplication | `assertStepOrder` no skip; REJECTED/APPROVED terminal; safeguarding-gated | ✅ enforced (create not atomic — INT‑F1) |
| InterviewSession | reject closed states; conditional go-live; 2nd-interview rejected | ✅ enforced |
| RevisionRequest | respond rejects CLOSED; close rejects already-CLOSED | ✅ enforced |
| Assessment | **atomic conditional `where:{id,result:PENDING}`** | ✅ reference pattern |
| **Enrolment** | client-settable status, no from→to guard | ❌ **NOT enforced (SEC‑02)** — illegal terminal→live reverts |

---

## 9. UI/UX Findings (TanStack Query cache + web)

Query keys are not centralized and React Query matches element-by-element (not prefix), so narrow invalidations miss sibling modules. 13 gaps found (no dead-key invalidations remain):

- **CACHE‑01 (HIGH, CONFIRMED):** `useSubmitReview` invalidates only `['qa','scorecard',id]` → the QA **queue**, **past-reviews**, and **rating** stay stale after a review is submitted.
- **CACHE‑02 (MED):** course activate/archive/restore/rename refreshes only `['courses-admin']`, never the **public catalogue** `['courses']` → archived course still listed/bookable ≤5 min.
- **CACHE‑03 (MED):** lesson-card submit doesn't refresh `['lesson-cards','for-class']` → "view submitted card" stays null.
- **CACHE‑04 (MED):** subscription cancel/pause refreshes billing-family only, not `['parent','schedule'/'dashboard']` → parent timetable stale after server-side class cancellation.
- CACHE‑05…13 (LOW/suspected): mistake-count dashboard key, QA draw-sample queue, payroll/teacher payslip cross-session, admin user drawer counts, availability timetable, two consent representations, public FAQ list, rate-class dashboard.

Web loading/empty/error states were **not** reviewed in depth (app not browser-driven due to E2E‑01); a dedicated web pass is recommended on `components/admin/teachers/*`, `.../trials/*`, `parent/ContinueWithTeacher.tsx`.

---

## 10. Reproducible Bugs (full detail)

> Format: ID · Severity · Role · Route · Preconditions · Repro · Expected · Actual · API (file:line) · DB entity · Root cause · Fix · Evidence.

**INT‑R1 · High · any booker · `POST /billing/subscribe`, `/billing/start-with-teacher` · CONFIRMED**
Pre: same child+course, two concurrent requests. Repro: both call `enrolment.findFirst({status in ACTIVE/PAUSED})` (none), both `enrolment.create`. Expected: one enrolment. Actual: two → duplicate course + double-billing path. API: `billing.service.ts:775-824`; schema `Enrolment` `1164-1193`. DB: `Enrolment`. Root cause: no unique constraint + non-atomic check-then-create. Fix: partial unique `(studentId,courseId)` on live statuses + P2002 / conditional tx.

**STU‑01 · High · GUARDIAN (under‑13) · booking + consent · CONFIRMED**
Pre: child <13; unverified guardian grants DATA_COLLECTION. Repro: register (email unverified), add under‑13, grant consent, book trial. Expected: a **verified** `FamilyMember` required before under‑13 enrolment (CR‑01, per `assertChildUsable` doc). Actual: `assertChildUsable` (`consent.service.ts:471`) has **zero callers**; booking gated only on a self-granted consent row; `FamilyMember.verifiedAt` never checked. API: `scheduling.service.ts:778-797`, `admissions.service.ts:101-113`. DB: `Consent`, `FamilyMember.verifiedAt`, `GuardianVerification`. Fix: call `assertChildUsable` in `bookSlot`/`bookTrial`/activation for under‑13.

**E2E‑01 · High (test signal) · n/a · Playwright suite · CONFIRMED**
Pre: run `npx playwright test`. Repro: setup gate "staff accounts can enrol 2FA" fails → `STAFF_2FA_SECRETS` empty → 116 tests skipped. Expected: suite runs. Actual: `e2e/helpers.ts:17-25` `ACCOUNTS` use `@hifzoon.test`, but seed (commit `97693e1`, "dev email domain") now creates `@yopmail.com` accounts → every e2e login targets non-existent users. Live probe: `superadmin@yopmail.com` logs in (returns `TWO_FACTOR_REQUIRED`); `superadmin@hifzoon.test` does not exist. Fix: align `e2e/helpers.ts` `ACCOUNTS` to `@yopmail.com` (or make the domain env-driven and matched to the seed). **Until fixed there is no browser-level regression signal.**

**SEC‑01 · Medium · promoted user · `PATCH /admin/console/users/:id/roles` · CONFIRMED**
Repro: user logged in as GUARDIAN; super admin grants ADMIN; victim keeps session → full ADMIN power, `staff:false`, 2FA enrolment never forced, long refresh TTL kept. API: `auth.service.ts:519-522`, `jwt.strategy.ts:79-84`, `admin-console.service.ts:302`. Fix: revoke sessions on role change.

**SEC‑02 · Medium · GUARDIAN/staff · `POST /courses/enrolments`, `PATCH .../:id/status` · CONFIRMED**
Repro: `POST {status:"ACTIVE"}` → enrolment ACTIVE with `subscriptionId=null`; or `PATCH {status:"ACTIVE"}` on a CANCELLED enrolment → revert accepted, auto-cancelled classes not restored. API: `courses.service.ts:211/241/437-467`. Fix: staff-gate create status + transition whitelist.

**STU‑02 · Medium · self-registrant · `POST /auth/register` · CONFIRMED** — no verification email sent, `emailVerifiedAt` never set/checked for password accounts (`auth.service.ts:70-211`). Fix: send verification link on register and/or gate sensitive actions; closes CR‑01 chain with STU‑01.

**TCH‑01 · Medium · SUPERVISOR · `GET /scheduling/teachers/:teacherId/timetable` · CONFIRMED** — `STAFF_SCOPE_ROLES` short-circuit treats every supervisor as unscoped → reads any teacher's timetable incl. student names (`scheduling.service.ts:1883-1891`). Fix: restrict to `supervisedTeacherIds`.

**Lower-severity (summarized):** TCH‑02/03/04/05/06, SEC‑03/04/05, STU‑03/04, INT‑F1…F7, INT‑R2…R8, CACHE‑02…13, PROD‑02/04/05/06 — full detail with file:line in the role audit notes (reproduced in §6/§7/§9).

---

## 11. Test Coverage Matrix

| Area | Role | Scenario | Execution | Evidence | Outstanding risk |
|---|---|---|---|---|---|
| API logic | all | unit/integration | **Executed** | 995 assertions pass, 0 fail (73/83 suites; 10 compile-blocked by stale client) | regenerate client locally |
| Web components | all | unit | **Executed** | 861/864 pass | 3 flaky (host/env) |
| Lint | — | api+web+shared | **Executed** | 0/0 | — |
| Typecheck | web | `tsc` | **Executed** | pass | — |
| Typecheck | api | `tsc` | **Executed** | 31 errors (stale client only) | postinstall generate |
| Auth/RBAC, portals, public, responsive | all | e2e flows | **BLOCKED (E2E‑01)** | 116/118 did not run | **no live browser regression signal** |
| Trial/enrolment/hiring/QA flows | all | end-to-end persistence | **Static trace** | linked & transactional | not browser-executed |
| Continuation→paid class | guardian | e2e | **Blocked (billing off)** | — | retest with billing enabled |
| Migrations | — | drift | **Executed (live)** | 48/48 in sync | verify staging/prod |
| Deps | — | `npm audit` | **Executed** | 28 advisories (14 high) | triage zod DoS |

---

## 12. Production Readiness Verdict

| Classification | Items |
|---|---|
| **Blocker (fix before launch)** | **INT‑R1** (duplicate enrolment / double-billing race); **E2E‑01** (restore the e2e suite — there is currently no automated browser regression signal) |
| **Needs fixing before launch** | **STU‑01** (CR‑01 under‑13 consent gate) + **STU‑02** (email verification) together; **SEC‑01** (staff‑2FA bypass); **SEC‑02** (enrolment reverts); verify staging/prod `_prisma_migrations` before deploy |
| **Should fix soon** | INT‑F1…F5 atomicity (esp. F4 refund idempotency); INT‑R2…R8 constraints (esp. R5 payroll overlap); TCH‑01 supervisor scope; CACHE‑01/02/04; PROD‑02 `migration_lock.toml`; PROD‑04 `zod` DoS triage |
| **Improvement** | PROD‑01 `postinstall prisma generate`; PROD‑06 N+1; CACHE‑03…13; TCH‑02…06; SEC‑03/04/05; STU‑03/04; PROD‑05 flaky tests |
| **Verified working (no action)** | roles hierarchy, safeguarding visibility, supervisor scoping, hiring lifecycle, trial atomicity/idempotency, kids-login, cancellation charge logic, exception filter, env guards, billing-disabled guard, exclusion-constraint double-booking protection, Assessment atomic write |

**Bottom line:** The platform is close to production-ready and well-engineered. It is **not** blocked on build/infra (CI/Docker/Render pipelines are green). It **is** blocked on two things that should gate launch: the double-enrolment/double-billing race (**INT‑R1**) and the broken e2e suite that currently leaves the product with no automated end-to-end regression signal (**E2E‑01**). The CR‑01 consent chain (STU‑01/02) and the staff‑2FA / enrolment-state issues (SEC‑01/02) should be closed in the same pre-launch pass.

---

## 13. Recommended Fix Order (by dependency & impact)

1. **INT‑R1** — add the `Enrolment(studentId,courseId)` partial-unique + P2002 handling. *(Unblocks safe billing; everything downstream of enrolment depends on it.)*
2. **E2E‑01** — align e2e `ACCOUNTS` to the seed domain; re-run the suite to re-establish the regression signal **before** making further changes.
3. **STU‑01 + STU‑02** — wire `assertChildUsable` into under‑13 booking/activation and add email verification. *(One consent/identity work-stream; do together.)*
4. **SEC‑01** — revoke sessions on role change. **SEC‑02** — enrolment transition whitelist + staff-gate create status.
5. **INT‑F1/F2/F3/F4/F5** — wrap sagas in `$transaction`; add idempotency key to the refund fallback (F4 first — real money exposure).
6. **INT‑R3/R4/R5** — missing unique/overlap constraints (R5 payroll overlap pays twice — prioritize).
7. **TCH‑01**, **CACHE‑01/02/04**, **PROD‑02**, **PROD‑04** — scope fix, UX staleness, migration lock, dependency triage.
8. **PROD‑01** (`postinstall generate`) and the remaining Low/Improvement items.

---

### Appendix — Evidence & limitations
- **Executed live:** `apps/api` jest (995 pass), `apps/web` vitest (861/864), `tsc` (web clean; api 31 stale-client errors), `eslint` (clean), `npm audit` (28), `_prisma_migrations` query (48/48), API auth/2FA/role probes.
- **Blocked:** Playwright browser flows (E2E‑01); won-trial→paid-enrolment (billing disabled); DB trigger `recompute_teacher_readiness` body, worker job execution, email/LiveKit delivery (not executed — traced in code only).
- **Not modified:** no application source, schema, migration, or data was changed; no commits. This report is findings-only, for review before any fix is applied.
