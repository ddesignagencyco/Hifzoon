# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.2.0
**Updated:** 2026-10-17
**Author:** Frontend Engineering Team
**Verified against:** `feat-frontend-ui` at `40fadba` (includes backend `7a7a543` security fixes, OAuth `4c5c55f`, webhooks).
**Scope:** Everything the web app (`apps/web`) needs changed or added outside `apps/web`. The web team does not modify `apps/api`, `packages/*`, `docker/*` or root config; every item here is a request to the owning team.

Paths are relative to `apps/api/src/modules/` unless stated. Line numbers are as of 2026-10-17.

---

## 0. How to use this document (backend team)

- Every open item has an **ID**, the **evidence** (file:line), the **problem** and the **requested change**. Please reply per ID with `FIXED <commit>`, `WONTFIX <reason>` or `QUESTION`.
- Status was verified by **reading the current code**, not commit messages or `docs/FRONTEND-DIRECTION.md`. Where the hand-off note and the code disagree, the code wins (see §6).
- **Only open requests are listed.** Items verified as fixed and working on the site are removed (history: git log and `apps/web/docs/progress.md`).
- New items continue the numbering. v4.1.0 added the UI flow audit items (S20, B20–B24, M40–M43, Q19–Q24); v4.2.0 adds the ownership probe results (S12 reproduced, B25–B28, M44) and the **Fix first** list.

---

## 1. Summary

| Severity | Open | Theme |
| :--- | :---: | :--- |
| 🔴 P0 — Security / data exposure | 8 | Cancel/reschedule notice rules, guardian viewer scope, unshared lesson cards, messaging safeguarding, consent validation, staff billing access, **guardian verification skipped (S20)** |
| 🔴 P0 — Broken endpoints | 18 | Profile-change allow-list, approval transaction, teacher reassignment, open-slot ordering, class rating, family make-up credit, unvalidated keys/ids, notification paging, **notifications never delivered (B23)**, password-reset email, subscribe without invoice, trial outcome on future classes |
| 🟡 P1 — Missing endpoints / fields | 41 | Kids PIN & student OTP, uploads, `GET /teachers/me`, admin lists, CRM, messaging fields, real providers, notification producers, examiner workspace, **staff 2FA enforcement** |
| 🟢 P2 — Contract & quality | 22 | Idempotency, audit gaps, pagination, seed-only rating columns, webhook verification, dev mailer, password policy, policy-page content, seeds |

### 🚨 Fix first (blocking or safeguarding)

Reproduced on 2026-10-17 against the running API; each has evidence below.

| Order | ID | Why it is first |
| :---: | :--- | :--- |
| 1 | **S12** | A parent from another family can join and watch any class of a teacher who also teaches their own child (child safeguarding). |
| 2 | **B28** (→ B21, B25) | Trials create no enrolment, so in every trial the teacher can't log mistakes and the child's own parent can't enter the class. The trial flow does not work end to end. |
| 3 | **B23** | Quiet-hours check inverted: no notification is ever delivered, safeguarding alerts included. |
| 4 | **S20** | Guardian verification is skipped (parental consent for under-13s). |
| 5 | **M42** | Staff sign in without 2FA (FR-AUTH-01 mandatory). |
| 6 | **B26, B27** | Bookings accepted for a teacher who doesn't teach the course, and outside the teacher's availability. |
| 7 | **B20, Q21** | Password reset email cannot work (no dev mailer; empty code; no link). |
| 8 | **B22, B24** | Subscribing issues no invoice; a trial outcome can be recorded before the class. |

---

## 2. 🔴 P0 — Security & data exposure (open)

