# Frontend handoff — Nov 2026 admin & supervision remediation

This covers the backend and frontend changes from the "Admin & Supervision — Requirements & Remediation Backlog" (critical items 1–14 and the Medium list). It says what changed, what the UI must do about it, and which web files were already touched so you can pull them without surprises. The earlier batch is in `Hifzoon-FRONTEND-HANDOFF-OCT2026.md`.

Missing Features (the third section of the backlog) are **not started**; they are listed at the end as the remaining frontend work.

**Branch:** `feat/backend-render-deploy`, merged with `origin/dev` (so promo codes, the Quran Foundation provider and the Oct batch are all in).

---

## 0. Before you run it

1. **Migrations.** Four new ones; `npm run db:deploy` applies them (verified on a fresh database, no drift):
   - `20261111091012_supervisor_assignment` — new `supervisor_assignment` table, **seeded** with every existing supervisor × every teacher (so nobody loses access on deploy).
   - `20261111120000_money_idempotency` — `idempotency_key` on `invoice` and `refund`.
   - `20261111130000_lowercase_user_emails` — lowercases existing mixed-case emails (skips any that would collide with another account; those need a manual merge).
2. **Environment (website + API gate).** Unchanged from the earlier notes, repeated for completeness:
   - API: `API_ACCESS_KEY` (≥ 24 chars, optional; unset = no gate), `CORS_ORIGINS` must include the web origin.
   - Web: `NEXT_PUBLIC_API_ACCESS_KEY` (same value), optional `SITE_ACCESS_PASSWORD`, `NEXT_PUBLIC_API_URL=/api/v1` with `API_PROXY_TARGET` when the web and API are on different sites, `NEXT_PUBLIC_SOCKET_URL` for sockets.
   - `NEXT_PUBLIC_*` values are baked at **build** time: change one, redeploy (a restart is not enough).
3. **Local `.env` gotcha.** If `QURAN_CONTENT_PROVIDER=quran_foundation` then `QURAN_FOUNDATION_CLIENT_ID/SECRET` are required (env validation fails otherwise). Use `fake` locally.

---

## 1. Behaviour changes the UI must handle

### Money

