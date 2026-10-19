# Hifzoon Frontend — Progress & Architecture Tracker

**Document Version:** 3.0.0  
**Last Updated:** 2026-10-17  
**Current Branch:** `feat-frontend-ui`  
**Location:** `apps/web/`

---

## 1. Project Overview & Boundaries

- **Focus:** Frontend Web Application (`apps/web`) built with Next.js 16 (App Router with Turbopack), React 19, Tailwind CSS v4, Lucide React, and TanStack React Query v5.
- **Backend Service:** NestJS 10 API running at `http://localhost:4000/api/v1` backed by PostgreSQL 16, Redis 7, MinIO S3, and MailHog.
- **Token & Session Architecture:** Strict in-memory session tokens with automatic `httpOnly` cookie rotation (`hifzoon_refresh`). **Zero localStorage persistence for auth tokens** per enterprise security constraints (NFR-SEC-01, NFR-SEC-04, FR-AUTH-07).
- **Design & Theming Standards:** Pure CSS custom property tokens (`bg-cream`, `text-ink`, `border-line`, `text-muted`, `bg-sand`, `bg-green-950`, `bg-green-800`, `text-gold`, `bg-gold`, `text-red`, etc.). No hardcoded arbitrary hex color strings.
- **Data Policy:** Real data only. Every list on the site (courses, teachers, plans, FAQs) comes from the live API via TanStack Query. When the API fails the screen shows a retryable error; when it has no data the screen says so. Nothing is substituted: no sample teachers, prices, FAQs, testimonials, sample portals or demo logins. Course taglines/features in `lib/data/course-editorial.ts` are editorial copy merged onto API courses by code; a course not in the API is never shown.

---

## 2. Architecture & State Management

### 2.1. TanStack React Query Layer
- Root **`QueryProvider`** in `apps/web/src/components/providers/QueryProvider.tsx` provides centralized query caching, background data revalidation, and request deduplication.
- Dedicated custom hooks in `apps/web/src/hooks/`:
  - `useAuth()`: In-memory session lifecycle, login, registration, password reset, and automatic cookie rotation.
  - `useSessions()`: Active session registry inspection and remote device termination (FR-AUTH-07).
  - `useTwoFactor()`: Staff TOTP two-factor enrollment, verification, and revocation (FR-AUTH-01); setup sends the password and disable sends a password or TOTP/recovery code for server-side re-auth.
  - `useOAuthProviders()` (`components/auth/OAuthButtons.tsx`): configured Google/Apple providers for sign-in and account linking.
  - `useCourses()`: Caches and returns active course catalog with syllabus metadata.
  - `useTeachers(genderFilter)`: Filters and provides vetted faculty directory.
  - `usePlans()`: Multi-currency tuition plans and pricing tiers.
  - `useFaqs()`: Approved knowledge base FAQ accordion records.

### 2.2. Professional Naming Standards
All previous informal prefixes (`mock`, `matchedMock`, `realData`, `liveData`) have been refactored into domain-driven nomenclature across both production code and test suites:
- `COURSE_EDITORIAL`, `COURSE_IMAGE_ASSETS` (editorial copy and images only — see Data Policy), `persistedCoursesEnvelope`, `curatedFaqPayload`, `syntheticServerEnvelope` (test fixtures).
- `persistedCoursesEnvelope`, `persistedFacultyEnvelope`, `persistedPlansEnvelope`, `curatedFaqPayload`, `syntheticServerEnvelope`

---

## 3. Backend API Integration

The hand-maintained matrix that used to live here listed several endpoints that do not exist in the backend. It is replaced by two generated / evidence-based documents:

- **[`api-coverage.md`](./api-coverage.md)** — every backend route read from the NestJS controllers, matched against the web API layer, with access roles, the web module that calls it, the screens that use it and any known backend issue. (A snapshot; the generator script was removed on 2026-10-19.) Current result: **163 of 168 endpoints used (97%)**; the five unused are the two Docker health probes and three signed provider webhooks (server-to-server); **0** web calls without a matching backend route.
- **[`backendrequirement.md`](./backendrequirement.md)** — backend fixes the web team needs (security, broken endpoints, missing endpoints), each with file:line evidence.

