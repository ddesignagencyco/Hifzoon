# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.7.0
**Updated:** 2026-10-19
**Author:** Frontend Engineering Team
**Verified against:** `feat-frontend-ui` at `b53ec35`, which includes every `origin/feat-webhooks` commit up to `7aab70d` (the last two were docs-only). The backend's 4.2.0 reply was removed upstream in `b3d7406`; read it with `git show 628c3fd:docs/API-UPDATES-4.2.0-REPLY.md`.
**Scope:** Everything the web app (`apps/web`) needs changed or added outside `apps/web`. The web team does not modify `apps/api`, `packages/*` or `docker/*`. **One exception:** `docker-compose.yml` was changed locally at the product owner's request so uploads work in development (B30, §7).

Paths are relative to `apps/api/src/modules/` unless stated. Line numbers are as of 2026-10-19.

---

## 0. How to use this document (backend team)

- Every open item has an **ID**, the **evidence** (file:line), the **problem** and the **requested change**. Please reply per ID with `FIXED <commit>`, `WONTFIX <reason>` or `QUESTION`.
- **Only open requests are listed.** Everything marked FIXED in the 4.2.0 reply was checked; the items that work are removed (§1.1 shows how each was verified).
- **Coverage:** the web calls **170 of 174** API routes (`apps/web/docs/api-coverage.md`). The 4 it doesn't call are the provider webhooks (`POST /webhooks/payments`, `POST /webhooks/video`, `GET` + `POST /webhooks/whatsapp`), which are server-to-server.
- **History:** v4.3.0 added B29–B33, S21, M45, Q25, Q26. v4.4.0 added B34, M46, Q27. v4.5.0 records the local environment check and the compose change (§7). v4.6.0 adds the classroom-flow review (B35–B37, M47–M50) and production without seed data (§8: M51–M53). v4.7.0 adds M54, M55 and the cross-role workflow audit (§9: B38, M56–M68).

---

## 1. Summary

