# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 2.0.0
**Updated:** 2026-10-15
**Author:** Frontend Engineering Team
**Scope:** Everything the web app (`apps/web`) needs changed or added in `apps/api`. The web team does not modify the backend; every item here was found while wiring the real UI to the live, seeded API (with live integration tests in `apps/web/tests/integration`).

Paths below are relative to `apps/api/src/modules/` unless stated. Line numbers are as of 2026-10-15.

---

## 1. Summary

| Severity | Count | Theme |
| :--- | :---: | :--- |
| 🔴 P0 — Security / data exposure | 17 | Missing role or ownership checks; any signed-in user can read or change other families' data |
| 🔴 P0 — Broken endpoints | 14 | Endpoint always fails or silently does the wrong thing |
| 🟡 P1 — Missing endpoints / fields | 36 | UI has to ask for raw IDs, hide features, or derive data client-side |
| 🟢 P2 — Contract & quality | 14 | Inconsistencies, audit gaps, seed data |

The UI ships with workarounds for every P1 item (noted per row) and **does not hide** P0 security issues — those must be fixed server-side.

---

## 2. 🔴 P0 — Security & data exposure

| # | Endpoint / area | Evidence | Problem | Requested change |
| :--- | :--- | :--- | :--- | :--- |
| S1 | `GET /courses/enrolments/list` | `courses/courses.controller.ts:88`, `courses.service.ts:185` | No `@Roles`, no scoping. Verified live: the guardian and the teacher both received **other families' children** (e.g. "Isla"). | Scope by caller: guardian → own family's students; teacher → own students; staff → all. |
| S2 | Billing writes: `POST /billing/subscribe`, `/subscriptions/:id/cancel\|pause\|resume`, `/checkout` | `billing/billing.controller.ts:65`; `billing.service.ts:76,182,215,250,352` | No `@Roles` and no family-membership check. Verified live: the **teacher** account reached the cancel path of a family's subscription (got 409 "already cancelled", not 403). | Require GUARDIAN (or staff) and assert the caller is a member of the subscription's family. |
| S3 | `GET /students/:studentId/mistakes` | `lessons/lessons.controller.ts:128` | No roles, no ownership — any user can read any child's mistake history. | Guardian of the student, the student, their teacher, or staff only. |
| S4 | `GET /parent/students/:studentId/charts` | `parent-portal/parent-portal.controller.ts:56` | No ownership check (dashboard and report card have one). | Same check as the dashboard. |
| S5 | `GET /scheduling/families/:familyId/timetable`, `GET /scheduling/teachers/:teacherId/timetable`, `GET .../availability`, `GET /scheduling/schedules/:id` | `scheduling/scheduling.controller.ts:104,228,250,261` | Readable by any signed-in user. | Family timetable → family members + staff; teacher timetable/schedules → that teacher + staff. |
| S6 | `PUT /scheduling/teachers/:teacherId/availability` | `scheduling.controller.ts:94` | A teacher can overwrite **another** teacher's availability. | Teacher may only set their own. |
| S7 | `POST /scheduling/classes/:classId/cancel` | `scheduling.controller.ts:64-66,171` | No role check; the **client chooses `by` and `noticeHours`**, so a guardian can avoid the late-cancel charge. Late family cancellations also create make-up credits (`scheduling.service.ts:399`). | Derive `by` from the caller's role and compute notice server-side; enforce ownership. |
| S8 | `POST /scheduling/classes/:classId/reschedule` | `scheduling.service.ts:454` | No check that the class belongs to the caller; no notice window. | Ownership + 4-hour rule (as cancel). |
| S9 | `PATCH /courses/enrolments/:id/lesson-position` | `courses.controller.ts:118` | Any teacher can move any student's position. | Only the enrolment's teacher (or staff). |
| S10 | `PATCH /courses/enrolments/:id/status` | `courses.service.ts:248` | A guardian can set ACTIVE/TRIAL (only COMPLETED is blocked). | Guardians: PAUSED/ACTIVE (resume)/CANCELLED only. |
| S11 | Classroom: `GET /classroom/classes/:id/state`; teacher controls `page/highlight/layout/tajweed` | `classroom/classroom.controller.ts:67,107-145` | State readable by anyone; controls check only the TEACHER role, not that it is **this class's** teacher. | Participant check for state; class-teacher check for controls. |
| S12 | Guardian viewer token | `classroom/classroom.service.ts:184` | A guardian gets `GUARDIAN_VIEWER` for **any** class taught by their child's teacher. | Only classes their own child attends. |
| S13 | Lesson cards for guardians | `lessons/lesson-cards.service.ts:451-520` | A guardian can open an **unshared** card by id; the recording `storageKey` is returned to guardians. | Enforce `shared` for guardians; drop `storageKey` from guardian responses. |
| S14 | Messaging safeguarding | `parent-portal/messaging.service.ts:104,136-178` | With no `studentId` a guardian can open a thread with **any** teacher. No server-side moderation / contact-detail filtering (only the web composer filters). | Require a student whose enrolment has that teacher; add server-side contact-detail filter + moderation flagging. |
| S15 | Consent / data requests | `consent/consent.controller.ts:49` | `studentId` on a data request is not checked against the family; consent `method` is whatever the client sends. | Validate student ∈ family; set method server-side for web grants. |
| S16 | Auth — 2FA | `auth/auth.controller.ts:131-157` | `two-factor/setup` ignores `password`; `two-factor/disable` needs no re-auth. | Verify password (argon2) on setup; require password or TOTP on disable. *Interim web mitigation: the account page re-verifies credentials with a throwaway `/auth/login` (credentials omitted, session revoked immediately) before calling setup/disable — remove once the backend checks them.* |
| S17 | Auth — refresh token in JSON body | `auth/auth.service.ts:240,370` | The refresh token is returned in the body **and** the httpOnly cookie, so page JS can read it. | Web clients: cookie only. |