| Endpoint                                                                               | Change                                                                                                                                                                                                                    | What the UI does                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/billing/invoices`, `POST …/refunds`                                       | **`Idempotency-Key` header is now required** (400 without it). A repeat with the same key returns the original row and never calls Stripe again. Reusing a key for a different subscription/payment/amount is 409.        | `billing-admin.ts` already sends it for issue-invoice, refund, write-off and dunning. **Mint the key once per user intent** (when the confirm dialog opens), not per click/retry — that is what makes a double-click safe. Any new caller must do the same.                 |
| `POST /admin/billing/invoices`                                                         | **409** if the subscription is billed by the card provider (`providerSubscriptionId` set). Stripe already invoices those; a manual one would double-charge.                                                               | Show the 409 message as-is. Ideally hide/disable "Issue invoice" for card subscriptions (the lookup rows already carry `source`: Stripe vs academy).                                                                                                                        |
| `POST /payroll/periods`                                                                | End date is now **inclusive** (classes on the last day count). A one-day period (start = end) is valid. **409** if the range overlaps an existing period.                                                                 | Date pickers: allow start = end; show the overlap message. Remove any "+1 day" workaround.                                                                                                                                                                                  |
| Payroll report / payslip (`grossMinor`, `deductionsMinor`, `bonusesMinor`, `netMinor`) | `grossMinor` is now **class earnings only**. Teacher no-show deductions are in `deductionsMinor` (positive number). `netMinor = gross − deductions + bonuses`. `bonusesMinor` is always 0 until the bonus feature exists. | `PayslipsScreen.tsx` and `PayrollConsole.tsx` already show Gross / Deductions columns; they now show real numbers. Add a Bonuses column when the manual-bonus UI is built. Payslips for already-calculated periods keep their old numbers (periods are never recalculated). |
| Promo codes                                                                            | Editing a legacy GBP code keeps GBP; its discount can't change once redeemed (409).                                                                                                                                       | Already handled by the `dev` code; just surface the 409.                                                                                                                                                                                                                    |

### Roles, accounts and supervision

| Area                                                                              | Change                                                                                                                                                                                                                              | UI impact                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN`-guarded endpoints                                                         | `SUPER_ADMIN` now passes any `@Roles(ADMIN)` check.                                                                                                                                                                                 | Nothing to do; a super admin no longer needs both roles to use admin screens.                                                                                                                 |
| `GET /admin/console/users/:id`                                                    | **New.** Returns `{ id, email, name, status, roles: [{ role }] }`.                                                                                                                                                                  | Used by `useAdminUser` to preload the role editor (done, see §3).                                                                                                                             |
| `PATCH …/users/:id/roles`                                                         | Now atomic. **400** when you change your own roles; **409** if it would remove the last active super admin.                                                                                                                         | The drawer already disables the form for yourself; show the 409 text.                                                                                                                         |
| `PATCH …/users/:id/status`                                                        | **400** locking/disabling yourself; **409** locking the last active super admin.                                                                                                                                                    | Same.                                                                                                                                                                                         |
| Supervisor scoping                                                                | Supervisors now only see **the teachers assigned to them**: their students, classes, lesson cards, QA, and cases. `ADMIN`/`SUPER_ADMIN`/`SAFEGUARDING_LEAD` are unscoped. Out-of-scope reads return **404/403**, not an empty list. | Supervisor pages will legitimately be emptier. Existing supervisors were seeded onto all teachers, so nothing disappears on deploy; admins narrow it down later via the assignment endpoints. |
| `GET /supervision/me/teachers`                                                    | **New.** The teachers on the signed-in supervisor's caseload.                                                                                                                                                                       | Candidate source for the supervisor "My teachers / caseload" screen (not built — see §4).                                                                                                     |
| `GET /supervision/supervisors/:id/teachers`, `PUT`/`DELETE …/teachers/:teacherId` | **New**, admin only. List, assign, unassign.                                                                                                                                                                                        | Needs an admin screen to manage assignments (not built).                                                                                                                                      |
| Safeguarding cases                                                                | Hidden from supervisors entirely (404). Only `SAFEGUARDING_LEAD`/`SUPER_ADMIN` see them. Assigning a case validates the owner (active staff, not the reporter/subject/class teacher; safeguarding only to lead/super admin).        | Don't render safeguarding cases in supervisor lists. Surface the 400/409 on assign.                                                                                                           |
| QA review                                                                         | **400/403** reviewing a class you teach, or a teacher not on your caseload.                                                                                                                                                         | Hide "Review" for your own classes; show the error otherwise.                                                                                                                                 |
| Lesson cards                                                                      | Editing a locked card: supervisors/super admins only, and **a reason is required** (dev). A plain admin can edit only unlocked cards.                                                                                               | Disable the edit action on locked cards for non-supervisors; require the reason field.                                                                                                        |
| Interviews                                                                        | Reschedule / cancel / reassign only by the interviewer or an admin; only an admin may change the interviewer. **403** otherwise.                                                                                                    | Hide those buttons for other supervisors.                                                                                                                                                     |

### Hiring

- A **failed step now rejects the application** (`status: REJECTED`). Before, it stayed parked at the failed stage, which blocked the applicant from re-applying.
- Passing the failed step again moves a rejected application forward; if they were already approved, re-approval restores the teacher (`hiringStatus: APPROVED`).
- Approving an applicant who **already has an account** now also grants the `TEACHER` role.
- UI: the board's stage counts/tabs should put failed applicants under **Rejected**; allow "Record step → Passed" on a rejected application (this is the re-approval path). No endpoint change.

### Scheduling & admissions

- **Teacher change** (`POST /teacher-changes/:id/resolve`, `PATCH /courses/enrolments/:id/teacher`) moves only the future classes **of that enrolment**. Classes shared with other children stay with the old teacher; the audit entry records `sharedClassesLeftWithOldTeacher`. If that number is > 0, tell the admin those group classes need splitting by hand.
- **`GET /courses/enrolments/list`** rows now include `student.family.timeZone`. `ScheduleBuilder.tsx` uses it as the default "Family time zone" (falls back to the browser zone only if the family has none; the admin can still override).
- Family time zone is stored as `"UTC"` by default for families that never set one — worth asking families to confirm their zone.