| # | Endpoint / area | Evidence | Problem | Requested change |
| :--- | :--- | :--- | :--- | :--- |
| S7 | `POST /scheduling/classes/:classId/cancel` | `scheduling/scheduling.controller.ts:63-67,188`; `scheduling.service.ts:429-467` | Ownership is enforced, but `by` and `noticeHours` are still client-supplied: a guardian can send `by:"FAMILY", noticeHours:0` and never be charged; the owning teacher can send `by:"FAMILY"` and have the family charged. | Derive `by` from the caller's role and compute the notice window server-side from settings; drop `noticeHours` from the DTO (web already never sends it). |
| S8 | `POST /scheduling/classes/:classId/reschedule` | `scheduling.service.ts:546-551` | Ownership fixed; there is **no notice-window rule** (only "not in the past"). | Apply the same configurable notice period as cancel (FR-SCH-04). |
| S12 | 🚨 **Guardian viewer token for other families' classes** | `classroom/classroom.service.ts:183-192` | Reproduced 2026-10-17 against the running API (`apps/web/docs/audit.md` §12). `parent@hifzoon.test` (Khan Family, child Maryam enrolled with Ustadh Bilal) called `POST /classroom/classes/01a149dd-…/token` for **Rehman's** trial class (Umair Shad family) and received **201 with `role: GUARDIAN_VIEWER`**. The check is "some child of mine has an enrolment with this class's teacher", so any family taught by the same teacher can watch any of that teacher's classes — a child-safeguarding breach. Meanwhile Rehman's own parent gets 403 (B25). | Grant `GUARDIAN_VIEWER` only when a child of the guardian is on **this** class (`ClassStudent`). Add an e2e test: other-family guardian → 403; own guardian of a trial child → 201. |
| S13 | `GET /lesson-cards/:id` for guardians | `lessons/lesson-cards.service.ts:468-543`, `:514` | Unchanged. No `sharedAt` check on `get()`; `class.recording.storageKey` is still returned to guardians. Only the list filters on `sharedAt` (`:557`). | Enforce `sharedAt` for guardians on `get()`; drop `storageKey` from guardian responses. |
| S14 | Messaging safeguarding | `parent-portal/messaging.service.ts:92-118`, `:104` | Unchanged. `studentId` is optional, so omitting it lets a guardian open a thread with any teacher; `enrolmentId` is stored unchecked; no server-side contact-detail filter or moderation. (The web always sends `studentId` + `enrolmentId` and filters in the composer.) | Require `studentId`; verify the enrolment belongs to that student and teacher; add server-side contact-detail filtering + moderation flagging. |
| S15 | Consent / data requests | `consent/consent.controller.ts:17-18,43-50,150-170`; `consent.service.ts:129,142,268` | Guardian-in-family checks added; data-request `studentId` is still not checked against the family (`@IsString` only) and consent `method` is still taken from the client. | Validate student ∈ family; set `method` server-side for web grants. |
| S19 | Billing writes for staff | `billing/billing.service.ts` `assertGuardianInFamily` (no staff bypass) vs `@Roles(GUARDIAN, ADMIN, SUPER_ADMIN)` on the routes | ADMIN/SUPER_ADMIN pass the role guard and then always get 403 unless they are a member of the family. The role list and the service disagree. | Decide: either allow staff (and audit it) or remove ADMIN/SUPER_ADMIN from the decorators so the contract is honest. The web has no admin screen calling these today. |
| S20 | Guardian verification (CR-01) | `families/families.service.ts:54` | Found in the UI audit (`apps/web/docs/audit.md`). Creating a family sets the primary guardian's `verifiedAt` immediately, so the emailed-code verification (`/consent/families/:id/verify/*`) is never required and the onboarding step shows "done" at once. Verifiable parental consent for under-13s is therefore not established. | Create the membership with `verifiedAt: null` and set it only from the verification confirm step (the web onboarding already has that step). |

---

## 3. 🔴 P0 — Broken endpoints (open)