---

## 3. 🔴 P0 — Broken endpoints

| # | Endpoint | Evidence | Symptom | Fix |
| :--- | :--- | :--- | :--- | :--- |
| B1 | `POST /consent/families/:id/verify/start` | `prisma/schema.prisma:794`, `consent/consent.service.ts:324` | **500** — `guardian_verification` model has no migration. Guardian verification cannot work. | Add the migration. |
| B2 | `PATCH /teachers/me/profile` | `teachers/teachers.controller.ts:45-47` | **Always 400** — `ProfileChangeDto.changes` has no validator, so `forbidNonWhitelisted` rejects it. Approval also only applies bio/photo/intro video/recitation/qualifications (`teachers.service.ts:413`). | Add `@IsObject() @ValidateNested()`; support languages/subjects/age groups. |
| B3 | `GET /teachers/public/:userId` | `teachers/teachers.service.ts:317-333` | `void userId` — **always returns the first approved teacher**. | Filter by `userId`. |
| B4 | `POST /qa/reviews/:id/reply` | `qa/qa.controller.ts:119`, `qa/qa.service.ts:225` | **Always 403** — compares a user id with a profile id. | Resolve the caller's teacher profile id. |
| B5 | `GET /admin/console/search` (teachers) | `admin/admin-console.service.ts:116-120` | **Always 400** — filters on non-existent `specialisations`. | Use `subjects`. |
| B6 | `GET /courses/:codeOrId` with a code | `courses/courses.service.ts:73-75` | **500** — code is put into the uuid `id` filter. (Also exposes `teacherNotes` publicly.) | `OR: [{id} if uuid, {code}]`; drop `teacherNotes` from the public select. |
| B7 | `POST /courses/:courseId/levels`, `POST /courses/levels/:levelId/lessons` | `courses/courses.controller.ts:23-35` | `rubric`, `objectives`, `materials` have no validators → 400. Lesson objectives cannot be saved. | Add validators. |
| B8 | `POST /teachers/applications/:id/steps` (approve) | `teachers/teachers.service.ts:181-201` | A **refused** approval still writes APPROVED (step + application status saved before `completeApproval` throws 409). Step order not enforced. | Transaction; validate order. |
| B9 | `POST /teachers/applications` | `teachers/teachers.controller.ts:36`, `teachers.service.ts:48` | DTO `documents` vs service `documentKeys` — documents are dropped. | Map the field. |
| B10 | `POST /teacher-changes/:id/resolve` | `admissions/admissions.service.ts:375` | Only flips status; no new teacher field; nothing is reassigned. | Accept `newTeacherId`, move the enrolment and future classes. |
| B11 | `GET /scheduling/open-slots?courseId=` | `scheduling/scheduling.service.ts:205-214,254` | Returns nothing for newly cleared teachers (only teachers with an existing schedule for the course); results unsorted and truncated by teacher order once `limit` hits. | Match on teacher subjects; sort by time before limiting; add `teacherId` filter. |
| B12 | `PATCH /courses/enrolments/:id/status` → COMPLETED | `courses/courses.service.ts` `updateEnrolmentStatus` | Refused for every role, including staff (comment says staff may). | Allow staff. |
| B13 | Lesson position cap | `courses/courses.service.ts:381` | Capped at the highest **level number**, not the lessons in the level. | Cap by lesson count. |
| B14 | `POST /quality/classes/:classId/rating` | `qa/qa.service.ts:55` | Only guardians who joined the class can rate → almost every guardian gets 403. No role restriction; class completion not checked. | Allow any guardian of an attending student once the class is COMPLETED. |