### Settings, CMS, CRM

- **Settings validation** (`PATCH /admin/settings`): every numeric setting has a range and must be a whole number; required text can't be empty; `platform.contact.email` must be an email; `billing.currency` a 3-letter code; booleans must be `true`/`false`. Errors are 400 with a readable message. Ranges (min–max): trial duration 5–120 min; trial cancellation notice 0–72 h; no-show follow-up 1–168 h; card lock 1–720 h; share SLA 1–1440 min; materialise days 7–365; substitute / cancellation notice 0–168 h; max session gap 0–120 min; safeguarding alert SLA 1–1440 min; QA samples/month 0–50; QA review SLA 1–720 h; dunning retry 1–30 d; invoice due 1–90 d; sibling discount 0–50 %; payroll cut-off day 1–28; booking confirmation SLA 1–3600 s; reminder hours 1–168. **Mirror these in the settings form** (`min`/`max`/`step=1`) so users don't hit the 400.
- **CMS**: saving a post that is marked deleted is **409**. A deleted post is no longer served publicly. Offer "create a copy" instead of "restore".
- **CRM tasks**: `GET /admin/crm/tasks` with **no `status` now returns every task** (done/cancelled too). Previously it silently meant `OPEN`. `CrmWorkspace.tsx` already sends `status=OPEN` for the Open/Overdue tabs and nothing for "All", so it now behaves as labelled.
- **CRM funnel** (`pipelineSummary`): `trialToWonRate` = won-after-a-real-trial ÷ trials held; `bookingToDoneRate` = trials held ÷ ever booked. Both are ≤ 100 % now (null when the denominator is 0). Leads set straight to WON without a trial are excluded from the trial rate.

### QA

- **Monthly sampling** (`POST /qa/teachers/:teacherId/sample`) now draws uniformly at random from all of the teacher's eligible classes, up to the configured count. The result shape is unchanged.

### Audit log

New actions appear in the audit viewer (add labels if you map them): `hir.application.step`, `hir.application.document.review`, `hir.application.reference.outcome`, `hir.profile.review`, `hir.interview.schedule|reschedule|cancel|notes|outcome|noShow|end`, `ops.tier.create|update|assign`, `bil.plan.tier`. Failed attempts are logged as `<action>.denied`. These rows deliberately store **no response body**.

---

## 2. New / extended API for the UI