| Group | Open | Items |
| :--- | :---: | :--- |
| 🔴 Open defects | 12 | **B36** (a class opened early never goes LIVE), **B37** (classes nobody attended are marked COMPLETED), **B35** (attendance rate counts future classes), **B30** (upload links unreachable from the browser — worked around locally), **B34** (class reminders say "undefined"), **S21** (`javascript:` URLs accepted on public teacher profiles), **B29** (cancelled classes still vanish — M13), **B33** (clearing a list field breaks approval), **B31** (admins can't open uploaded files), **B32** (application keys unchecked), **Q25** (M6 field names), **Q26** (upload size not enforced) |
| ❓ Questions to answer | 2 | Q9 price periods, M26 public intake |
| 🟡 New requests / no reply yet | 21 | **M48** (a child can't join a class), **M54** (admins can't see pending teacher profile changes), M55, M69, M47, M49, M50, M45, M46, Q27, M9, M14, M16, M17, M19, M20, M28, M29, M32, Q13, Q15 |
| 🧭 Workflow audit (§9) | 14 | **B38** (cancellations notify nobody), **M56** (no way for families/teachers to report a concern), M57–M68 |
| 🏗 Production without seed data (§8) | 3 | M51 first super admin, M52 plan management, M53 seed split |
| ⏸ Deferred by backend (WONTFIX this round) | 26 | M2, M22–M27, M30, M31, M35–M39, M41, M44, Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23 |

### 1.1 Verification of the 4.2.0 reply

Run on 2026-10-18 against the rebuilt API (docker, migration + `npm run db:seed`) with **28 live checks**; staff 2FA was enrolled for the run and disabled afterwards. **27 passed**; the failure is B29.

| Verified live (API call) | Verified in code |
| :--- | :--- |
| S12 other-family guardian → 403 · B25 own guardian joins trial → 201 `GUARDIAN_VIEWER` · B28 booked trial creates an enrolment · B21 trial teacher saves & reads mistakes (another teacher still 403) · B26 wrong-course teacher → 400 · B27 outside availability → 409 `SLOT_UNAVAILABLE` · B11 `teacherId` filter + sorted · B18 bad `courseId` → 400 · S7 legacy `by` → 400, `{reason}` → 200 · S8 reschedule inside notice → 400 · M42 unenrolled staff → 403 `TWO_FACTOR_ENROLMENT_REQUIRED`, `/auth/me` still 200 · M1 `GET /teachers/me` · M43 `canRate/rated/course/teacherId` · M18 · M6 shape · Q19 → 204 · §7.4 `recitationSampleUrl` · M34 presign · M12 `verified` · B19 paging | B23 quiet hours (`notifications.service.ts:215-227`) · S20 `verifiedAt: null` (`families.service.ts:60`) · S13 (`lesson-cards.service.ts:540-545`) · S14 (`messaging.service.ts:105`) · B24 (`admissions.service.ts:258-265`) · B14 (`qa.service.ts:56`) · B22 `firstInvoice` (`billing.service.ts:202,217`) · M15 guardian list (`admissions.controller.ts:167`) · M7 student's own enrolments (`courses.service.ts:247`) |

---

## 2. 🔴 Open defects

| # | Endpoint / area | Evidence | Problem | Requested change |
| :--- | :--- | :--- | :--- | :--- |
| B30 | 🚨 `POST /uploads/presign` signs a URL the browser cannot reach | `docker-compose.yml:123` (api) and `:160` (worker) `STORAGE_ENDPOINT`; `storage/storage.service.ts:83-89` | With `STORAGE_ENDPOINT: http://minio:9000` the presign response was `"url":"http://minio:9000/hifzoon/recitations/…"`. `minio` resolves only inside the docker network, so the browser's PUT failed and **no teacher application with a recording or documents could be submitted**. Rewriting the host is not possible: it is part of the signature (`SignatureDoesNotMatch`). **Local workaround (2026-10-19, at the product owner's request):** the **api** service now uses `STORAGE_ENDPOINT: http://localhost:9000`. That is safe because the API only signs links and never calls MinIO (it only uses `signedUploadUrl`, `uploads.controller.ts:105`). Verified: link host `localhost:9000`, PUT with `Origin: http://localhost:3000` → 200, object present in the bucket, CORS preflight allows the origin. The **worker** keeps `http://minio:9000` because it does call MinIO (`upload`/`remove`/`objectExists` in `data-request.processor.ts:156,279`, `classroom.processor.ts:152,184`, `retention.processor.ts:110,146`). Its data-export download links (`data-request.processor.ts:168`) therefore still point at `minio:9000`. | Add `STORAGE_PUBLIC_ENDPOINT` (e.g. `http://localhost:9000` locally, the CDN/S3 host in production). Sign upload **and** download URLs with a client built on it, keep `STORAGE_ENDPOINT` for server-side calls, then revert the api override. For production S3, add a bucket CORS rule allowing `PUT` from the web origins (MinIO allows it by default). |
| B34 | Day-before / 15-minute class reminders read "Class tomorrow: undefined … at undefined (undefined). Join: undefined" | `worker/processors/class-reminder.processor.ts:95-104` vs `notifications/class-reminder.service.ts:130-140`; templates `notifications/notifications.service.ts:51-60` | Seen by a parent on 2026-10-19 (`parent@hifzoon.test`; the stored payload has only `courseName`, `teacherName`, `startsAt`). There are **two producers**. The API service passes `studentName, teacherName, localTime, timeZone, opensAt, joinUrl`. The worker processor passes only `courseName, teacherName, startsAt`, so the template writes `undefined` into the stored `subject`/`body`, and into the email/WhatsApp text. Also, the service builds `joinUrl` from raw `process.env.APP_WEB_URL ?? 'https://app.hifzoon.com'` (`:138`), which bypasses the config default (`config/env.schema.ts:41`, `http://localhost:3000`). `APP_WEB_URL` is in neither `apps/api/.env.example` nor `docker-compose.yml`. It has now been added to the local `apps/api/.env` (§7). *Web:* never shows text containing `undefined`/`null`; it rebuilds the text from the payload ("Class tomorrow: Hifz — Hifz with Ustadh Bilal Rahman · Mon 19 Oct, 16:00"). It also serves `/classroom/:id`, which redirects to the teacher, student or parent classroom. | Use one producer that sends the full data (student name, local time in the family's zone, zone, join link). Make templates fail loudly (skip and set `failureReason`) when a field is missing, instead of writing `undefined`. Read `APP_WEB_URL` through the config service, and add it to `.env.example` and compose. |
| B36 | A class whose room is opened before the start time never becomes LIVE | `classroom/classroom.service.ts:261-267` | The room is created on the first token request, and the status is set to `LIVE` only if `startsAt <= now` **at that moment**. Teachers open the room in the 10-minute early window, so the class stays `SCHEDULED` for the whole lesson (seen 2026-10-19 on class `01a15385-a469-…`: teacher and parent connected, status "Scheduled"). Nothing moves it to `LIVE` later. *Web:* shows "In progress" when a SCHEDULED class is past its start time. | Set `LIVE` (+ `startedAt`) once the start time passes with the room open — on the next token, join or heartbeat after `startsAt`, or from the classroom worker. |
| B37 | Classes nobody attended are closed as COMPLETED | `worker/processors/classroom.processor.ts:203-215` (`closeFinishedClasses`) | Every class whose `endsAt` has passed and that is still `SCHEDULED`/`LIVE` becomes `COMPLETED`, whether or not anyone joined. Payroll keys off `COMPLETED`, and families can rate such classes (`canRate`). `NO_SHOW_STUDENT` / `NO_SHOW_TEACHER` exist in `ClassStatus` but are never set. | Use attendance (`class_participant`) when closing: no teacher → `NO_SHOW_TEACHER`; teacher but nobody from the student's side → `NO_SHOW_STUDENT`; otherwise `COMPLETED`. |
| B35 | Attendance rate counts classes that haven't happened yet | `parent-portal/parent-portal.service.ts:187-213` (`attendanceSummary`) | `bookedClasses` counts every `class_student` row in the calendar month, including future classes, so the rate drops as the month's schedule fills. Live: Maryam attended 2 of the 3 classes that had happened, but the dashboard shows **50%** (2 of 4, because her 28 Oct class is counted). | Count only classes that have started (`startsAt < now`) and were not cancelled; count `NO_SHOW_*` (B37) as booked but missed. |
| S21 | Teacher profile URLs accept any scheme | `teachers/teachers.service.ts:668,701-705` (`URL.canParse`) | `photoUrl`, `introVideoUrl` and `recitationSampleUrl` accept `javascript:`, `data:`, `ftp:` and similar. Once approved, they are served on the public, unauthenticated `GET /teachers/public*`. *Web:* renders only http(s) links and audio. | Allow only `https:` (and `http:` outside production). |
| B29 | **M13 is not effective:** cancelled classes still disappear from both timetables | `scheduling/scheduling.service.ts:619-633` (cancel), `:1166-1170` (family timetable `where`), `:1131` (teacher timetable) | The reply says cancelled classes are kept (`e1ae34d`), and the family timetable no longer filters on status. But **cancel deletes the `ClassStudent` rows** (`classStudent.deleteMany`, `:632`), and the family timetable finds classes through `students: { some: { student: { familyId } } }`, so a cancelled class can never match. Reproduced: class `01a14f36-daff-…` → `CANCELLED_FAMILY`, 0 `class_student` rows, absent from `GET /scheduling/families/:id/timetable`; every `CANCELLED_*` class in the DB has 0 student rows. The **teacher** timetable still filters with `status: { notIn: ['CANCELLED_FAMILY','CANCELLED_TEACHER'] }` (`:1131`). | Keep the `ClassStudent` rows on cancel, and make the overlap check (exclusion constraint / conflict query) ignore `CANCELLED_*` instead. Drop the status filter from the teacher timetable. The web already shows cancelled rows with a red badge on both timetables. |
| B33 | Clearing a list field in a profile change will fail on approval | `teachers/teachers.service.ts:693` (null allowed for every key); `prisma/schema.prisma:1142-1144` (`languages`, `subjects`, `ageGroups` are non-null `String[]`) | A staged `null` for a list field passes the PATCH, but approving it should fail in Prisma (likely a 500). Also, `subjects` and `languages` aren't checked against course codes and ISO codes, and the approve response (`:492`) omits the applied list fields. *Web:* sends `[]` to clear a list. | Reject `null` for list fields (or map it to `[]`). Validate subjects against `Course.code` and languages against ISO 639-1. Return the full applied profile from approve. |
| B31 | Admins cannot open an application's recitation or documents | `teachers/teachers.service.ts:74,98-106,140-160` | Keys are stored in `recitationAudioUrl` / document `fileUrl` and returned raw. No route returns a signed GET (`signedDownloadUrl` is used only by the data-request worker). *Web:* the admin view shows "Stored privately (no download link from the API yet)" with the key. | Return `recitationAudioDownloadUrl` and a per-document `downloadUrl` (short-lived, signed for the public endpoint, B30) from `GET /teachers/applications/:id`. |
| B32 | `POST /teachers/applications` accepts any string as an upload key | `teachers/teachers.controller.ts:37,43-45` | Nothing checks that the object exists (`objectExists`) or that the prefix matches its kind (`recitations/` vs `documents/`). `recitationAudioKey` has no `@MaxLength`, so old data-URL payloads up to the body limit are still stored. Document values aren't checked to be strings. | Validate key format, prefix and existence; add `@MaxLength(512)`. |
| Q26 | Upload size limit not enforced on the PUT | `storage/storage.service.ts:83-89` | Only `ContentType` is signed, so a client can presign with a small `size` and then PUT a larger file. The web checks size before uploading, but that is not a guard. | Sign `ContentLength`, or use a presigned POST policy with `content-length-range`. Minor: the extension comes from the content type, so `audio/x-wav` becomes `.x-wav`. |
| Q25 | M6 field-level errors name the wrong field for `@IsIn` / `@IsEnum` | `common/filters/all-exceptions.filter.ts:200-215` (`fieldErrors`) | The parser assumes every class-validator message is `"<constraint>: <property> …"`. Default messages are `"<property> must be one of the following values: A, B"`, so `split(': ')[1]` picks up the value list. Live: `POST /scheduling/book` with a bad body returned `details: [{ field: "ONE_TO_ONE,", messages: ["roomType must be one of the following values"] }, { field: "TRIAL,", … }]`. Messages without `': '` are dropped entirely: `POST /consent/students/:id/grant` without `policyVersion` returned `400` with `details: []` (2026-10-19). | Use `ValidationPipe({ exceptionFactory })` and read `ValidationError.property` / `.constraints` (and `.children` for nested DTOs) instead of parsing message strings. *Web:* uses the `messages` text, so the toast is correct, but inline field highlighting can't work until this is fixed. |

---

## 3. ❓ Questions to answer

| # | Question |
| :--- | :--- |
| Q9 | You flagged that USD `4900` reads as a monthly price while PKR `1900000` reads as an annual one. **Product to confirm the price list per currency and period.** The web shows whatever `GET /billing/plans` returns (`formatMoney` + `billingPeriod`). |
| M26 / §7.2 / §7.3 | Public `POST /leads` and `POST /trials/public`. Web proposal: rate-limit to 5 per hour per IP and per email, require an hCaptcha/Turnstile token in the body, and create a CRM **lead only**. No provisional family; the family is created when the parent signs up from the emailed link. Please confirm or counter. |

---

## 4. 🟡 New requests

M45, M46 and Q27 are new since the 4.2.0 reply; the rest were in v4.2.0 and the reply doesn't mention them.

| # | Need | Evidence / current workaround |
| :--- | :--- | :--- |
| M48 | 🚨 A child can never join a class as the student | `classroom/classroom.service.ts:181-203` (role resolution), `:213` | A `STUDENT` participant needs a login linked to the child (`student.userId`). Guardians create children without a login, there is no route to link one, and Kids PIN (M2) is deferred. Guardians only get `GUARDIAN_VIEWER` (watch-only, no camera or mic). So in practice **no student is ever in the class**: attendance shows 0 students and the teacher has nobody to teach. Seen 2026-10-19. *Local demo:* `yusuf@hifzoon.test` was registered and linked to Yusuf by hand in the DB. | Pick one or both: (a) **a guardian joins as the child** — a guardian of a student on the class may request a token with `{ asStudentId }` and receives a `STUDENT` participant for that child (publishing audio/video, attendance counted for the child); (b) a guardian route to create or link a child login (e.g. `POST /families/:id/students/:sid/login` sends an invite), plus M2 for young children. |
| M47 | Teacher view of a student: family and profile | `teachers/*`; `families/families.controller.ts:129` (guardians and staff only) | Teachers see only `student.displayName`/`birthYear` on enrolments. The only family data a teacher can reach is the family **name** on message threads the family opened. *Web:* the teacher's student page shows age, courses and start date, plus the family name with a link to the conversation when a thread exists. | `GET /teachers/me/students/:studentId` (the teacher's own students only): family name, guardian names and relationship (no contact details — contact stays in platform messaging), the student's time zone, language, Mushaf layout and notes, and the consent flags that matter in class (recording, AI). |
| M49 | A student can't list their own upcoming classes | `scheduling/scheduling.controller.ts:289,308` (teacher and family timetables only) | The student portal can show courses (M7) but not classes; join links come only from notifications. *Web:* `/classroom/:id` (the reminder link) takes a student to their classroom. | `GET /scheduling/students/me/timetable?from&to&tz` for `STUDENT` / `CHILD_STUDENT`, with the same row shape as the family timetable. |
| M50 | Mistakes can be logged before the class starts and with no student present | `lessons/mistakes.service.ts:42-58` | The service checks only that the student is on the class. *Web:* the classroom hides the mistake form until the start time and until the student's side (the student, or a guardian device) has joined. | Refuse `POST /classes/:id/mistakes` before `startsAt` and when nobody for that student (or, until M48, their guardian) has joined. Keep staff overrides, audited. |
| M54 | 🚨 Admins can't see teacher profile changes waiting for approval (was part of deferred M27) | `teachers/teachers.service.ts:445-492` (`pendingProfileChanges` written by `PATCH /teachers/me/profile`, read only by `GET /teachers/me` at `:389`) | A teacher's "Submit for approval" stages the change on their profile, but no admin route returns `pendingProfileChanges` and none lists the teachers who have some. The only admin control (Admin → Teachers → an application → "Public profile changes") offers Approve/Reject without showing what changed, and an admin has no way to know a change is waiting. Reported by the product owner on 2026-10-19. | `GET /teachers/profile-changes` (ADMIN, SUPER_ADMIN): teachers with staged changes — `{ profileId, teacherName, submittedAt, changes, current }` (current values of the changed fields, for a before/after view); include `pendingProfileChanges` in the admin teacher/application detail. Optionally notify admins on submission and the teacher on approve/reject. |
| M55 | The classroom state lacks what a meeting screen needs | `classroom/classroom.service.ts` (`GET /classroom/classes/:id/state` snapshot) | The redesigned meeting-style classroom (2026-10-19) has no course or student name to title the class (it says "Live classroom"), no recording status (the REC pill appears only in the teacher's own session after they press record — see also M17), and no per-participant mic/camera state, so other people's tiles show initials. | Add `course { name }`, `students [{ id, displayName }]`, `recording { status, startedAt }` and, per participant, `micOn` / `camOn` (from the video provider or socket events) to the snapshot. |
| M69 | Signed-in password change | `auth/auth.controller.ts:214,227` (only `forgot-password` / `reset-password`) | Account security has no way to change a password while signed in. *Web:* the new Password card emails the account's own reset link (`POST /auth/forgot-password`). In local dev that email is only written to the API log (`MAIL_PROVIDER=log`; MailHog stays empty — Q27). | `POST /auth/change-password { currentPassword, newPassword }` (re-auth like `REAUTH_REQUIRED`, revoke other sessions, notify by email). |
| M45 | The applicant's audition never becomes the profile's recitation sample | `teachers/teachers.service.ts:74`: the application stores the storage key in `TeacherApplication.recitationAudioUrl`, and it is never copied to `TeacherProfile.recitationSampleUrl`. A new teacher has no public sample unless they paste a URL. Requested: on approval, copy the key and serve it through a signed or public URL (see B30, B31). |
| M46 | Hifz page states can be read but never change | `hifz/hifz.controller.ts` has only `GET …/pages`, `GET …/pages/:n` and `POST …/initialize`. The web shows the 604-page Hifz map to teachers (with *Set up Hifz tracker*), parents (child → **Hifz** tab) and students. Nothing moves a page out of `NOT_STARTED`: lesson results don't update page states and there is no write route, so every map stays grey (the web says so). Requested: either the rules engine (FR-HFZ-02, stashed as `HFZ-BE-02`) updating `state`, `mistakeCountRecent`, `lastRevisedAt`, `nextDueAt` and `intervalDays` from lesson cards and mistakes, or an interim, audited teacher/supervisor route `PATCH /hifz/students/:id/pages/:n { state }`. |
| Q27 | Emails can't be viewed in MailHog | `config/env.schema.ts:89` allows only `log`, `file` or `resend` for `MAIL_PROVIDER`; MailHog is defined at `docker-compose.yml:94`. MailHog's UI (`http://localhost:8025`) stays empty because nothing sends SMTP. Reset and verification emails appear only in the API log (`MAIL_PROVIDER=log`, the local setting) or as `.eml` files (`file` → `MAIL_CAPTURE_DIR`). Requested: `MAIL_PROVIDER=smtp` with `SMTP_HOST=mailhog`, `SMTP_PORT=1025` as the docker default. |
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
| API `STORAGE_ENDPOINT` | api `http://localhost:9000` · worker `http://minio:9000` | ⚠️ Local workaround in `docker-compose.yml` (B30). |
| MinIO | API `http://localhost:9000` (a browser visit redirects to the console; that's expected) · console `http://localhost:9001` · `minioadmin` / `minioadmin` · bucket `hifzoon` | ✅ Upload via presign verified. |
| Mail | `MAIL_PROVIDER=log` (emails appear in `docker compose logs -f api`) · MailHog UI `http://localhost:8025` | ⚠️ MailHog stays empty (Q27). |
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

**Raise first, for real users:** **B38** (a cancelled class notifies nobody — the guardians are looked up through the `ClassStudent` rows the same cancel just deleted, `scheduling.service.ts:632,640`; same root cause as B29), **M56** (no way to report a concern, although the published child-safety policy promises a report button), **M54 + M57**, **M58**, **M63**.