---

## 4. 🟡 P1 — Missing endpoints & fields

### 4.1 Identity & profile
| # | Need | Why / workaround |
| :--- | :--- | :--- |
| M1 | `GET /teachers/me` (or `teacherProfileId` on `/auth/me`) | Timetable/availability/rating take the **profile** id. Web resolves it from enrolments; a teacher with no students can't use those screens. |
| M2 | `POST /auth/kids/login` + guardian set/reset child PIN | FR-AUTH-06 Kids Mode (see §6.1). |
| M3 | OAuth (Google / Apple) | FR-AUTH-01. Only the `OAuthAccount` table and env vars exist; no routes. Need start/callback (or ID-token exchange) setting the same refresh cookie. |
| M4 | 2FA challenge code | Throw the existing `TWO_FACTOR_REQUIRED` when no code was sent (today `INVALID_TWO_FACTOR_CODE`), so the UI can tell "ask for code" from "wrong code". |
| M5 | Logout without a valid access token | Allow logout via the refresh cookie (expired access token currently 401s and the cookie survives). |
| M6 | Field-level validation errors | `common/filters/all-exceptions.filter.ts` replaces messages with "Request validation failed"; return `details: [{ field, messages }]`. |

### 4.2 Students, families, consent
| # | Need | Why / workaround |
| :--- | :--- | :--- |
| M7 | Student self-access | `assertStudentAccess(…,'self')` is never used (`lessons/lesson-cards.service.ts:529`); no "my student record" endpoint; class reminders go to guardians only. `/student` portal is minimal until this exists. |
| M8 | Student `notes` and per-child Mushaf layout | List/detail never return `notes` (`families/families.service.ts:275`); no per-child layout field. |
| M9 | Current consent policy version endpoint | UI sends a hard-coded version. |
| M10 | Booking consent rule | `scheduling.service.ts:289` requires DATA_COLLECTION for **every** age, not only under-13s (CR-01). Confirm intended rule. |
| M11 | Privacy summary excludes deleted children; verification email uses family name | `consent/consent.service.ts:405,340`. |
| M12 | `GET /families` → `verified` flag | Derive from primary guardian `verifiedAt`. |

### 4.3 Scheduling, classroom, lessons
| # | Need | Why / workaround |
| :--- | :--- | :--- |
| M13 | Timetable rows: `teacherId`, `courseName`; keep cancelled classes | Reschedule matches slots by teacher name; cancelled classes vanish from history (student rows deleted). |
| M14 | Availability in a chosen time zone + DST warnings | Always saved in the account zone (`scheduling.service.ts:67,92`); seeded London slots get rewritten as UTC on save. |
| M15 | Teacher-change request carries `enrolmentId`; guardian can list own requests | Backend picks an arbitrary enrolment (`admissions.service.ts:335`). |
| M16 | Real video: keep the provider media token | Dropped at `classroom/classroom.service.ts:161`; no client can join real video. |
| M17 | REST attendance join; REST controls broadcast to the socket room; layout socket event; recording status in state snapshot; honour `overrideReason` | `classroom.gateway.ts:125,314`, `classroom.service.ts:660`. |
| M18 | Per-class mistakes include `source`, `confirmed`, `dismissedAt` | `lessons/mistakes.service.ts:126`. |
| M19 | AI summary draft generation | Only save/approve exist. |
| M20 | Teachers see their own unshared lesson cards; supervisors pre-lock edits logged; prefill/mark allowed for SUPERVISOR/ADMIN as decorated | `lesson-cards.service.ts:335,533`; `lessons.controller.ts:167`. |
| M21 | Brief includes class `status` | `teachers/teachers.service.ts:518`. |