## 4. Routes by Portal

All portal routes are role-guarded (`ProtectedRoute` in `PortalShell`); `/dashboard` sends each user to their own portal. Global `not-found`, `error` and `global-error` pages share `components/errors/StatusPage.tsx`, which is also used for the 401/403 states.

| Area | Routes |
| :--- | :--- |
| Public site & auth (19) | `/`, `/apply-teacher`, `/auth/complete`, `/book-trial`, `/child-safety`, `/courses`, `/courses/[code]`, `/forgot-password`, `/login`, `/pricing`, `/privacy`, `/refunds`, `/register`, `/reset-password`, `/resources`, `/resources/[slug]`, `/teachers`, `/teachers/[userId]`, `/terms` |
| Role router (1) | `/dashboard` |
| Account (inside portal) (1) | `/account/security` |
| Family (guardian) (12) | `/parent`, `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success`, `/parent/children`, `/parent/children/[studentId]`, `/parent/classroom/[classId]`, `/parent/messages`, `/parent/messages/[threadId]`, `/parent/notifications`, `/parent/privacy`, `/parent/timetable` |
| Student (3) | `/student`, `/student/classroom/[classId]`, `/student/notifications` |
| Teacher (14) | `/teacher`, `/teacher/availability`, `/teacher/classes/[classId]/brief`, `/teacher/classroom/[classId]`, `/teacher/classroom/[classId]/lesson-card`, `/teacher/lesson-cards/[lessonCardId]`, `/teacher/messages`, `/teacher/messages/[threadId]`, `/teacher/notifications`, `/teacher/payslips`, `/teacher/profile`, `/teacher/students`, `/teacher/students/[studentId]`, `/teacher/timetable` |
| Quality & supervision (9) | `/supervisor`, `/supervisor/applications`, `/supervisor/applications/[id]`, `/supervisor/cases`, `/supervisor/cases/[id]`, `/supervisor/lesson-cards/[lessonCardId]`, `/supervisor/reviews`, `/supervisor/teachers`, `/supervisor/teachers/[teacherId]` |
| Safeguarding (3) | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla` |
| Academy admin (15) | `/admin`, `/admin/audit`, `/admin/billing`, `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm`, `/admin/payroll`, `/admin/scheduling`, `/admin/settings`, `/admin/teacher-changes`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/admin/trials`, `/admin/users` |

**Total:** 77 routes, plus the OAuth redirect route handler `/auth/oauth/[provider]` (GET for Google, form POST for Apple).

Known limits that come from the backend (details in `backendrequirement.md`): student self-access (M7), Kids Mode PIN login (M2), file/audio uploads (M34), `GET /teachers/me` (M1), teacher reassignment on teacher-change (B10), real video and payment providers (M16, M36), licensed Quran text provider (Q8).

---

## 5. Testing

| Suite | Command | Scope |
| :--- | :--- | :--- |
| Unit & component (Vitest + Testing Library/jsdom) | `npm run test --workspace @hifzoon/web` | 55 files · 409 tests: every API module (URL, method, body, headers, error paths), key forms and screens, toasts, route links |
| Live integration (real API, seeded DB) | `npm run test:integration --workspace @hifzoon/web` | 10 suites in `tests/integration/` exercising each portal's endpoints end-to-end |

Unit test folders: `admin-ops`, `admin-system`, `api`, `auth`, `billing`, `booking`, `cases`, `classroom`, `content`, `courses`, `lessons`, `messaging`, `notifications`, `parent`, `pricing`, `qa`, `student`, `teacher`, `teachers`.

