# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.4.0
**Updated:** 2026-10-19
**Author:** Frontend Engineering Team
**Verified against:** `feat-frontend-ui` after merging `origin/feat-webhooks` (`628c3fd`, backend reply `docs/API-UPDATES-4.2.0-REPLY.md`, since removed upstream in `b3d7406` — read it with `git show 628c3fd:docs/API-UPDATES-4.2.0-REPLY.md`).
**Scope:** Everything the web app (`apps/web`) needs changed or added outside `apps/web`. The web team does not modify `apps/api`, `packages/*`, `docker/*` or root config; every item here is a request to the owning team.

Paths are relative to `apps/api/src/modules/` unless stated. Line numbers are as of 2026-10-18.

---

## 0. How to use this document (backend team)

- Every open item has an **ID**, the **evidence** (file:line), the **problem** and the **requested change**. Please reply per ID with `FIXED <commit>`, `WONTFIX <reason>` or `QUESTION`.
- **Only open requests are listed.** Everything you marked FIXED in the 4.2.0 reply was checked, and the items that work are removed (see §1.1 for how each was verified).
- **v4.4.0:** after the docs-only pull (`b3d7406`, `7aab70d`) the web now calls **170 of 174** API routes (`api-coverage.md`). The 4 unused are the provider webhooks (`/webhooks/payments`, `/webhooks/video`, `/webhooks/whatsapp` GET+POST), which are server-to-server and never called by a browser. Adds **M46** (Hifz page writes) and **Q27** (dev mailer → MailHog).
- New items continue the numbering: v4.3.0 adds **B29** (M13 not effective), **B30–B33** and **S21** (found while wiring M34 and B2), **M45** and **Q25–Q26**.

---

## 1. Summary

