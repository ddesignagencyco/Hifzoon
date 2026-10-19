# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.8.0
**Updated:** 2026-10-19
**Author:** Frontend Engineering Team
**Verified against:** `feat-frontend-ui` after merging `origin/fix/web-team-v4.7` (`7ae92a9`: backend commits `6953c71`, `0e0003a`, `7fd9291`).
**Scope:** Everything the web app (`apps/web`) needs changed or added outside `apps/web`. The web team does not modify `apps/api`, `packages/*` or `docker/*`. The earlier local `docker-compose.yml` workaround for B30 has been replaced by the backend's fix.

Paths are relative to `apps/api/src/modules/` unless stated. Line numbers are as of 2026-10-19.

---

## 0. How to use this document (backend team)

- Every open item has an **ID**, the **evidence** (file:line), the **problem** and the **requested change**. Please reply per ID with `FIXED <commit>`, `WONTFIX <reason>` or `QUESTION`.
- **Only open requests are listed.** Everything marked FIXED in the 4.2.0 reply was checked; the items that work are removed (§1.1 shows how each was verified).
- **Coverage:** the web calls **170 of 174** API routes (`apps/web/docs/api-coverage.md`). The 4 it doesn't call are the provider webhooks (`POST /webhooks/payments`, `POST /webhooks/video`, `GET` + `POST /webhooks/whatsapp`), which are server-to-server.
- **History:** v4.3.0 added B29–B33, S21, M45, Q25, Q26. v4.4.0 added B34, M46, Q27. v4.5.0 records the local environment check and the compose change (§7). v4.6.0 adds the classroom-flow review (B35–B37, M47–M50) and production without seed data (§8: M51–M53). v4.7.0 adds M54, M55 and the cross-role workflow audit (§9: B38, M56–M68). v4.8.0 verifies the `fix/web-team-v4.7` branch (§1.2) and removes the 14 fixed defects.

---

## 1. Summary

| Group | Open | Items |
| :--- | :---: | :--- |
| 🔴 Open defects | 0 | All fixed and verified 2026-10-19 (§1.2) |
| ❓ Questions to answer | 2 | Q9 price periods, M26 public intake |
| 🟡 New requests / no reply yet | 20 | **M48** (a child can't join a class), **M54** (admins can't see pending teacher profile changes), M55, M69, M47, M49, M50, M45, M46, M9, M14, M16, M17, M19, M20, M28, M29, M32, Q13, Q15 |
| 🧭 Workflow audit (§9) | 13 | **M56** (no way for families/teachers to report a concern), M57–M68 |
| 🏗 Production without seed data (§8) | 3 | M51 first super admin, M52 plan management, M53 seed split |
| ⏸ Deferred by backend (WONTFIX this round) | 26 | M2, M22–M27, M30, M31, M35–M39, M41, M44, Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23 |

### 1.1 Verification of the 4.2.0 reply

Run on 2026-10-18 against the rebuilt API (docker, migration + `npm run db:seed`) with **28 live checks**; staff 2FA was enrolled for the run and disabled afterwards. **27 passed**; the failure is B29.

| Verified live (API call) | Verified in code |
| :--- | :--- |
| S12 other-family guardian → 403 · B25 own guardian joins trial → 201 `GUARDIAN_VIEWER` · B28 booked trial creates an enrolment · B21 trial teacher saves & reads mistakes (another teacher still 403) · B26 wrong-course teacher → 400 · B27 outside availability → 409 `SLOT_UNAVAILABLE` · B11 `teacherId` filter + sorted · B18 bad `courseId` → 400 · S7 legacy `by` → 400, `{reason}` → 200 · S8 reschedule inside notice → 400 · M42 unenrolled staff → 403 `TWO_FACTOR_ENROLMENT_REQUIRED`, `/auth/me` still 200 · M1 `GET /teachers/me` · M43 `canRate/rated/course/teacherId` · M18 · M6 shape · Q19 → 204 · §7.4 `recitationSampleUrl` · M34 presign · M12 `verified` · B19 paging | B23 quiet hours (`notifications.service.ts:215-227`) · S20 `verifiedAt: null` (`families.service.ts:60`) · S13 (`lesson-cards.service.ts:540-545`) · S14 (`messaging.service.ts:105`) · B24 (`admissions.service.ts:258-265`) · B14 (`qa.service.ts:56`) · B22 `firstInvoice` (`billing.service.ts:202,217`) · M15 guardian list (`admissions.controller.ts:167`) · M7 student's own enrolments (`courses.service.ts:247`) |