Quality gates at time of writing (2026-10-17): `tsc --noEmit` 0 errors · all 409 unit tests pass (the two heaviest form suites have a 15 s per-test budget) · ESLint: 4 pre-existing `react-hooks/set-state-in-effect` errors in `apply-teacher/page.tsx:81`, `CourseDetailView.tsx:389`, `PhoneInput.tsx:90` and `CurrencyContext.tsx:26` (the apply-page one predates this sprint; no new lint errors).

---

## 6. UI System & Recent Changes (2026-10-15)

| Area | What changed |
| :--- | :--- |
| Feedback | All errors and confirmations are toasts (site-wide provider); load failures show a compact Retry; invalid fields are outlined red. |
| Selects | Every `<select>` (76) replaced by the React `Select` (react-select): keyboard-friendly, searchable for long lists, menus portalled above dialogs. |
| Status pages | Shared 404 / 500 / 401 / 403 pages (`components/errors/StatusPage.tsx`). |
| Session boot | `AuthBootSplash` removes the header flicker on first load (logo with progress ring, max 4 s). |
| Account security | Lives inside the user's portal. 2FA shows a QR code + copyable key + recovery codes; the password is verified with a throwaway sign-in because the backend ignores it (backend S16); turning 2FA off needs password + current code; guardians/students see that 2FA is staff-only. |
| Portals | Fixed sidebar (does not scroll with content), logo block aligned with the top bar, portal badge removed; multi-role users get links to their other portals. `/portal-preview` was visitor-only sample data *(removed 2026-10-17, see §10)*. |
| Public site | Header/body alignment via `.site-container`; nav: Home · Courses · Faculty · Pricing · Resources · Parent portal; USD-only pricing with centred responsive plan cards; programme card numbers removed; policy pages (`/privacy`, `/terms`, `/refunds`, `/child-safety`) load from the CMS or show an SRS-based draft marked for legal review (CR-13). |
| Homepage classroom | `ClassroomLiveSection`: a passive, auto-playing class in a 16:10 laptop frame — meeting chrome, teacher/student/parent tiles, Surah Al-Ikhlas (verbatim, `classroom-demo/verses.ts`) with a word-by-word highlight, a mistake tagged in ayah 2 and the lesson-card counter. Revert: swap back to `ClassroomSection` in `src/app/page.tsx`. |
| Dev environment | Tailwind's Turbopack loader limited to non-foreign CSS (fixes the `next/font` "queries have exactly one entry" error); `suppressHydrationWarning` on `<html>/<body>` for browser-extension attributes (the "Unexpected Fiber popped" console error came from the ColorZilla extension). |

---

## 7. UI System & Engineering Sprints (2026-10-16)

| Deliverable | Technical Implementation |
| :--- | :--- |
| **Live Classroom Quran Mushaf** | Resolved classroom structure fallback on `/student/classroom/[sessionId]`. Integrated authentic Uthmani Quran dataset (`apps/api/src/integrations/quran-data.ts`) with Amiri font rendering, gold ayah end markers (`۝`), interactive word selection, Tajweed rule highlighting (Ghunnah, Qalqalah, Ikhfa, Idgham, Madd), and reference recitation audio player. |
| **11 Vetted Faculty Directory** | Seeded 10 new male and female teachers (11 total: 6 Ustadh, 5 Ustadha) respecting DB invariant trigger `FR-TCH-02`. Added curated portraits to `apps/web/public/teachers/*.jpg` mapped to `TeacherProfile.photoUrl`. Enabled gender filter tabs, search, and bio popovers on `/teachers`. |
| **Global Currency Architecture** | Relocated currency picker from plan cards to the top announcement bar (`bg-green-950`) via `HeaderCurrencyPicker.tsx` and mobile drawer. Created `CurrencyContext.tsx` with `localStorage` persistence across 6 currencies (`USD`, `GBP`, `CAD`, `AUD`, `AED`, `PKR`). Stripped awkward `.00` decimals from pricing. |
| **Layout & Header Alignment** | Enforced strict header container alignment across all pages. Performed full-width responsive redesigns for Course Detail (`/courses/[slug]`), Post-Trial Placement (`/post-trial-placement`, *removed 2026-10-17*), and Resources/Blog (`/resources/how-long-does-hifz-take`). Standardized legal pages (`/child-safety`, `/privacy`, `/terms`, `/refunds`). |
| **FAQ Accordions & Resource Forms** | Replaced `x` icons with centered `+` / `−` indicators in FAQ components. Repositioned the inquiry form full-width directly below the FAQ accordion. |
| **Teacher Audition Voice Recording** | Integrated HTML5 `MediaRecorder` audio recording directly on `/apply-teacher` with microphone permission prompts, live timer, status indicator, and playback review. Added fallback file uploader (`.mp3`, `.wav`, `.m4a`, `.webm`). Replaced stretching select dropdowns with custom styled select menus. |
| **Multi-Role Login & Kids Mode** | Added quick-fill demo account switcher for Parent, Student, Faculty, and Staff on `/login`. *(Superseded 2026-10-17: the Kids PIN mode was a placeholder that signed in with hard-coded demo credentials and has been removed; see §8.)* |