| # | Endpoint | Evidence | Symptom | Fix |
| :--- | :--- | :--- | :--- | :--- |
| B2 | `PATCH /teachers/me/profile` | `teachers/teachers.controller.ts:50`; `teachers.service.ts:416` | The 400 is gone (`@IsObject`), but approval still applies only `bio, photoUrl, introVideoUrl, recitationSampleUrl, qualifications`; any other key is stored and **silently dropped on approval**. No nested validation. | Support `languages`, `subjects`, `ageGroups`; reject unknown keys with 400 instead of dropping them. |
| B8 | `POST /teachers/applications/:id/steps` (approve) | `teachers/teachers.service.ts:182-203` | Unchanged. Step + application status are written before `completeApproval` throws 409, so a refused approval still reads APPROVED; step order not enforced (Swagger says "cannot be skipped"). | Wrap in a transaction; validate step order. |
| B10 | `POST /teacher-changes/:id/resolve` | `admissions/admissions.controller.ts:75-77`; `admissions.service.ts:375-395` | Unchanged. Body is only `{status}` (zod-strict, so `newTeacherId` is rejected); nothing is reassigned. | Accept `newTeacherId`; move the enrolment and future classes. |
| B11 | `GET /scheduling/open-slots` | `scheduling/scheduling.service.ts:205-261,304`; `scheduling.controller.ts:141-162` | Course→subject matching added. Still: `if (slots.length >= limit) return slots` returns **unsorted, in teacher order**; no `teacherId` query param (the service accepts `teacherIds` but the controller never passes it). Web sorts client-side. | Sort before limiting; expose `teacherId`. |
| B14 | `POST /quality/classes/:classId/rating` | `qa/qa.controller.ts:61`; `qa/qa.service.ts:50-57` | `@Roles(GUARDIAN)` added, but the `classParticipant` check is unchanged, so guardians who did not personally join the call still get 403; class COMPLETED status not checked. | Allow any guardian of an attending student once the class is COMPLETED. |
| B16 | `POST /scheduling/classes/:classId/cancel` (family, on time) | `scheduling.service.ts:446-448` | A family cancellation now never earns a make-up credit, even outside the notice window. FR-SCH-04: "cancel up to a configurable notice period (default 4 hours) and receives a make-up credit; later cancellations are charged." The policy pages (`/refunds`, `/terms`) state the SRS rule. | Restore the make-up credit for on-time family cancellations, or confirm the product change in writing so the web can update the policy copy. |
| B17 | `POST /teachers/applications` `documents` | `teachers/teachers.controller.ts:36-40` | `documents` is a map `{ ID?, CERTIFICATE?, REFERENCE?, BACKGROUND_CHECK? }` but its keys are not validated; an unknown key reaches Prisma and will 500. (`docs/FRONTEND-DIRECTION.md` describes it as an array of `{type,key}`.) | Validate keys against `ApplicationDocumentType` (400 on unknown). |
| B19 | `GET /notifications?page=&limit=` | `notifications/notifications.controller.ts:47`; `notifications.service.ts:389-404` | The controller computes `skip` but calls `listForUser(user.id, params.take)`, which never skips, while `meta.total` counts every row — so page 2 returns the same rows as page 1. *Web workaround:* the inbox loads the newest 100 (the `MAX_LIMIT`) and shows "Latest 100 of N" with no pager. | Pass `skip` through to `findMany`. Optionally also select `failureReason` so support can see why a WhatsApp/email failed. |
| B18 | `GET /scheduling/open-slots?courseId=` | `scheduling.service.ts:205-214` | A non-UUID `courseId` reaches Prisma (likely 500); an unknown UUID returns 404. | `@IsUUID()` on `courseId` → 400. |
| B20 | Password-reset email | `notifications/notifications.service.ts:91`; `auth/auth.service.ts:450` | Found in the UI audit (`apps/web/docs/audit.md`). The template renders `d.code` but `forgotPassword` sends `{ token }`, so the code is empty; the email has no `/reset-password?token=` link at all. (Delivery is also off in dev — Q21.) The reset page itself works when given a valid token. | Send `{ token, resetUrl: `${WEB_URL}/reset-password?token=…` }` and render the link. |
| B21 | Mistakes for a **trial** student: `POST /classes/:classId/mistakes` and `GET /students/:id/mistakes` | `lessons/mistakes.service.ts:51` (`assertStudentAccess(…, 'teacher')`); `common/services/policy.service.ts:135-146` (`teacherOwnsStudent`) | Found in the UI audit and reproduced by the team. Ownership requires an enrolment with the teacher; a booked trial creates none, so in a trial class the teacher **cannot save any mistake** (403 `NOT_RESOURCE_OWNER`, shown as "You do not have permission") and gets 403 reading the student's mistakes. Reproduced with `teacher@hifzoon.test` on trial class `01a149dd-…` (student with 0 enrolments). *Web interim:* the classroom explains the cause instead of a generic permission error. | Also allow a teacher who teaches a class the student is on (`ClassStudent` + `class.teacherId`), for both marking and reading. |
| B22 | `POST /billing/subscribe` | `billing/billing.service.ts:91-140`; `billing.controller.ts:172-182` | Found in the UI audit (`apps/web/docs/audit.md`). Subscribing never issues an invoice (`invoiceSubscription` is reachable only from the admin endpoint), so the family sees "Outstanding $0" and has nothing to pay until staff invoice manually. | Issue the first invoice on subscribe (and on each billing period), or document it as an admin step. |
| B23 | Notifications: quiet hours inverted — **nothing is delivered** | `notifications/notifications.service.ts:185-201`, `:410-416` | Found in the UI audit (`apps/web/docs/audit.md`). `if (!isWithinQuietHours(...))` marks a notification SKIPPED ("Within quiet hours") whenever the user is **outside** quiet hours. `isWithinQuietHours` returns `false` for users with no quiet hours and for safety-critical templates, so every notification — including safeguarding alerts — is skipped. All rows in the audit DB were SKIPPED. | Drop the `!`; add a test for: no preferences, inside/outside window, safety-critical. |
| B24 | `POST /trials/:classId/outcome` | `admissions/admissions.service.ts:247-283` | Found in the UI audit (`apps/web/docs/audit.md`). An outcome can be recorded for a class that has not happened yet (no `startsAt`/status check) — the audit marked a future trial COMPLETED — and the update flips **every** TRIAL enrolment of the student, not just the one for this class's course. | Reject when `startsAt > now` or the class is cancelled; scope the enrolment update to the class's course/enrolment. |
| B25 | Family cannot join a **trial** class | `classroom/classroom.service.ts:184-190`, `:200` | A guardian gets `GUARDIAN_VIEWER` only if a child of theirs has an **enrolment** with the class's teacher; a booked trial creates none, so the parent's "Join to watch" ends in 403 "You are not enrolled in this class". Children usually have no account of their own (Kids PIN, M2), so in practice **no one from the family can enter a trial class**. Same root cause as B21; also note S12 (the check is too broad for enrolled families). | Grant `GUARDIAN_VIEWER` when a child of the guardian is on the class (`ClassStudent`), and drop the teacher-enrolment test (fixes S12 too). |
| B26 | 🚨 `POST /scheduling/book` accepts a teacher who does not teach the course | `scheduling/scheduling.service.ts` (`book`) | Reproduced 2026-10-17 against the running API (`apps/web/docs/audit.md` §12). Booking a TRIAL for Maryam with **Ustadh Farooq (subjects QAIDA, NAZRA) for HIFZ** returned **201**. The web only offers a course's teachers, but the API is the guard. (Unapproved teachers are correctly refused — FR-TCH-02.) | Reject when the course code is not in `teacher.subjects` (400 `VALIDATION_FAILED`, field `teacherId`), or document an explicit "any teacher may run a trial" rule. |
| B27 | 🚨 `POST /scheduling/book` accepts a time outside the teacher's availability | `scheduling/scheduling.service.ts` (`book`) | Reproduced 2026-10-17 against the running API (`apps/web/docs/audit.md` §12). A TRIAL at **03:00 UTC** with Ustadh Bilal (available 16:00–20:00 Europe/London, Mon–Fri) returned **201**. Only double-booking is checked. Any client can put classes into a teacher's night. | Verify the slot lies inside an `availabilitySlot` window in the teacher's zone (same logic as `findOpenSlots`), else 409 `SLOT_UNAVAILABLE`. |
| B28 | 🚨 **Root cause: a booked trial creates no enrolment** | `scheduling/scheduling.service.ts` (`book`, `type: TRIAL`); `common/services/policy.service.ts:135-146`; `classroom/classroom.service.ts:184-190` | Every ownership check keys off `Enrolment(teacherId)`, but a trial only creates `ClassSession` + `ClassStudent`. Consequences, all reproduced: the trial teacher can't save or read mistakes (B21, 403), the trial child's parent can't enter the class (B25, 403), the trial student is missing from the teacher's Students list, and a later parent-side enrolment is created **without a teacher** (Rehman: ARABIC, teacher null). | Either (a) create a `TRIAL` enrolment with the class's teacher and course when a trial is booked (recommended — fixes B21, B25 and the Students list at once), or (b) make every check also accept `ClassStudent` membership of a class taught by the caller. Also: when a family enrols after a trial, carry the trial's teacher onto the enrolment. |