### 1.2 Verification of `fix/web-team-v4.7` (2026-10-19)

Merged into `feat-frontend-ui` (`7ae92a9`), migration `20261019000000_class_student_active` applied, API and worker rebuilt. **17 live checks, all passed**, plus code checks for B34, B36 and B39.

| ID | Check | Result |
| :--- | :--- | :--- |
| B30 | Presigned upload link is signed for `http://localhost:9000` (`STORAGE_PUBLIC_ENDPOINT`); a browser-style PUT succeeds | ✅ |
| Q26 | A PUT larger than the presigned size → 403; `audio/x-wav` keys end in `.wav` | ✅ |
| B32 | Application with an unknown upload key → 400 `"recitationAudioKey" is not a valid upload key` | ✅ |
| B31 | `GET /teachers/applications/:id` returns `recitationAudioDownloadUrl` and per-document `downloadUrl` | ✅ |
| Q25 | Validation `details` name the real fields (`studentId, startsAt, durationMinutes, roomType, type`) | ✅ |
| B29 | A cancelled class keeps its `class_student` row and appears (CANCELLED_FAMILY) in the family timetable | ✅ |
| B38 | ✅ FIXED (verified 2026-10-19) — Cancelling queues `class.cancelled` notifications | ✅ |
| B35 | `bookedClasses` = classes already started this month (9 = 9) | ✅ |
| B39 | `classroom:close-classes` runs every 5 min (`worker/schedules.ts`); no finished class left SCHEDULED/LIVE | ✅ |
| B37 | Finished classes without attendance close as `NO_SHOW_*`, not COMPLETED | ✅ |
| S21 | `javascript:` profile link → 400 | ✅ |
| B33 | `null` list field and non-ISO language → 400 | ✅ |
| B36 | Class promoted to LIVE once started (`classroom.service.ts:274-301`, worker sweep) | ✅ (code) |
| B34 | One reminder producer; templates with missing fields refuse to send (`notifications.service.ts:148-162`) | ✅ (code) |

**Web follow-ups done in the same change:** admins play/download application files via the signed links (B31); profile links require `https` on a production build, matching the API (S21); the teacher timetable now receives cancelled classes (B29) and leaves them out of its class count and teaching time.

**Local setup notes from this merge:**
- MinIO now uses `bitnamilegacy/minio`, which runs as UID 1001. An existing `miniodata` volume created by the old image must be re-owned once: `docker run --rm -v hifzoon_miniodata:/data alpine chown -R 1001:1001 /data`.
- After pulling, run `npm install` (the API needs `nodemailer` from the SMTP change) and rebuild the API/worker images or refresh their `node_modules` volumes (`docker compose build api worker && docker compose up -d --renew-anon-volumes api worker`), and `npm run db:generate` for the new `class_student.active` field.

---

## 2. 🔴 Open defects

None open. All 13 defects listed in v4.7.0 (plus B38 from §9) were fixed on `fix/web-team-v4.7` and verified on 2026-10-19 — see §1.2.

---

## 3. ❓ Questions to answer

| # | Question |
| :--- | :--- |
| Q9 | You flagged that USD `4900` reads as a monthly price while PKR `1900000` reads as an annual one. **Product to confirm the price list per currency and period.** The web shows whatever `GET /billing/plans` returns (`formatMoney` + `billingPeriod`). |
| M26 / §7.2 / §7.3 | Public `POST /leads` and `POST /trials/public`. Web proposal: rate-limit to 5 per hour per IP and per email, require an hCaptcha/Turnstile token in the body, and create a CRM **lead only**. No provisional family; the family is created when the parent signs up from the emailed link. Please confirm or counter. |

---

## 4. 🟡 New requests

M45 and M46 are new since the 4.2.0 reply (Q27 was resolved by the SMTP mail adapter); the rest were in v4.2.0 and the reply doesn't mention them.

