# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.5.0
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
- **History:** v4.3.0 added B29–B33, S21, M45, Q25, Q26. v4.4.0 added B34, M46, Q27. v4.5.0 records the local environment check and the compose change (§7).

---

## 1. Summary

| Group | Open | Items |
| :--- | :---: | :--- |
| 🔴 Open defects | 9 | **B30** (upload links unreachable from the browser — worked around locally), **B34** (class reminders say "undefined"), **S21** (`javascript:` URLs accepted on public teacher profiles), **B29** (cancelled classes still vanish — M13), **B33** (clearing a list field breaks approval), **B31** (admins can't open uploaded files), **B32** (application keys unchecked), **Q25** (M6 field names), **Q26** (upload size not enforced) |
| ❓ Questions to answer | 2 | Q9 price periods, M26 public intake |
| 🟡 New requests / no reply yet | 14 | M45, M46, Q27, M9, M14, M16, M17, M19, M20, M28, M29, M32, Q13, Q15 |
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
| S21 | Teacher profile URLs accept any scheme | `teachers/teachers.service.ts:668,701-705` (`URL.canParse`) | `photoUrl`, `introVideoUrl` and `recitationSampleUrl` accept `javascript:`, `data:`, `ftp:` and similar. Once approved, they are served on the public, unauthenticated `GET /teachers/public*`. *Web:* renders only http(s) links and audio. | Allow only `https:` (and `http:` outside production). |
| B29 | **M13 is not effective:** cancelled classes still disappear from both timetables | `scheduling/scheduling.service.ts:619-633` (cancel), `:1166-1170` (family timetable `where`), `:1131` (teacher timetable) | The reply says cancelled classes are kept (`e1ae34d`), and the family timetable no longer filters on status. But **cancel deletes the `ClassStudent` rows** (`classStudent.deleteMany`, `:632`), and the family timetable finds classes through `students: { some: { student: { familyId } } }`, so a cancelled class can never match. Reproduced: class `01a14f36-daff-…` → `CANCELLED_FAMILY`, 0 `class_student` rows, absent from `GET /scheduling/families/:id/timetable`; every `CANCELLED_*` class in the DB has 0 student rows. The **teacher** timetable still filters with `status: { notIn: ['CANCELLED_FAMILY','CANCELLED_TEACHER'] }` (`:1131`). | Keep the `ClassStudent` rows on cancel, and make the overlap check (exclusion constraint / conflict query) ignore `CANCELLED_*` instead. Drop the status filter from the teacher timetable. The web already shows cancelled rows with a red badge on both timetables. |
| B33 | Clearing a list field in a profile change will fail on approval | `teachers/teachers.service.ts:693` (null allowed for every key); `prisma/schema.prisma:1142-1144` (`languages`, `subjects`, `ageGroups` are non-null `String[]`) | A staged `null` for a list field passes the PATCH, but approving it should fail in Prisma (likely a 500). Also, `subjects` and `languages` aren't checked against course codes and ISO codes, and the approve response (`:492`) omits the applied list fields. *Web:* sends `[]` to clear a list. | Reject `null` for list fields (or map it to `[]`). Validate subjects against `Course.code` and languages against ISO 639-1. Return the full applied profile from approve. |
| B31 | Admins cannot open an application's recitation or documents | `teachers/teachers.service.ts:74,98-106,140-160` | Keys are stored in `recitationAudioUrl` / document `fileUrl` and returned raw. No route returns a signed GET (`signedDownloadUrl` is used only by the data-request worker). *Web:* the admin view shows "Stored privately (no download link from the API yet)" with the key. | Return `recitationAudioDownloadUrl` and a per-document `downloadUrl` (short-lived, signed for the public endpoint, B30) from `GET /teachers/applications/:id`. |
| B32 | `POST /teachers/applications` accepts any string as an upload key | `teachers/teachers.controller.ts:37,43-45` | Nothing checks that the object exists (`objectExists`) or that the prefix matches its kind (`recitations/` vs `documents/`). `recitationAudioKey` has no `@MaxLength`, so old data-URL payloads up to the body limit are still stored. Document values aren't checked to be strings. | Validate key format, prefix and existence; add `@MaxLength(512)`. |
| Q26 | Upload size limit not enforced on the PUT | `storage/storage.service.ts:83-89` | Only `ContentType` is signed, so a client can presign with a small `size` and then PUT a larger file. The web checks size before uploading, but that is not a guard. | Sign `ContentLength`, or use a presigned POST policy with `content-length-range`. Minor: the extension comes from the content type, so `audio/x-wav` becomes `.x-wav`. |
| Q25 | M6 field-level errors name the wrong field for `@IsIn` / `@IsEnum` | `common/filters/all-exceptions.filter.ts:200-215` (`fieldErrors`) | The parser assumes every class-validator message is `"<constraint>: <property> …"`. Default messages are `"<property> must be one of the following values: A, B"`, so `split(': ')[1]` picks up the value list. Live: `POST /scheduling/book` with a bad body returned `details: [{ field: "ONE_TO_ONE,", messages: ["roomType must be one of the following values"] }, { field: "TRIAL,", … }]`. | Use `ValidationPipe({ exceptionFactory })` and read `ValidationError.property` / `.constraints` (and `.children` for nested DTOs) instead of parsing message strings. *Web:* uses the `messages` text, so the toast is correct, but inline field highlighting can't work until this is fixed. |

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
| M27 | Teacher profile id from an application; user roles in admin search | Second release | — |
| M30 | Payroll currency, line detail, real deductions | Second release | — |
| M31 | FAQ moderation queue + `answer` | Second release | — |
| M35 | Hifz rules engine, AI coach, engagement, certificate verification | Feature areas; Hifz engine stashed (`HFZ-BE-02`) | The Hifz page map is shown (read-only, HFZ-BE-01); every page stays "Not started" until M46. AI coach, engagement and certificates are not shown. |
| M36 | Real payment & video providers | Needs vendor credentials | Fake adapters. |
| M38 | OAuth for 2FA-enabled accounts | Second release | Staff use password sign-in (the web says so). |
| M39 | List / unlink OAuth identities | Second release | The security page can link an identity but not list it. |
| M41 | Examiner workspace (assessments) | Second release | Examiner overview shows "No assessments assigned yet". |
| M44 | Licensed Quran text (`quran_foundation` adapter, CR-11) | Needs a vendor key and licence | Classroom shows "Quran text is not licensed in this environment". **Action for product:** obtain a Quran Foundation API key; the web needs no change. |
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