### 4.4 Admin, QA, safeguarding, finance
| # | Need | Why / workaround |
| :--- | :--- | :--- |
| M22 | Admin list endpoints: invoices, subscriptions, payments, payroll periods, trial classes | Billing/payroll tools take pasted IDs; payroll periods are read from the audit log. |
| M23 | Teacher reviews list for teachers; QA rubric list; QA samples list | Teachers cannot see reviews to reply; review form mirrors the seeded rubric. |
| M24 | Staff directory (for CRM owner / task assignee / case assignee pickers) | Admin search is SUPER_ADMIN-only; UI offers "me" / known people / pasted id. |
| M25 | CRM: `GET /admin/crm/leads/:id`, edit lead, reassign owner; trial outcome moves the linked lead; auto-create leads from trials & enquiries (FR-OPS-01) | Only status changes exist. |
| M26 | Public lead intake `POST /leads` and public trial request `POST /trials/public` | §6.2–6.3. |
| M27 | Teacher profile id from an application; staged profile changes GET; user roles in admin search results | Roles PATCH currently replaces roles blind. |
| M28 | Cases: `severity` field; forward-only state machine (`cases.service.ts:238` allows ACTIONED→INVESTIGATING and same-state); `overdueOnly=false` coerced to true (`qa.controller.ts:47`) | |
| M29 | Billing: `familyBilling` returns payments + family currency (`billing.service.ts:689-711`); subscribe idempotent + blocks duplicate live subscriptions (`billing.service.ts:104`); expose `DiscountRule` (sibling / prepay) | Payment history and discounts are hidden in the UI. |
| M30 | Payroll: currency on payslips/report, line detail, real `deductionsMinor` | `billing/payroll.service.ts:213-216`. |
| M31 | FAQ moderation: pending-queue endpoint and an `answer` field | An empty answer can currently be approved (`cms.service.ts`). |
| M32 | Messaging: `studentName` on guardian threads, unread count, do not mark read on every GET (polling), cursor for older than 200 | `messaging.service.ts:190-199,268-273`. |
| M33 | Public teacher rating | `GET /quality/teachers/:id/rating` is not `@Public()` (`qa.controller.ts:79`). |
| M34 | File uploads | Pre-signed upload URL endpoint (teacher application recitation/documents, voice notes). |
| M35 | Hifz tracker, AI coach, engagement (streaks/badges), certificate verification | FR-HFZ-*, FR-AIC-*, FR-ENG-*, FR-CRS-05 — not built. |
| M36 | Payment & video providers | Only fakes. Fake checkout URL breaks when `successUrl` has a query string (`integrations/fakes.ts:84`). |

---

## 5. 🟢 P2 — Contract & quality

| # | Item |
| :--- | :--- |
| Q1 | `@Idempotent()` decorator is never enforced (`common/decorators/index.ts:25`); only checkout checks `Idempotency-Key`. Admin invoices/refunds ignore it. |
| Q2 | CMS save/archive write two audit rows; `DELETE /mushaf/cache` is not audited. |
| Q3 | Settings `setMany` is not transactional; `describe` returns 25 keys vs 23 seeded rows. |
| Q4 | `createRecurringSchedule.skippedConflicts` counts conflicts across all schedules, not the new one. |
| Q5 | Lists capped without pagination: teacher changes (100), applications (200). |
| Q6 | Refresh cookie path hard-coded to `/api/v1/auth` — derive from `API_PREFIX`. |
| Q7 | `two-factor/setup` for non-staff returns 201 `{required:false}` — return an explicit error code. |
| Q8 | Fake Quran provider returns ayah 0 and ayahs past the end of a surah, with empty word lists (`integrations/fakes.ts:171`). |
| Q9 | Seed: PKR price is 19000 minor units (Rs 190) — looks wrong. |
| Q10 | Seed: no multi-role account (flow check FR-AUTH-02 fails). |
| Q11 | Seed: availability stored in Europe/London while the teacher's account zone is UTC. |
| Q12 | Seed: 4–6 vetted teachers including female Ustadhas; `audioSampleUrl`/video on profiles (§6.4). |
| Q13 | Supervisor-edit before lock is not written to the edit log. |
| Q14 | Open-slot dates can fall outside the requested range when time zones differ. |

---

## 6. Feature requests carried from v1.1

### 6.1 Kids Mode PIN login — `POST /auth/kids/login`
`{ familyId, studentId, pin, deviceId }` → argon2 compare against `KidsCredential.secretHash`, 5 attempts / 15 min lockout, CHILD_STUDENT-scoped token, returns `{ accessToken, expiresIn, student: { id, displayName } }`; no access to billing/consent.

### 6.2 Public trial request — `POST /trials/public`
The web now books trials for **signed-in guardians** via `POST /scheduling/book` (type TRIAL). A visitor-level request (`parentName, parentEmail, studentName, studentAge, courseType, preferredSlot, timeZone`) that creates a CRM lead + provisional family would remove the sign-up step.

### 6.3 Public lead intake — `POST /leads`
Unauthenticated enquiry/callback form → CRM lead (`source`, contact, child age, course interest), rate-limited.

### 6.4 Teacher profiles
Seed more cleared teachers (male and female), reachable `photoUrl`, and `audioSampleUrl` / `introVideoUrl` on the public profile. The web no longer invents these values.