| # | Need | Evidence / current workaround |
| :--- | :--- | :--- |
| M48 | 🚨 A child can never join a class as the student | `classroom/classroom.service.ts:181-203` (role resolution), `:213` | A `STUDENT` participant needs a login linked to the child (`student.userId`). Guardians create children without a login, there is no route to link one, and Kids PIN (M2) is deferred. Guardians only get `GUARDIAN_VIEWER` (watch-only, no camera or mic). So in practice **no student is ever in the class**: attendance shows 0 students and the teacher has nobody to teach. Seen 2026-10-19. *Local demo:* `yusuf@hifzoon.test` was registered and linked to Yusuf by hand in the DB. | Pick one or both: (a) **a guardian joins as the child** — a guardian of a student on the class may request a token with `{ asStudentId }` and receives a `STUDENT` participant for that child (publishing audio/video, attendance counted for the child); (b) a guardian route to create or link a child login (e.g. `POST /families/:id/students/:sid/login` sends an invite), plus M2 for young children. |
| M47 | Teacher view of a student: family and profile | `teachers/*`; `families/families.controller.ts:129` (guardians and staff only) | Teachers see only `student.displayName`/`birthYear` on enrolments. The only family data a teacher can reach is the family **name** on message threads the family opened. *Web:* the teacher's student page shows age, courses and start date, plus the family name with a link to the conversation when a thread exists. | `GET /teachers/me/students/:studentId` (the teacher's own students only): family name, guardian names and relationship (no contact details — contact stays in platform messaging), the student's time zone, language, Mushaf layout and notes, and the consent flags that matter in class (recording, AI). |
| M49 | A student can't list their own upcoming classes | `scheduling/scheduling.controller.ts:289,308` (teacher and family timetables only) | The student portal can show courses (M7) but not classes; join links come only from notifications. *Web:* `/classroom/:id` (the reminder link) takes a student to their classroom. | `GET /scheduling/students/me/timetable?from&to&tz` for `STUDENT` / `CHILD_STUDENT`, with the same row shape as the family timetable. |
| M50 | Mistakes can be logged before the class starts and with no student present | `lessons/mistakes.service.ts:42-58` | The service checks only that the student is on the class. *Web:* the classroom hides the mistake form until the start time and until the student's side (the student, or a guardian device) has joined. | Refuse `POST /classes/:id/mistakes` before `startsAt` and when nobody for that student (or, until M48, their guardian) has joined. Keep staff overrides, audited. |
| M54 | 🚨 Admins can't see teacher profile changes waiting for approval (was part of deferred M27) | `teachers/teachers.service.ts:445-492` (`pendingProfileChanges` written by `PATCH /teachers/me/profile`, read only by `GET /teachers/me` at `:389`) | A teacher's "Submit for approval" stages the change on their profile, but no admin route returns `pendingProfileChanges` and none lists the teachers who have some. The only admin control (Admin → Teachers → an application → "Public profile changes") offers Approve/Reject without showing what changed, and an admin has no way to know a change is waiting. Reported by the product owner on 2026-10-19. | `GET /teachers/profile-changes` (ADMIN, SUPER_ADMIN): teachers with staged changes — `{ profileId, teacherName, submittedAt, changes, current }` (current values of the changed fields, for a before/after view); include `pendingProfileChanges` in the admin teacher/application detail. Optionally notify admins on submission and the teacher on approve/reject. |
| M55 | The classroom state lacks what a meeting screen needs | `classroom/classroom.service.ts` (`GET /classroom/classes/:id/state` snapshot) | The redesigned meeting-style classroom (2026-10-19) has no course or student name to title the class (it says "Live classroom"), no recording status (the REC pill appears only in the teacher's own session after they press record — see also M17), and no per-participant mic/camera state, so other people's tiles show initials. | Add `course { name }`, `students [{ id, displayName }]`, `recording { status, startedAt }` and, per participant, `micOn` / `camOn` (from the video provider or socket events) to the snapshot. |
| M69 | Signed-in password change | `auth/auth.controller.ts:214,227` (only `forgot-password` / `reset-password`) | Account security has no way to change a password while signed in. *Web:* the new Password card emails the account's own reset link (`POST /auth/forgot-password`). In local dev it arrives in MailHog (`http://localhost:8025`) with `MAIL_PROVIDER=smtp`. | `POST /auth/change-password { currentPassword, newPassword }` (re-auth like `REAUTH_REQUIRED`, revoke other sessions, notify by email). |
| M45 | The applicant's audition never becomes the profile's recitation sample | `teachers/teachers.service.ts:74`: the application stores the storage key in `TeacherApplication.recitationAudioUrl`, and it is never copied to `TeacherProfile.recitationSampleUrl`. A new teacher has no public sample unless they paste a URL. Requested: on approval, copy the key and serve it through a signed or public URL (see B30, B31). |
| M46 | Hifz page states can be read but never change | `hifz/hifz.controller.ts` has only `GET …/pages`, `GET …/pages/:n` and `POST …/initialize`. The web shows the 604-page Hifz map to teachers (with *Set up Hifz tracker*), parents (child → **Hifz** tab) and students. Nothing moves a page out of `NOT_STARTED`: lesson results don't update page states and there is no write route, so every map stays grey (the web says so). Requested: either the rules engine (FR-HFZ-02, stashed as `HFZ-BE-02`) updating `state`, `mistakeCountRecent`, `lastRevisedAt`, `nextDueAt` and `intervalDays` from lesson cards and mistakes, or an interim, audited teacher/supervisor route `PATCH /hifz/students/:id/pages/:n { state }`. |
| M9 | Current consent policy version endpoint | The UI sends a hard-coded version. |
| M14 | Availability in a chosen time zone + DST warnings | There is no zone parameter on PUT availability. |
| M16 | Real video: keep the provider media token | `classroom/classroom.service.ts` returns only `url`/`expiresAt`. |
| M17 | REST attendance join; REST controls broadcast to the socket room; layout socket event; recording status in the snapshot; honour `overrideReason` | `classroom.service.ts`; `classroom.gateway.ts`. |
| M19 | AI summary draft generation | `lessons.controller.ts` has only PATCH/approve for `ai-draft`. |
| M20 | Teachers see their own unshared lesson cards; supervisor pre-lock edits logged; prefill/mark for SUPERVISOR/ADMIN as decorated | `lesson-cards.service.ts`. |
| M28 | Cases: `severity`; forward-only state machine; `overdueOnly=false` coerced to true | `qa/cases.service.ts`; `qa.controller.ts` (`z.coerce.boolean()` turns `"false"` into `true`). |
| M29 | Billing: `familyBilling` returns payments + family currency; idempotent subscribe that blocks duplicate live subscriptions; expose `DiscountRule` | `billing.service.ts`; `prisma/schema.prisma`. |
| M32 | Messaging: `studentName` on guardian threads, unread count, don't mark read on every GET, cursor beyond 200 | `messaging.service.ts`. |
| Q13 | Supervisor edits before lock are not written to the edit log | `lesson-cards.service.ts`. |
| Q15 | B7 validators are shallow (`@IsObject`/`@IsArray`): validate `rubric: Record<string, int 0..100>` summing to 100, `objectives: string[]`, `materials: Record<string, string>` | The web enforces these client-side. |

---

## 5. ⏸ Deferred by backend (WONTFIX this round)

Kept so the web's interim behaviour stays documented. The reasons are the backend's own (4.2.0 reply).

| # | Need | Backend reason | Web interim |
| :--- | :--- | :--- | :--- |
| M2, M37, §7.1 | Kids PIN login, guardian PIN management, student OTP | New auth surface; needs its own pass | Kids login shows "not available yet". |
| M22 | Admin lists: invoices, subscriptions, payments, payroll periods, trial classes | Second release | Tools take pasted IDs. |
| M23 | Teacher reviews list; QA rubric list; QA samples list | Second release | — |
| M24 | Staff directory for assignee pickers | Second release | — |
| M25 | CRM lead detail/edit/reassign; auto-create leads | Second release | — |
| M26 | Public lead & trial intake | **QUESTION** (§3) | Booking requires sign-in. |
| M27 | Teacher profile id from an application; user roles in admin search | Second release | — (the staged profile-changes part was moved to §4 as M54) |
| M30 | Payroll currency, line detail, real deductions | Second release | — |
| M31 | FAQ moderation queue + `answer` | Second release | — |
| M35 | Hifz rules engine, AI coach, engagement, certificate verification | Feature areas; Hifz engine stashed (`HFZ-BE-02`) | The Hifz page map is shown (read-only, HFZ-BE-01); every page stays "Not started" until M46. AI coach, engagement and certificates are not shown. |
| M36 | Real payment & video providers | Needs vendor credentials | Fake adapters. |
| M38 | OAuth for 2FA-enabled accounts | Second release | Staff use password sign-in (the web says so). |
| M39 | List / unlink OAuth identities | Second release | The security page can link an identity but not list it. |
| M41 | Examiner workspace (assessments) | Second release | Examiner overview shows "No assessments assigned yet". |
| M44 | Licensed Quran text (`quran_foundation` adapter, CR-11) | Needs a vendor key and licence | **Interim (2026-10-19):** when the API reports `licensed: false`, the web reads the Madani 15-line page from the public Quran.com API (`api.quran.com/api/v4/verses/by_page/:page`). It shows Uthmani script in the real line layout, with word positions used for mistakes, and credits Quran.com on screen. IndoPak layouts keep the structure view. Disable with `NEXT_PUBLIC_QURAN_TEXT_FALLBACK=off`; it switches off by itself once the API returns `licensed: true`. **Action for product:** obtain a Quran Foundation API key and confirm the licence for production. |
| Q1 | `@Idempotent()` never enforced | Second release | — |
| Q2 | Duplicate audit rows; `DELETE /mushaf/cache` unaudited | Second release | — |
| Q4 | `skippedConflicts` counts all schedules | Second release | — |
| Q5 | Teacher-change (100) and application (200) lists are capped | Second release | — |
| Q8, Q12 | (carried from earlier versions) | Second release | — |
| Q14 | Open-slot dates fall outside the requested range | Second release | The web clamps client-side. |
| Q20 | Policy pages have no CMS content | Second release | Built-in drafts marked for legal review. |
| Q22 | Password policy is length-only | Product decision | The web mirrors the 12-character minimum. |
| Q23 | Orphaned session rows; no `current: true` | Second release | — |

---

## 6. Ops: OAuth deployment configuration (not code)

For Google/Apple sign-in to work in each environment:
- Register these redirect URIs with each provider: `<web-origin>/auth/oauth/google` and `<web-origin>/auth/oauth/apple` (e.g. `http://localhost:3000/auth/oauth/google`). They are Next route handlers in `apps/web`; Apple's `form_post` callback is received there.
- The web origin must be in the API's `CORS_ORIGINS`; both cookie refresh **and** the OAuth redirect allow-list use it.
- Provider credentials go in the API env. `GET /auth/oauth/providers` reports `configured:false` until they are set, and the web hides that button.

---

## 7. Local development environment (checked 2026-10-19)

Not production. Checked against the running docker stack.

| Setting | Value | Status |
| :--- | :--- | :--- |
| Web `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api/v1` | ✅ The only variable the web reads; the code defaults to it. `apps/web/.env.example` documents it. |
| API `NODE_ENV` / `PORT` | `development` / `4000` | ✅ |
| API `CORS_ORIGINS` | `http://localhost:3000` | ✅ |
| API `DATABASE_URL` / `REDIS_URL` | `localhost:5432` / `localhost:6379` in `.env`; compose overrides them with `postgres` / `redis` | ✅ |
| API `APP_WEB_URL` | `http://localhost:3000` | ✅ Added to the local `apps/api/.env` (gitignored). Missing from `.env.example` and compose (B34). |
| API `STORAGE_ENDPOINT` / `STORAGE_PUBLIC_ENDPOINT` | `http://minio:9000` (server side) / `http://localhost:9000` (signed browser links) | ✅ B30 fixed in compose; the local workaround was replaced. |
| MinIO | API `http://localhost:9000` (a browser visit redirects to the console; that's expected) · console `http://localhost:9001` · `minioadmin` / `minioadmin` · bucket `hifzoon` | ✅ Upload via presign verified. |
| Mail | `MAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025` (see `apps/api/.env.example`) · MailHog UI `http://localhost:8025` | ✅ Q27 resolved by the SMTP adapter (set these in your local `apps/api/.env`). |
| Staff 2FA | `TWO_FACTOR_ENROLMENT_ENFORCED` defaults to `true` | ℹ️ Seeded staff (`teacher@`, `admin@`, … `@hifzoon.test`, password `Hifzoon!Dev2026`) must enrol 2FA, or set it to `false` in `apps/api/.env` locally. |
| Docker | Run `docker compose up -d` for the whole stack. Starting only `api`/`worker` does not start `minio`, `minio-init` or `mailhog`. | ℹ️ |

---

## 8. Production without seed data

Checked 2026-10-19 by running the web against an API on a **migrated-only, empty** database (`hifzoon_empty`, no seed). All 15 public pages, and every parent and student portal page (using new accounts with no family yet), loaded with no crashes, no 5xx responses and no error screens. The web hard-codes no seed ids or accounts. What an empty production database cannot do today:

| # | Gap | Evidence | Requested change |
| :--- | :--- | :--- | :--- |
| M51 | No way to create the first SUPER_ADMIN | Only `prisma/seed.ts` (`seedUsers`) creates staff accounts; `/auth/register` creates GUARDIAN and STUDENT accounts only | A one-time bootstrap: for example, read `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD` at startup when no SUPER_ADMIN exists (logged and audited), or provide a CLI command `npm run bootstrap:admin`. |
| M52 | Billing plans can only come from the seed | `billing/billing.controller.ts:70` (only `GET /billing/plans`) | Admin CRUD for plans and prices — **parked**: the web hides plans, subscriptions and checkout until a payment provider is integrated (`NEXT_PUBLIC_BILLING_ENABLED`). |
| M53 | The seed mixes reference data with demo data | `prisma/seed.ts:29-40` | Split it into `seed:reference` (roles, courses and levels, Hifz rules, pay rates, QA rubric, app settings, CMS/FAQ, badges), which production may run, and `seed:demo` (the `@hifzoon.test` accounts, the Khan family, demo teachers), which refuses to run when `NODE_ENV=production`. Also seed the badge catalogue: the `badge` table is empty after a seed, so no badge can ever be awarded. |

---

## 9. From the cross-role workflow audit (2026-10-19)

Every "someone submits → someone reviews → the outcome comes back" flow was traced through the API and the web; the full evidence (file:line), the web-side status and the fixes are in [`workflow-audit.md`](./workflow-audit.md). The backend asks it raised:

| # | Need | Audit gap |
| :--- | :--- | :--- |
| M56 | Non-staff `POST /cases/report` (+ optional `GET /cases/mine`) | G1 — see `workflow-audit.md` |
| M57 | Profile-change outcome stored + notified; reject reason; teacher withdraw | G2 (with M54) — see `workflow-audit.md` |
| M58 | Guardian cancel of own OPEN teacher-change; `resolutionNote`; send `class.teacher-change` to family, old and new teacher; notify admins on new request | G3 — see `workflow-audit.md` |
| B38 | **Defect:** cancel notification queued after `ClassStudent` rows are deleted, so nobody is notified. Also notify the teacher on family/admin cancel and reschedule, and notify all guardians | G4, G16 — see `workflow-audit.md` |
| M59 | Notification read state (`readAt`, mark read, unread count) | G5 — see `workflow-audit.md` |
| M60 | `PATCH /courses/enrolments/:id/teacher` + notifications; admin notice on family self-enrolment | G6 — see `workflow-audit.md` |
| M61 | Admin trial booking notifies and plans reminders; outcome applies placement, notifies, and is visible to the guardian; `trial.booked` only for TRIAL with names | G7 — see `workflow-audit.md` |
| M62 | Notify the teacher on a QA review and the supervisor on a reply | G8 — see `workflow-audit.md` |
| M63 | Applicant emails; approval of a public application creates and invites the teacher account; provisioning reuses the open application | G9 — see `workflow-audit.md` |
| M64 | Audit `POST /faq` | G10 — see `workflow-audit.md` |
| M65 | Rating comments for supervisor/teacher; low-rating alert | G12 — see `workflow-audit.md` |
| M66 | Teacher-initiated threads; family ↔ academy support threads | G13 — see `workflow-audit.md` |
| M67 | List and redeem make-up credits | G14 — see `workflow-audit.md` |
| M68 | Lesson-card state on teacher timetable rows | G15 — see `workflow-audit.md` |

**Raise first, for real users:** **M56** (no way to report a concern, although the published child-safety policy promises a report button), **M54 + M57**, **M58**, **M63**.