| Group | Open | Items |
| :--- | :---: | :--- |
| 🔴 Still broken after the 4.2.0 reply | 9 | **B34** (class reminders say "undefined"), **S21** (`javascript:` URLs accepted on public teacher profiles), **B33** (clearing a list field breaks approval), **B30** (upload URL unreachable from the browser in docker — blocks teacher applications), **B29** (cancelled classes still vanish — M13), **B31** (admins can't open uploaded files), **B32** (application keys unchecked), **Q25** (M6 field names), **Q26** (upload size not enforced) |
| ❓ Questions to answer | 2 | Q9 price periods, M26 public intake |
| 🟡 No reply yet / new | 14 | M46, Q27, M45, M9, M14, M16, M17, M19, M20, M28, M29, M32, Q13, Q15 |
| ⏸ Deferred by backend (WONTFIX this round) | 26 | M2, M22–M27, M30, M31, M35–M39, M41, M44, Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23 |

### 1.1 Verification of the 4.2.0 reply

Run on 2026-10-18 against the rebuilt API (docker, migration + `npm run db:seed`), with **28 live checks**; staff 2FA was enrolled for the run and disabled afterwards. **27 passed.**

| Verified live (API call) | Verified in code |
| :--- | :--- |
| S12 other-family guardian → 403 · B25 own guardian joins trial → 201 `GUARDIAN_VIEWER` · B28 booked trial creates an enrolment · B21 trial teacher saves & reads mistakes (another teacher still 403) · B26 wrong-course teacher → 400 · B27 outside availability → 409 `SLOT_UNAVAILABLE` · B11 `teacherId` filter + sorted · B18 bad `courseId` → 400 · S7 legacy `by` → 400, `{reason}` → 200 · S8 reschedule inside notice → 400 · M42 unenrolled staff → 403 `TWO_FACTOR_ENROLMENT_REQUIRED`, `/auth/me` still 200 · M1 `GET /teachers/me` · M43 `canRate/rated/course/teacherId` · M18 · M6 shape · Q19 → 204 · §7.4 `recitationSampleUrl` · M34 presign · M12 `verified` · B19 paging | B23 quiet hours (`notifications.service.ts:215-227`) · S20 `verifiedAt: null` (`families.service.ts:60`) · S13 (`lesson-cards.service.ts:540-545`) · S14 (`messaging.service.ts:105`) · B24 (`admissions.service.ts:258-265`) · B14 (`qa.service.ts:56`) · B22 `firstInvoice` (`billing.service.ts:202,217`) · M15 guardian list (`admissions.controller.ts:167`) |

**Local dev note (M42):** seeded staff accounts (`teacher@`, `admin@`, … `@hifzoon.test`) are now restricted until they enrol 2FA; the web redirects them to Account → Security. Set `TWO_FACTOR_ENROLMENT_ENFORCED=false` in `apps/api/.env` to skip this locally.

---

## 2. 🔴 Still broken after the 4.2.0 reply

| # | Endpoint / area | Evidence | Problem | Requested change |
| :--- | :--- | :--- | :--- | :--- |
| B29 | **M13 is not effective:** cancelled classes still disappear from both timetables | `scheduling/scheduling.service.ts:619-633` (cancel), `:1166-1170` (family timetable `where`), `:1131` (teacher timetable) | The reply says "cancelled classes are kept" (`e1ae34d`), and the family timetable no longer filters on status — but **cancel deletes the `ClassStudent` rows** (`classStudent.deleteMany`, `:632`), and the family timetable finds classes through `students: { some: { student: { familyId } } }`, so a cancelled class can never match. Reproduced: class `01a14f36-daff-…` → `CANCELLED_FAMILY`, 0 `class_student` rows, absent from `GET /scheduling/families/:id/timetable`; every `CANCELLED_*` class in the DB has 0 student rows. The **teacher** timetable still has `status: { notIn: ['CANCELLED_FAMILY','CANCELLED_TEACHER'] }` (`:1131`). | Keep the `ClassStudent` rows on cancel, and exclude cancelled classes in the overlap check instead (e.g. make the exclusion constraint / conflict query ignore `CANCELLED_*`). Drop the status filter from the teacher timetable. The web already shows cancelled rows with a badge on both timetables. |
| B34 | Day-before / 15-minute class reminders read "Class tomorrow: undefined … at undefined (undefined). Join: undefined" | `worker/processors/class-reminder.processor.ts:95-104` vs `modules/notifications/class-reminder.service.ts:130-140`; templates `notifications/notifications.service.ts:51-60` | Seen by a parent on 2026-10-19 (`parent@hifzoon.test`, stored payload has only `courseName`, `teacherName`, `startsAt`). There are **two producers**: the API service passes `studentName, teacherName, localTime, timeZone, opensAt, joinUrl`; the worker processor passes only `courseName, teacherName, startsAt`, so the template renders `undefined` into the stored `subject`/`body` (and into the email/WhatsApp text). Also: the service's `joinUrl` is `${APP_WEB_URL ?? 'https://app.hifzoon.com'}/classroom/:id` and `APP_WEB_URL` is not set in `apps/api/.env` / docker. *Web:* never shows text containing `undefined`/`null`, rebuilds it from the payload ("Class tomorrow: Hifz — Hifz with Ustadh Bilal Rahman · Mon 19 Oct, 16:00"), and now serves `/classroom/:id` (redirects to the teacher, student or parent classroom). | Use one producer with the full data (student name, family-zone local time, zone, join link); make templates fail loudly (throw / skip + `failureReason`) when a field is missing instead of rendering `undefined`; set `APP_WEB_URL` (e.g. `http://localhost:3000`) in env and compose. |
| S21 | Teacher profile URLs accept any scheme | `teachers/teachers.service.ts:668,701-705` (`URL.canParse`) | `photoUrl`, `introVideoUrl` and `recitationSampleUrl` accept `javascript:`, `data:`, `ftp:` …; once approved they are served on the public, unauthenticated `GET /teachers/public*`. *Web:* renders only http(s) links/audio. | Allow `https:` (and `http:` outside production) only. |
| B33 | Clearing a list field in a profile change will fail on approval | `teachers/teachers.service.ts:693` (null allowed for every key); `prisma/schema.prisma:1142-1144` (`languages`, `subjects`, `ageGroups` are non-null `String[]`) | A staged `null` for a list field passes the PATCH but approving it should fail in Prisma (likely 500). Also `subjects`/`languages` aren't checked against course codes / ISO codes, and the approve response (`:492`) omits the applied list fields. *Web:* sends `[]` to clear lists. | Reject `null` for list fields (or map it to `[]`); validate subjects against `Course.code` and languages against ISO 639-1; return the full applied profile from approve. |
| B30 | 🚨 `POST /uploads/presign` signs a URL the browser cannot reach | `docker-compose.yml:121,158` (`STORAGE_ENDPOINT: http://minio:9000`); `storage/storage.service.ts:83-89` | Live: the presign response is `"url":"http://minio:9000/hifzoon/recitations/2026/…webm?X-Amz-…"`. `minio` resolves only inside the docker network, so the browser's PUT fails and **no teacher application with a recording or documents can be submitted** in the docker setup (the web now uploads via presign, M34). Same risk in any deployment where the API talks to storage on a private address. | Add `STORAGE_PUBLIC_ENDPOINT` (e.g. `http://localhost:9000` locally, the CDN/S3 host in prod) and sign upload/download URLs with a client built on it; keep `STORAGE_ENDPOINT` for server-side calls. Also add a bucket CORS rule allowing `PUT` from the web origins (MinIO is permissive by default; S3 is not). |
| B31 | Admins cannot open an application's recitation or documents | `teachers/teachers.service.ts:74,98-106,140-160` | Keys are stored in `recitationAudioUrl` / document `fileUrl` and returned raw; no route returns a signed GET (`signedDownloadUrl` is only used by the data-request worker). *Web:* the admin view shows "Stored privately (no download link from the API yet)" with the key. | Return `recitationAudioDownloadUrl` and per-document `downloadUrl` (short-lived `signedDownloadUrl`) from `GET /teachers/applications/:id`. |
| B32 | `POST /teachers/applications` accepts any string as an upload key | `teachers/teachers.controller.ts:37,43-45` | No check that the object exists (`objectExists`) or that the prefix matches its kind (`recitations/` vs `documents/`); `recitationAudioKey` has no `@MaxLength`, so old data-URL payloads up to the body limit are still stored; document values aren't checked to be strings. | Validate key format + prefix + existence; `@MaxLength(512)`. |
| Q26 | Upload size limit not enforced on the PUT | `storage/storage.service.ts:83-89` | Only `ContentType` is signed, so a client can presign with a small `size` and PUT a larger file. The web checks size before upload, but that is not a guard. | Sign `ContentLength`, or use a presigned POST policy with `content-length-range`. Minor: the extension comes from the content type, so `audio/x-wav` becomes `.x-wav`. |
| Q25 | M6 field-level errors name the wrong field for `@IsIn` / `@IsEnum` | `common/filters/all-exceptions.filter.ts:200-215` (`fieldErrors`) | The parser assumes every class-validator message is `"<constraint>: <property> …"`. Default messages are `"<property> must be one of the following values: A, B"`, so `split(': ')[1]` picks the value list. Live: `POST /scheduling/book` with a bad body returned `details: [{ field: "ONE_TO_ONE,", messages: ["roomType must be one of the following values"] }, { field: "TRIAL,", … }]`. | Use `ValidationPipe({ exceptionFactory })` and read `ValidationError.property` / `.constraints` (and `.children` for nested DTOs) instead of parsing message strings. *Web:* uses the `messages` text, so the toast is right; inline field highlighting cannot work until this is fixed. |

---

## 3. ❓ Questions to answer

| # | Question |
| :--- | :--- |
| Q9 | You flagged that USD `4900` reads as monthly while PKR `1900000` reads as annual. **Product to confirm the price list per currency and period**; the web renders whatever `GET /billing/plans` returns (`formatMoney` + `billingPeriod`). |
| M26 / §7.2 / §7.3 | Public `POST /leads` and `POST /trials/public`. Web proposal: rate-limit 5/hour per IP + per email, hCaptcha/Turnstile token in the body, create a CRM **lead only** (no provisional family; the family is created when the parent signs up from the emailed link). Please confirm or counter. |

---

## 4. 🟡 No reply yet

These were in v4.2.0 and the reply does not mention them.

| # | Need | Evidence / current workaround |
| :--- | :--- | :--- |
| M9 | Current consent policy version endpoint | The UI sends a hard-coded version. |
| M14 | Availability in a chosen time zone + DST warnings | No zone parameter on PUT availability. |
| M16 | Real video: keep the provider media token | `classroom/classroom.service.ts` returns only `url`/`expiresAt`. |
| M17 | REST attendance join; REST controls broadcast to the socket room; layout socket event; recording status in snapshot; honour `overrideReason` | `classroom.service.ts`; `classroom.gateway.ts`. |
| M19 | AI summary draft generation | Only PATCH/approve on `ai-draft` (`lessons.controller.ts`). |
| M20 | Teachers see own unshared lesson cards; supervisor pre-lock edits logged; prefill/mark for SUPERVISOR/ADMIN as decorated | `lesson-cards.service.ts`. |
| M28 | Cases: `severity`; forward-only state machine; `overdueOnly=false` coerced to true | `qa/cases.service.ts`; `qa.controller.ts` (`z.coerce.boolean()` turns `"false"` into `true`). |
| M29 | Billing: `familyBilling` returns payments + family currency; idempotent subscribe blocking duplicate live subscriptions; expose `DiscountRule` | `billing.service.ts`; `prisma/schema.prisma`. |
| M32 | Messaging: `studentName` on guardian threads, unread count, don't mark read on every GET, cursor beyond 200 | `messaging.service.ts`. |
| Q13 | Supervisor edit before lock is not written to the edit log | `lesson-cards.service.ts`. |
| M45 | The applicant's audition never becomes the profile's recitation sample | `teachers/teachers.service.ts:74` | The application stores the storage key in `TeacherApplication.recitationAudioUrl` and it is never copied to `TeacherProfile.recitationSampleUrl`, so a new teacher has no public sample unless they paste a URL. Requested: on approval, copy the key and serve it through a signed or public URL (see B31). |
| M46 | Hifz page states can be read but never change | `modules/hifz/hifz.controller.ts` (only `GET …/pages`, `GET …/pages/:n`, `POST …/initialize`) | The web now shows the 604-page Hifz map to teachers (with *Set up Hifz tracker*), parents (child → **Hifz** tab) and students. Nothing moves a page out of `NOT_STARTED`: lesson results don't feed `page_state`, and there is no write route, so every map is grey and the web says so. Requested: either the rules engine (FR-HFZ-02, stashed as `HFZ-BE-02`) updating `state`, `mistakeCountRecent`, `lastRevisedAt`, `nextDueAt`, `intervalDays` from lesson cards and mistakes, or an interim teacher/supervisor `PATCH /hifz/students/:id/pages/:n { state }` (audited). Related to M35 (deferred). |
| Q27 | Emails can't be viewed in MailHog | `config/env.schema.ts:89` (`MAIL_PROVIDER` = `log` / `file` / `resend`); `docker-compose.yml:94` | MailHog runs in docker (UI `http://localhost:8025`) but no adapter sends SMTP, so it stays empty; reset/verification mails are only in the API log or `.eml` files (`MAIL_CAPTURE_DIR`). Requested: `MAIL_PROVIDER=smtp` with `SMTP_HOST=mailhog`, `SMTP_PORT=1025` as the docker default. |
| Q15 | B7 validators are shallow (`@IsObject`/`@IsArray`): validate `rubric: Record<string, int 0..100>` summing to 100, `objectives: string[]`, `materials: Record<string, string>` | The web enforces these client-side. |

---

## 5. ⏸ Deferred by backend (WONTFIX this round)

Kept so the web's interim behaviour stays documented. Reasons are the backend's own (4.2.0 reply).

| # | Need | Backend reason | Web interim |
| :--- | :--- | :--- | :--- |
| M2, M37, §7.1 | Kids PIN login, guardian PIN management, student OTP | New auth surface; own pass | Kids login shows "not available yet". |
| M22 | Admin lists: invoices, subscriptions, payments, payroll periods, trial classes | Second release | Tools take pasted IDs. |
| M23 | Teacher reviews list; QA rubric list; QA samples list | Second release | — |
| M24 | Staff directory for assignee pickers | Second release | — |
| M25 | CRM lead detail/edit/reassign; auto-create leads | Second release | — |
| M26 | Public lead & trial intake | **QUESTION** (§3) | Booking requires sign-in. |
| M27 | Teacher profile id from an application; user roles in admin search | Second release | — |
| M30 | Payroll currency, line detail, real deductions | Second release | — |
| M31 | FAQ moderation queue + `answer` | Second release | — |
| M35 | Hifz tracker, AI coach, engagement, certificate verification | Feature areas; Hifz engine stashed (`HFZ-BE-02`) | Not shown. |
| M36 | Real payment & video providers | Needs vendor credentials | Fake adapters. |
| M38 | OAuth for 2FA-enabled accounts | Second release | Staff use password sign-in (web says so). |
| M39 | List / unlink OAuth identities | Second release | Security page can link, not list. |
| M41 | Examiner workspace (assessments) | Second release | Examiner overview "No assessments assigned yet". |
| M44 | Licensed Quran text (`quran_foundation` adapter, CR-11) | Needs a vendor key and licence | Classroom shows "Quran text is not licensed in this environment". **Action for product:** obtain a Quran Foundation API key; the web needs no change. |
| Q1 | `@Idempotent()` never enforced | Second release | — |
| Q2 | Duplicate audit rows; `DELETE /mushaf/cache` unaudited | Second release | — |
| Q4 | `skippedConflicts` counts all schedules | Second release | — |
| Q5 | Teacher changes (100) / applications (200) capped | Second release | — |
| Q8, Q12 | (carried from earlier versions) | Second release | — |
| Q14 | Open-slot dates outside requested range | Second release | Web clamps client-side. |
| Q20 | Policy pages have no CMS content | Second release | Built-in drafts marked for legal review. |
| Q22 | Password policy is length-only | Product decision | Web mirrors min 12. |
| Q23 | Orphaned session rows; no `current: true` | Second release | — |

---

## 6. Ops: OAuth deployment configuration (not code)

For Google/Apple to work in each environment:
- Register these redirect URIs with each provider: `<web-origin>/auth/oauth/google` and `<web-origin>/auth/oauth/apple` (e.g. `http://localhost:3000/auth/oauth/google`). They are Next route handlers in `apps/web`; Apple's `form_post` callback is received there.
- The web origin must be in the API's `CORS_ORIGINS` (cookie refresh **and** the OAuth redirect allow-list use it).
- Provider credentials in the API env; `GET /auth/oauth/providers` reports `configured:false` until set, and the web hides that button.