## 8. Backend integration sprint (2026-10-17)

Merged `feat-webhooks` (security hardening `7a7a543`, OAuth `4c5c55f`, webhooks, MinIO). Every requirement in `backendrequirement.md` was re-verified against the code: **24 items resolved** (11 security, 10 broken, M3, M4, M33), the rest re-stated with current evidence, and 9 new items raised (S19, B16–B18, M38–M39, Q15–Q17). §6 of that document lists where `docs/FRONTEND-DIRECTION.md` disagrees with the code. Since v4.0.0 it lists open requests only.

| Area | What changed |
| :--- | :--- |
| **Google / Apple sign-in (M3)** | "Continue with Google/Apple" on `/login` and `/register` (guardian), "Link Google/Apple" on `/account/security`; only providers reported `configured` are shown. Redirect handler `app/auth/oauth/[provider]/route.ts` accepts Google's GET and Apple's `form_post`, then `/auth/complete` exchanges `code` + `state` once. `OAUTH_LINK_REQUIRED`, `OAUTH_STATE_INVALID`, `TWO_FACTOR_REQUIRED` and provider errors have specific messages. |
| **2FA login (M4, B15)** | Two-step login branches on `TWO_FACTOR_REQUIRED` (ask for a code) vs `INVALID_TWO_FACTOR_CODE` (wrong code, stay on step 2); recovery codes accepted. Removed the message-text heuristics and the inline staff code field. |
| **2FA setup / disable (S16)** | Password (setup) and password or TOTP/recovery code (disable) go to the API, which re-checks them; the throwaway-login workaround is gone. A 401 for a wrong secret no longer triggers a silent token refresh. Recovery codes are flagged as shown once. |
| **Kids Mode** | Removed the placeholder PIN sign-in (it used hard-coded demo credentials). The tab explains that PIN sign-in is not available yet (backend M2). Demo-account quick-fill is shown in development builds only. |
| **Access errors** | `ErrorState` shows "You don't have access to this" for 403 (incl. the new `NOT_RESOURCE_OWNER` checks) and "Not found" for 404, without a Retry. |
| **Teacher identity (B3, M1)** | The teacher profile id falls back to `GET /teachers/public/:userId`, so approved teachers with no students can use timetable/availability. Profile screen trusts the public profile (no more name matching). |
| **Course admin (B7, B12)** | Level rubric (`criterion: weight`, sums to 100), lesson objectives (one per line) and materials (`label: value`) are saved; enrolments can be marked COMPLETED. |
| **Scheduling (B11)** | Open slots are sorted by start time in every API wrapper (the API returns truncated results in teacher order). |
| **Teacher application (B9, M34)** | Recorded/uploaded auditions are sent once (no longer duplicated into `qualifications`) and capped at ~1.4 MB to fit the API's 2 MB body limit, with a clear message; documents wait for an upload endpoint. |
| **Errors & notifications** | Zod validation `details` (`[{ path, message }]`) display as text; notification statuses `DELIVERED`/`READ` have badge tones. |
| **Docs** | `backendrequirement.md` v3.0.0 (structured for backend replies per ID), `api-coverage.md` regenerated (168 routes; webhooks explained). |