---

## 4. 🟡 P1 — Missing endpoints & fields (open)

### 4.1 Identity & profile
| # | Need | Why / current workaround |
| :--- | :--- | :--- |
| M1 | `GET /teachers/me` (or `teacherProfileId` on `/auth/me`) | The web can only read the profile id from `GET /teachers/public/:userId`, which 404s until the teacher is APPROVED and `readyToMatch`, so a newly hired teacher can't use timetable/availability. |
| M2 | `POST /auth/kids/login` + guardian set/reset child PIN | FR-AUTH-06 (§7.1). `KidsCredential` exists (`prisma/schema.prisma:624`) with no routes. **The web has removed its placeholder PIN screen** (it signed in with hard-coded demo credentials) and shows "not available yet". |
| M5 | Logout without a valid access token | `auth/auth.controller.ts:110-121` still requires `@CurrentUser`. An expired access token 401s and the refresh cookie survives. Allow logout via the refresh cookie. |
| M6 | Field-level validation errors | Zod routes return `details:[{path,message}]` (`common/pipes/zod-validation.pipe.ts:20,28-33`); class-validator DTO routes still collapse to "Request validation failed" with no details (`common/filters/all-exceptions.filter.ts:98`; no `exceptionFactory` in `main.ts:77-83`). Return `details:[{ field, messages }]` for both. |
| M37 | Student OTP login `POST /auth/student/otp-verify` | Not started (§7.1). |
| M38 | OAuth for 2FA-enabled accounts | `oauth.service.ts:196` always refuses `TWO_FACTOR_REQUIRED`; there is no OAuth + TOTP step, so staff can never use Google/Apple. Either add a `twoFactorCode` step to the callback or document that staff use password sign-in only (the web currently says so). |
| M39 | List / unlink linked OAuth identities | No `GET /auth/oauth/accounts` or unlink route, so Account security can offer "Link Google/Apple" but cannot show what is linked or remove it. |
| M42 | Enforce staff 2FA enrolment (FR-AUTH-01) | Found in the UI audit (`apps/web/docs/audit.md`). Every staff account signs in with a password only: `auth/auth.service.ts:172-187` asks for a code only `if (user.twoFactorEnabled)`; OAuth has the same gap (`auth/oauth/oauth.service.ts:190-194`). *Web interim:* portals show a "2FA is required — Set up 2FA" banner for unenrolled staff. Requested: a restricted session (2FA set-up only) or `TWO_FACTOR_ENROLMENT_REQUIRED` for unenrolled staff. |