| Endpoint                                            | Purpose                                                                 | Params                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /teachers/assignable`                          | Approved teachers staff can assign — **includes new and untiered ones** | `q` (name). Roles: supervisor, admin, super admin                                |
| `GET /teachers/public`                              | Public directory, now paged                                             | `page` (100 per page, stable order); `subject`, `language` as before             |
| `GET /teachers/applications/list`                   | Hiring board                                                            | `status`, **`q`** (name or email), **`page`**, **`limit`** (≤ 200, default 200)  |
| `GET /admin/data-requests`                          | Privacy request queue                                                   | `openOnly`, `status`, **`q`** (family or child), **`page`**, **`limit`** (≤ 500) |
| `GET /admin/billing/lookups`                        | Subscription / invoice / payment pickers                                | **`q`** (family name or invoice number); newest 200 without it                   |
| `GET /admin/console/users/:id`                      | One account + roles                                                     | —                                                                                |
| `GET /supervision/me/teachers` and admin assignment | Supervisor caseloads                                                    | see §1                                                                           |

All additions are backwards compatible: with no new params the responses are the same as before.

---

## 3. What is already done in `apps/web` (pull these)

| File                                                                                                                              | Change                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/admin/users/UsersConsole.tsx`                                                                                         | Role editor starts from the stored roles (`useAdminUser`), is disabled until they load, and no longer replaces the set with only what was ticked.                                                                                                                                                                                     |
| `hooks/useAdminConsole.ts`, `lib/api/modules/admin-console.ts`                                                                    | `useAdminUser`, `adminConsoleApi.getUser`; role mutation also invalidates the user query.                                                                                                                                                                                                                                             |
| `components/admin/scheduling/ScheduleBuilder.tsx`                                                                                 | Family time zone defaults from the selected enrolment's family; admin's browser zone is the last resort.                                                                                                                                                                                                                              |
| `lib/api/modules/scheduling-admin.ts`                                                                                             | `EnrolmentListItem.student.family.timeZone`.                                                                                                                                                                                                                                                                                          |
| `app/supervisor/page.tsx`                                                                                                         | Overview no longer spins forever with zero teachers or on a failed query.                                                                                                                                                                                                                                                             |
| `components/admin/shared/Pickers.tsx`, `courses/EnrolmentsPanel.tsx`, `hooks/useTeachers.ts`, `lib/api/modules/teacher.ts`        | Teacher pickers use `useAssignableTeachers` (`/teachers/assignable`) instead of the public directory.                                                                                                                                                                                                                                 |
| `lib/api/client.ts` (`fetchTeachers`)                                                                                             | Reads the public directory page by page (no more silent cut at 100).                                                                                                                                                                                                                                                                  |
| `components/admin/teachers/HiringPipeline.tsx`, `hooks/useHiring.ts`, `lib/api/modules/teacher-hiring.ts`                         | Search box is debounced and sent to the server (`q`); stage/country filters still apply to the returned rows.                                                                                                                                                                                                                         |
| `components/admin/data-requests/DataRequestsQueue.tsx`, `hooks/useDataRequestsAdmin.ts`, `lib/api/modules/data-requests-admin.ts` | Same server-side search.                                                                                                                                                                                                                                                                                                              |
| `components/admin/finance/BillingForms.tsx`, `hooks/useFinance.ts`, `lib/api/modules/billing-admin.ts`                            | Refund / invoice / write-off pickers search the server as you type (`Select onInputChange` → `useBillingLookups(q)`).                                                                                                                                                                                                                 |
| `hooks/useCoursesAdmin.ts`, `hooks/useAdminAdmissions.ts`, `hooks/useFinance.ts`                                                  | **Stale-data fixes:** enrolment create/status now refresh the paged table and the scheduler's list; _change teacher_ invalidated a key that matched nothing (`'admin-courses'` → `'courses-admin'`); refund / write-off / issue-invoice / dunning refresh the invoice list; calculating or paying payroll refreshes the periods list. |
| `proxy.ts`, `lib/api/client.ts`, socket hooks                                                                                     | Site password gate and API access key (earlier batch).                                                                                                                                                                                                                                                                                |

Data-fetching rule used throughout: **any mutation must invalidate every query that shows the thing it changed** — list, paged list, detail, and dependent pickers. If you add a mutation, grep the key prefix of every view of that entity.

---

## 4. Still to build on the frontend (backend ready or partly ready)

Ready on the backend, **no UI yet**:

- Supervisor caseload screen and admin assignment screen (`/supervision/*`).
- Server-side search/paging controls beyond the three wired lists (the endpoints take `page`/`limit`; the tables still load the first page).

Not started on either side (the backlog's "Missing Features"): admin cancel/reschedule of a single class; edit/pause/resume/end recurring schedules; academy holidays & Ramadan timetable; substitute-teacher flow; matching filters; pay-rate CRUD; payroll CSV export; class credits; manual payroll bonuses/deductions; family & student detail/edit pages; analytics dashboard; role-permission matrix; staff-account creation with invite; admin password/2FA reset, resend invite, revoke sessions; supervisor read-only message view; configurable QA rubric; fuller scorecard; review queue and past-review screens; course edit/archive; examiner assignment & results; course material upload; staff answers to revision requests.

---

## 5. Smoke checklist after pulling

1. Open Users → pick an account → the role boxes are pre-ticked; change one → saved set = previous set ± that role.
2. Issue an invoice for a card subscriber → 409 message; for a manual one → works; double-click confirm → one invoice.
3. Refund twice quickly → one refund row.
4. Open a payroll period ending today → today's classes are counted; try an overlapping period → 409.
5. Fail a hiring step → application shows under Rejected; pass it again → moves forward.
6. Book a schedule for a family in another zone → the form defaults to the family's zone.
7. As a supervisor, open a teacher who isn't on your caseload → no access.
8. Settings: enter `payroll.cutoff_day = 40` → inline 400 message.
9. CRM → Tasks → "All" lists done/cancelled tasks too.
10. Type a family name that is not among the newest 200 in a refund picker → it is found.