## 9. Select alignment & API surface audit (2026-10-17)

| Area | What changed |
| :--- | :--- |
| **Select alignment (site-wide)** | `TimezoneSelect` and `CurrencySelect` replaced react-select's `SingleValue` with a bare `<div>`, which fell into a second grid row under the search input (value sat below centre; zone name truncated to "A…"). Both now wrap `components.SingleValue`. All four select controls (`select.tsx`, `CountrySelect`, `CurrencySelect`, `TimezoneSelect`) pin placeholder, value and input to react-select's own cell (`grid-area: 1/1/2/3`) instead of a partial `col-start/row-start` override that depended on stylesheet order. The timezone control shows the full zone name + offset ("detected" stays in the menu). Verified headless: every public-page select is centred (0 px offset). |
| **Public teacher profile** | New `/teachers/[userId]` (`GET /teachers/public/:userId`): intro video (inline for video files, link otherwise), bio, subjects, languages, age groups, teacher time zone, live rating distribution and a trial CTA. Directory cards link to it (`userId` is now kept from the list). |
| **Live ratings** | Cards, the profile page and the parent dashboard use `GET /quality/teachers/:id/rating` ("4.6 · 23 family ratings", hidden at 0) instead of the seed-only `publicRatingAvg`; the teacher's own profile no longer shows that stale figure (backend Q18). |
| **Directory filters** | Language and subject selects on `/teachers`, built from the listed teachers. |
| **Notifications** | Inbox loads the newest 100 with "Latest 100 of N" (the API's paging is broken, backend B19); delivery status is a toned badge (DELIVERED/READ green, FAILED red) with the sent time for email/WhatsApp. The push toggle is labelled "Mobile app push (in-app inbox is always on)" — no web push is wired. |
| **Teacher → student** | Mistake history (type/date filters) on `/teacher/students/[studentId]`, reusing the parent component. |
| **Parent** | Hifz goal pace ("≈ 4.3 lines a day to finish on time", red when behind), "N resolved this week" on mistakes, teacher avatar and link to the teacher's public profile, consent history (grant/withdraw timeline with reasons) on the privacy page. |
| **Admin** | Matching suggestions as ranked cards (reasons, rating with count, available weekdays, zone) with "Use"; read-only notification channels and quiet hours in the user drawer. |

## 10. Demo & mock data removed (2026-10-17)

| Removed | Replaced with |
| :--- | :--- |
| Offline fallback catalogue (`lib/data/baseline-catalog.ts`, `mock-data.ts`): 10 invented teacher profiles with ratings, indicative plan prices, FAQ answers, parent testimonials | Fetchers throw on failure and return `[]` when empty; `PublicLoadState` shows loading / "couldn't load — Try again" / an honest empty message on `/courses`, `/teachers`, `/pricing`, home faculty, pricing and FAQ sections. Editorial course copy moved to `lib/data/course-editorial.ts`. |
| Homepage testimonials (`TestimonialsSection`, invented parent quotes) | Section removed. |
| `/portal-preview` (sample family "Rayan/Zoya") and `/post-trial-placement` (invented placement report) | Pages removed; "Request level assessment" CTAs go to `/book-trial`; header "Diagnostic Placement Card" link removed. |
| Login quick-fill demo accounts (seeded emails + password in the bundle) | Removed in every build. |
| Unused home components with sample data (`ClassroomSection`, `HifzTrackerPreview`, `InteractiveClassroomDemo`, `TeacherSpotlightSection`, `CourseCatalogSection`) | Deleted. |
| Homepage illustrations (animated classroom, Hifz tracker card) | Kept as product illustrations, now labelled ("Illustration of a Hifzoon class. Names are examples…", "Student portfolio · Illustration"). |

Kept on purpose: the seeded-login list below (documentation for local development). `scripts/demo-data.ts` was removed on 2026-10-19; local data comes from `npm run db:seed`.

New tests: `tests/auth/login-2fa.test.tsx`, `tests/auth/oauth.test.ts`, `tests/home/public-data.test.tsx`, `tests/home/sprint-coverage.test.tsx`, `tests/courses/course-content-parsers.test.ts`, plus updated fallback tests (courses, teachers, plans, FAQs now assert a real error / empty list) and a suggestion-card case in `tests/admin-ops/schedule-builder.test.tsx`.

## 11. Sign-in destination & signup (2026-10-17)

| Area | What changed |
| :--- | :--- |
| **Post-login redirect** | Signing out of a portal used to leave `/login?redirect=/admin/…` (the route guard treated the sign-out like an expired session), so the next account — e.g. a teacher — was sent to the admin page and got a 403. Now an explicit sign-out goes to a plain `/login`, and every sign-in (password, 2FA, OAuth, already-signed-in visit to `/login`) uses `postLoginDestination()` (`lib/portal/nav.ts`): a `?redirect=` is honoured only if the new account's roles can open it, otherwise the user lands on their own portal. Expired sessions still return to the page they were on. |
| **Signup** | Removed "Preferred Interface Language" from `/register`; accounts take the backend default (`en`). |
| **Google / Apple buttons** | Shown only when `GET /auth/oauth/providers` reports a configured provider. They stay hidden until the API runs the new build (rebuild `@hifzoon/shared` first) **and** `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (and the Apple keys) are set in `apps/api/.env` — see `backendrequirement.md` §7.6. |

## 12. Trials, classroom and teacher views (2026-10-17)

| Area | What changed |
| :--- | :--- |
| **Booking: teacher choice** | Step 1 has a *Teacher (optional)* dropdown listing only the chosen course's teachers (and the Ustadh/Ustadha filter); picking one shows only their times. |
| **Booking: missing slots** | With 11 teachers, times silently disappeared (the API truncates at `limit` in teacher order, B11). The request now sends the course id when the course has teachers and a limit that covers every teacher. |
| **Teacher timetable** | Redesigned: week summary (classes, teaching time, next class with *Open classroom*), 7-day calendar with today highlighted, cards with time · student · course · Trial label · Live/Done status and a *Join* button, legend, phone agenda; updates every 30 s. |
| **Teacher students** | New *Trial students* section (from upcoming trial classes) — trials have no enrolment (B28). |
| **Parent timetable** | *Join to watch* on each class while the room is open; "Join opens at …" before that. |
| **Classroom** | Single student shown as a field in *Log mistake*; a trial 403 explains the cause; *AI flags* tolerate a per-student 403. |
| **Local data** | 10 more approved teachers (6 Ustadh / 5 Ustadha in total with Bilal) with portraits, subjects, zones and availability (local DB only; script in the session scratchpad). |
| **Backend** | `backendrequirement.md` v4.2.0: **🚨 Fix first** list; S12 reproduced (other family's parent gets a viewer token); new B25–B28, M44. Ownership checks: `audit.md` §12. |


## 13. Backend v4.2.0 reply integrated (2026-10-18)

Merged `origin/feat-webhooks` (`628c3fd`), rebuilt docker + re-seeded, and checked the backend's FIXED claims with 28 live API checks (27 pass) plus code reads. Details and the remaining asks: `backendrequirement.md` v4.3.0.

| Area | What changed |
| :--- | :--- |
| **Staff 2FA (M42)** | A restricted staff session (`TWO_FACTOR_ENROLMENT_REQUIRED`) sends the user to Account → Security, which explains why; finishing enrolment lifts it. |
| **Teacher identity (M1)** | The teacher portal resolves the profile id from `GET /teachers/me`, so newly hired teachers (no students yet) can use timetable and availability. |
| **Teacher profile (B2)** | Languages, subjects (from the course catalogue) and age groups can be changed; only changed fields are sent; "Awaiting review" comes from the API's pending changes. |
| **Recitation sample (§7.4)** | Teacher cards play the live sample; the teacher page has a *Listen to a recitation* player (http(s) only). |
| **Teacher application (M34)** | Audio and optional documents (ID, certificate, reference, background check) upload straight to storage via `POST /uploads/presign`; the 1.4 MB inline-audio workaround is gone. Admin view shows stored keys (no download route yet, B31). ⚠ In docker the signed URL uses `http://minio:9000`, which the browser can't reach (B30). |
| **Booking (B11, S15)** | Chosen teacher sent as `teacherId`; consent method `OTHER`. |
| **Timetables (M43, S7, S8, B16)** | Course name per class, *Rate* only when `canRate`, "Rated" marker; cancel sends `{ reason }`; on-time family cancellations earn a make-up credit (copy + toast). Cancelled classes get a red badge. |
| **Teacher change (B10, M15)** | Admin approval sends the new teacher and moves future classes; parents see their request status and can't file a duplicate while one is open. |
| **Billing (B22)** | Subscribing shows the first invoice number and amount, ready to pay. |
| **Notifications (B19)** | Inbox pages again (20 per page) and shows why a delivery failed or was skipped. |
| **Errors (M6, Q16)** | Field-level validation messages shown in toasts; `REAUTH_REQUIRED` handled as a credential error. |
| **Tests** | 463 passing (65 files); `tsc` clean. |


## 14. Remaining API routes, Hifz map and the 2FA redirect fix (2026-10-19)

Pulled `feat-webhooks` again: docs-only (`b3d7406`, `7aab70d` removed four root docs). Re-read the removed `FRONTEND-DIRECTION.md`, `EXTERNAL-PROVIDERS.md`, `Hifzoon-STATUS.md` and the 4.2.0 reply from history (`628c3fd`); everything they describe is in the web. The web now calls **170 / 174** routes; the 4 left are provider webhooks (server-to-server).

| Area | What changed |
| :--- | :--- |
| **Hifz tracker (HFZ-BE-01)** | New 604-page map grouped by 30 juz: state colours (Not started / Learning / Fragile / Solid), counts you can tap to highlight, pages due for revision ringed, page detail (recent mistakes, interval, last/next revision). Teacher → student page (with *Set up Hifz tracker* and *Add missing pages*); parent → child → **Hifz** tab; student portal. Uses `GET /hifz/students/:id/pages`, `GET …/pages/:n`, `POST …/initialize`. Pages can't change state yet (M46), and the map says so. |
| **Student portal (M7)** | *Your courses* lists the student's own enrolments (teacher, level, lesson). |
| **System health** | Admin overview card from `GET /health/live` + `/health/ready`: API uptime, database and Redis status with latency, refreshed every 30 s. |
| **Bug: stuck on Account security** | Signing in as a staff account without 2FA and then as a parent in the same tab sent every page to `/account/security`: the restricted-session flag lived in memory and survived sign-out. It now resets on sign-out and on every new session, and the redirect applies only to staff without 2FA. |
| **Notifications: "undefined" text** | A class reminder showed "Class tomorrow: undefined … Join: undefined" (backend B34: the worker's reminder omits the template's fields). The bell, inbox and student home now ignore backend text containing `undefined`/`null` and build it from the payload (course, teacher, start time). |
| **Reminder join link** | New `/classroom/:id` page (the link reminders send) opens the teacher, student or parent classroom by role. |
| **Tests** | 480 passing (69 files); `tsc` clean. New: `tests/hifz/hifz.test.tsx`, `tests/admin-ops/system-health.test.ts`, `tests/auth/two-factor-enrolment-flag.test.ts`, `tests/parent/classroom-link.test.ts`. |

---

*Seeded logins (password `Hifzoon!Dev2026`): parent@, teacher@, admin@, superadmin@, supervisor@, safeguarding@, examiner@, student@ — all `@hifzoon.test`.*