### 4.2 Students, families, consent
| # | Need | Why / current workaround |
| :--- | :--- | :--- |
| M7 | Student self-access | STUDENT may call `GET /courses/enrolments/list` (`courses.controller.ts:100`) but falls into the family branch (`courses.service.ts:221`) and gets `[]`. No "my student record" endpoint; reminders go to guardians only. |
| M8 | Student `notes` and per-child Mushaf layout | `families/families.service.ts:278-288` list select has no `notes` (only PATCH returns it). No layout field. |
| M9 | Current consent policy version endpoint | UI sends a hard-coded version. |
| M10 | Booking consent rule | `scheduling.service.ts:335-345` still requires DATA_COLLECTION for every age, not only under-13s (CR-01). Confirm the intended rule. |
| M11 | Privacy summary excludes deleted children; verification email uses family name | `consent/consent.service.ts:340` (`familyName: input.familyId`), `:405` (no `deletedAt` filter). |
| M12 | `GET /families` → `verified` flag | Only the caller's own `members[].verifiedAt` (`families.service.ts:76`). Derive `verified` from the primary guardian. |

### 4.3 Scheduling, classroom, lessons
| # | Need | Why / current workaround |
| :--- | :--- | :--- |
| M13 | Timetable rows: `teacherId`, `courseName`; keep cancelled classes | Teacher timetable has `course.name` but drops cancelled classes (`scheduling.service.ts:898,907`); family timetable has neither `teacherId` nor course (`:940-947`). |
| M14 | Availability in a chosen time zone + DST warnings | No zone parameter on PUT availability. |
| M15 | Teacher-change request carries `enrolmentId`; guardian can list own requests | `admissions.service.ts:357` picks the enrolment; `GET teacher-changes` is admin-only (`admissions.controller.ts:156`). |
| M16 | Real video: keep the provider media token | `classroom/classroom.service.ts:158-163` returns only `url`/`expiresAt`. |
| M17 | REST attendance join; REST controls broadcast to the socket room; layout socket event; recording status in snapshot; honour `overrideReason` | `classroom.service.ts:697`; `classroom.gateway.ts:169-320`. |
| M18 | Per-class mistakes include `source`, `confirmed`, `dismissedAt` | `lessons/mistakes.service.ts:149-166` (`listForStudent` already has them at `:132-134`). |
| M19 | AI summary draft generation | Only PATCH/approve on `ai-draft` (`lessons.controller.ts:250,265`). |
| M20 | Teachers see own unshared lesson cards; supervisor pre-lock edits logged; prefill/mark for SUPERVISOR/ADMIN as decorated | `lesson-cards.service.ts:270-300`. |
| M21 | Brief includes class `status` | Selected but not returned (`teachers/teachers.service.ts:456` vs `:520-524`). |

### 4.4 Admin, QA, safeguarding, finance
| # | Need | Why / current workaround |
| :--- | :--- | :--- |
| M22 | Admin list endpoints: invoices, subscriptions, payments, payroll periods, trial classes | Billing/payroll tools take pasted IDs; payroll periods read from the audit log. |
| M23 | Teacher reviews list for teachers; QA rubric list; QA samples list | Teachers can now reply (B4) but cannot list their reviews. |
| M24 | Staff directory (CRM owner / task / case assignee pickers) | Admin search is SUPER_ADMIN-only. |
| M25 | CRM: `GET /admin/crm/leads/:id`, edit lead, reassign owner; trial outcome moves the lead; auto-create leads from trials & enquiries (FR-OPS-01) | `crm.controller.ts:82-136` unchanged. |
| M26 | Public lead intake `POST /leads` and public trial request `POST /trials/public` | §7.2–7.3. `FRONTEND-DIRECTION.md` confirms anonymous trial booking is not allowed; the web books for signed-in guardians and needs the lead route for the public CTA. |
| M27 | Teacher profile id from an application; staged profile-changes GET; user roles in admin search | Roles PATCH replaces roles blind. |
| M28 | Cases: `severity`; forward-only state machine; `overdueOnly=false` coerced to true | `qa/cases.service.ts:232-242`; `qa.controller.ts:46` (`z.coerce.boolean()` turns `"false"` into `true`). |
| M29 | Billing: `familyBilling` returns payments + family currency; idempotent subscribe blocking duplicate live subscriptions; expose `DiscountRule` | `billing.service.ts:91-135,749`; `prisma/schema.prisma:1731`. |
| M30 | Payroll: currency on payslips/report, line detail, real `deductionsMinor` | Unchanged. |
| M31 | FAQ moderation: pending-queue endpoint and an `answer` field | `cms.service.ts:199` defaults `answer:''`. |
| M32 | Messaging: `studentName` on guardian threads, unread count, don't mark read on every GET, cursor beyond 200 | `messaging.service.ts:190-199,268-273`. |
| M34 | Audio & document uploads | The apply DTO accepts `recitationAudioKey` and `documents` keys, and `StorageService.upload` + presigned **GET** exist (`storage/storage.service.ts:44,70`), but there is **no upload or presigned-PUT route**. Interim web behaviour: a recorded/uploaded audition is sent inline as a data URL in `recitationAudioKey` (capped at ~1.4 MB to fit the 2 MB body limit); documents cannot be attached. Requested: `POST /uploads/presign { kind: 'RECITATION_AUDIO' \| 'APPLICATION_DOCUMENT', contentType, size }` → `{ key, url, fields?, expiresAt }` (public, rate-limited, audio/webm·mp3·wav·m4a ≤ 25 MB, PDF/JPG/PNG ≤ 10 MB). MinIO is now available in docker (`bb17578`). |
| M35 | Hifz tracker, AI coach, engagement (streaks/badges), certificate verification | FR-HFZ-*, FR-AIC-*, FR-ENG-*, FR-CRS-05 — not built. |
| M36 | Payment & video providers | Webhook plumbing is real (`webhooks/webhooks.service.ts:56-94`); only WhatsApp Cloud is a real adapter. Video and payment are still fakes and `${successUrl}?session=fake` still breaks a `successUrl` with a query string (`integrations/fakes.ts:84`). |
| M40 | Notification producers | Found in the UI audit (`apps/web/docs/audit.md`). No notification is enqueued for a new message (`parent-portal/messaging.service.ts:136`), a family cancel/reschedule (`scheduling.service.ts:399,512`), a booked trial or a teacher change, although `TEMPLATE.CLASS_RESCHEDULED`, `TRIAL_BOOKED` and `TEACHER_CHANGE` exist (`notifications/notifications.service.ts:14,16,19`); `CLASS_CANCELLED` is sent only on enrolment pause/cancel (`courses.service.ts:333`). |
| M41 | Examiner workspace (assessments) | Found in the UI audit (`apps/web/docs/audit.md`). `Role.EXAMINER` is used only by two read-only Mushaf endpoints (`mushaf.controller.ts:61,85`); the `Assessment` model has `examinerId` (`prisma/schema.prisma:1017`) but there are no assessment endpoints (tracker CRS-BE-03/04 TODO). *Web interim:* examiners see only the overview with "No assessments assigned yet". Requested: list assigned assessments, record a result. |
| M43 | Class rating eligibility | Found in the UI audit (`apps/web/docs/audit.md`). The web cannot tell which completed classes a guardian may rate (B14), so "Rate class" is offered and then refused with 403. Requested: a `canRate` flag on family timetable rows (or fix B14). |
| M44 | Licensed Quran text provider (CR-11) | `QURAN_CONTENT_PROVIDER` accepts `fake` or `quran_foundation` (`config/env.schema.ts:82`), but **only the fake adapter exists** (`integrations/fakes.ts:153`, `isLicensed() → false`; selecting another adapter → 501 via `integrations/provider-selection.ts`). The classroom therefore shows "Quran text is not licensed in this environment" with ayah positions only. (`progress.md`'s note about a dev `quran-data.ts` dataset is not in the repo.) Requested: implement the `quran_foundation` adapter (Quran Foundation / Quran.com Content API: page → line → word for the 604-page Madani layout, Uthmani text, tajweed) behind the existing `QuranContentProvider` interface, keep word indexes stable for mistake positions, cache pages, and set `QURAN_CONTENT_API_KEY`. The web needs no change: it renders text as soon as the API returns `licensed: true`. |

---

## 5. 🟢 P2 — Contract & quality (open)

| # | Item |
| :--- | :--- |
| Q1 | `@Idempotent()` is never enforced (`common/decorators/index.ts:25`); only checkout reads `Idempotency-Key` (`billing.controller.ts:96`). |
| Q2 | CMS save/archive and FAQ moderation write two audit rows each (`@Audit` decorator + `audit.record`, e.g. `admissions.controller.ts:225,246` with `cms.service.ts:170,214`); `DELETE /mushaf/cache` is not audited (`mushaf.controller.ts:99-110`). |
| Q3 | Settings `setMany` is not transactional (`settings.service.ts:169-176`). |
| Q4 | `skippedConflicts` counts conflicts across all schedules (`scheduling.service.ts:711`). |
| Q5 | Lists capped without pagination: teacher changes (100), applications (200) (`admissions.service.ts:212,424`; `teachers.service.ts:132`). |
| Q6 | Refresh cookie path hard-coded to `/api/v1/auth` (`auth/auth-cookie.ts:17`) — derive from `API_PREFIX`. |
| Q7 | `two-factor/setup` for non-staff returns 201 `{required:false}` — return an explicit error code. |
| Q9 | Seed: PKR price 19000 minor units (Rs 190) should be 1900000; align USD, GBP, CAD, AUD, AED, PKR. *(Not re-verified — seeds unchanged in this pull.)* |
| Q10 | Seed: no multi-role account (FR-AUTH-02 flow check). *(Not re-verified.)* |
| Q11 | Seed: availability stored in Europe/London while the teacher's account zone is UTC. *(Not re-verified.)* |
| Q13 | Supervisor edit before lock is not written to the edit log (`lesson-cards.service.ts:339`). |
| Q14 | Open-slot dates can fall outside the requested range when zones differ (no clamping). |
| Q15 | B7 validators are shallow (`@IsObject`/`@IsArray`). Please validate shapes: `rubric: Record<string, int 0..100>` summing to 100, `objectives: string[]`, `materials: Record<string, string>` (as seeded at `prisma/seed.ts:478,492`). The web enforces these client-side. |
| Q16 | `requireReauth` with neither password nor code returns `UNAUTHENTICATED` (`auth.service.ts:549-552`), the same code as an expired token, which makes clients refresh and retry. Return `VALIDATION_FAILED` or a dedicated `REAUTH_REQUIRED`. Also: `two-factor/confirm` still creates recovery codes if the body carries them (`two-factor.service.ts:76-84`) although setup now stores them — remove the duplicate path. |
| Q18 | `TeacherProfile.publicRatingAvg`, `ratingAvg` and `ratingCount` are only written by the seed (`prisma/seed.ts:366-368`) and never recomputed, yet `GET /teachers/public` sorts by `publicRatingAvg` (`teachers.service.ts:365`) and matching scores use `ratingAvg` (`scheduling.service.ts:840-878`). The web now shows the live `GET /quality/teachers/:id/rating` instead. Please recompute these from `class_review` (e.g. in the rating write path or a nightly job) or drop them. Also: `GET /teachers/public` is capped at `take: 100` with no pagination (`teachers.service.ts:340-367`). |
| Q17 | `POST /webhooks/whatsapp` has no `GET` handler for Meta's `hub.challenge` subscription verification, so the webhook cannot be registered with Meta. |
| Q19 | `POST /auth/refresh` with no cookie returns **401** (`INVALID_REFRESH_TOKEN`), so every anonymous page load logs a red 401 in the browser console. Return `204` / `{ data: null }` for "no session" and keep 401/403 for a bad or revoked token. |
| Q20 | Policy pages have no published CMS content: `GET /content/privacy-policy|terms-of-service|refund-policy|child-safety-policy?locale=en` → 404, so the site shows its built-in drafts marked for legal review. Seed or publish the approved copy. |
| Q21 | No working mailer in development: `MAIL_PROVIDER=log` (`apps/api/.env`), the schema only allows `log|resend|ses` (`config/env.schema.ts:80`), and `LogMailer` (`integrations/fakes.ts:125`) does not log the message. MailHog runs in docker but nothing sends to it, so reset / verification emails can't be tested. Add an SMTP adapter (MailHog `:1025`) and make the log mailer print subject + body. |
| Q22 | Password policy is length-only (`auth/dto/auth.dto.ts:14`, `MinLength(12)`): `aaaaaaaaaaaa` is accepted. Decide on a complexity / breached-password rule; the web will mirror it. |
| Q23 | Sessions: two signed-in browsers produced three active rows in `GET /auth/sessions`, and nothing marks the current session. Check refresh rotation for orphaned rows; add `current: true`. |
| Q24 | Seed data: teachers' `subjects` don't include the course codes families book (e.g. QAIDA), so booking falls back to "any teacher"; the seeded teacher's account zone (UTC) differs from their availability zone (Europe/London) — saving availability shifts it by an hour in summer (see Q11). |

---

## 6. Corrections to `docs/FRONTEND-DIRECTION.md` (please update the note)

The web is built against the code. These statements in the hand-off note do not match it:

| Note says | Code does | Evidence |
| :--- | :--- | :--- |
| Errors are `{ "error": { code, message, details }, meta }` | Errors are **flat**: `{ statusCode, code, message, details?, requestId, timestamp }` | `common/filters/all-exceptions.filter.ts:43-50` |
| Retry login "including `code`" | The login field is **`twoFactorCode`** (TOTP or recovery code) | `auth/dto/auth.dto.ts:63` |
| "Disabling 2FA returns the 8 recovery codes once at setup" | Codes are returned by **setup**; disable deletes unused codes | `auth/two-factor.service.ts:29-48,93-101` |
| Application `documents` is "an array of `{ type, key }`" | It is a **map** `{ ID?, CERTIFICATE?, REFERENCE?, BACKGROUND_CHECK? }` of storage keys | `teachers/teachers.controller.ts:36-40` |
| Cancelling as family "charges the session (no makeup credit)" | Charged **only inside the notice window**; never a make-up credit (see B16) | `scheduling.service.ts:446-467` |
| Guardian rating "is guardian-scoped" | Also requires the guardian to have **personally joined** the call (B14) | `qa/qa.service.ts:50-57` |
| "Draft lesson cards are hidden from non-staff reads" | `get()` still returns unshared cards to guardians (S13) | `lessons/lesson-cards.service.ts:468-543` |
| OAuth callback accepts an access token to link | Linking is decided at **`/start`** from the access token; the callback ignores it | `auth/oauth/oauth.service.ts:122-129` |

Also the note's section headings number §3 twice.

---

## 7. Feature requests (carried)

### 7.1 Kids Mode PIN login & Student OTP — `POST /auth/kids/login` & `POST /auth/student/otp-verify`
- **PIN login:** `{ familyId, studentId, pin, deviceId }` → argon2 compare against `KidsCredential.secretHash`, 5 attempts / 15 min lockout, CHILD_STUDENT-scoped token; returns `{ accessToken, expiresIn, student: { id, displayName } }`; no access to billing/consent. Refresh via the same `hifzoon_refresh` cookie.
- **Guardian PIN management:** `PUT /families/:familyId/students/:studentId/kids-pin { pin }` and `DELETE` to revoke.
- **Student OTP:** `{ otpCode, studentId }` → verifies a temporary 6-digit parent-generated class pass.

### 7.2 Public trial request — `POST /trials/public`
`parentName, parentEmail, studentName, studentAge, courseType, preferredSlot, timeZone` → CRM lead + provisional family. Removes the sign-up step from `/book-trial`.

### 7.3 Public lead intake — `POST /leads`
Unauthenticated enquiry/callback form → CRM lead (`source`, contact, child age, course interest), rate-limited.

### 7.4 Teacher public media
`GET /teachers/public/:userId` returns `introVideoUrl` but no `recitationSampleUrl`/`audioSampleUrl`, and the list omits both. Please include `recitationSampleUrl` on list and detail so the directory's play button works for live teachers.

### 7.5 Recitation & document upload
See M34 for the requested contract.

### 7.6 OAuth deployment configuration (ops — not code)
For Google/Apple to work in each environment:
- Register these redirect URIs with each provider: `<web-origin>/auth/oauth/google` and `<web-origin>/auth/oauth/apple` (e.g. `http://localhost:3000/auth/oauth/google`). They are Next route handlers in `apps/web`; Apple's `form_post` callback is received there.
- The web origin must be in the API's `CORS_ORIGINS` (cookie refresh **and** the OAuth redirect allow-list use it, `oauth.service.ts:453-471`).
- Provider credentials in the API env; `GET /auth/oauth/providers` reports `configured:false` until set, and the web hides that button.
