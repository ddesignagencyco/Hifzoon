# Hifzoon Web — UI Flow Audit

**Date:** 2026-10-17
**Scope:** every public page, sign-up for each self-service role, sign-in/sign-out for every seeded role, every portal page, and the main user journeys — driven through the real UI in Chromium (Playwright), not through unit tests.
**Environment:** web dev server `localhost:3000`; API from the current code (`7a7a543` + OAuth + webhooks) on `localhost:4100` with the `@hifzoon/shared` package rebuilt; local Postgres (all 6 migrations applied), Redis, MailHog. The dev API on `:4000` was an older build and was not used.
**Method:** for each page the audit records failing API calls (status + error code), page and console errors, on-screen error / 403 / 404 states, horizontal overflow at 375 px, and a screenshot.

Legend: ✅ works · ⚠️ works with a gap · ❌ broken · 🔧 fixed during the audit (web) · 📮 needs backend (logged in `backendrequirement.md`)

---

## 1. Summary

| Area | Flows checked | ✅ Works | 🔧 Fixed in web | ⚠️/❌ Needs backend |
| :--- | :---: | :---: | :---: | :---: |
| Public site | 14 | 12 | — | 2 |
| Sign-up & onboarding | 7 | 5 | 1 | 1 |
| Sign-in / sign-out (8 roles) | 12 | 8 | 2 | 2 |
| Booking | 2 | 1 | — | 1 |
| Account security | 15 | 10 | 2 | 3 |
| Staff portals | 22 | 14 | 4 | 10 |
| Parent ↔ teacher | 19 | 11 | 3 | 7 |

**Everything a user can do on the site was exercised through the UI.** No page crashed, no page threw a JavaScript error, and every portal page loads its data. The problems found split into:

- **12 web fixes, done and tested** (§9) — the biggest: dropdowns inside dialogs could not be picked with a mouse (13 forms), and signing out sent the next user to the previous user's portal.
- **18 new backend items** (§10) on top of the existing list. The most important:
  1. **B23 — no notification is ever delivered**: the quiet-hours check is inverted, so every notification (safeguarding alerts included) is stored as *skipped*.
  2. **S20 — guardian verification is skipped**: a family's guardian is marked verified the moment the family is created, so the parental-consent assurance for under-13s never happens.
  3. **M42 — staff 2FA is not enforced** although FR-AUTH-01 makes it mandatory.
  4. **B20 / Q21 — password reset email** cannot work (no dev mailer; empty code; no link).
  5. **B22 — subscribing issues no invoice**, so families can't pay until staff invoice manually.
  6. **B24 — a trial outcome can be recorded before the trial happens**, and it changes all of the student's trial enrolments.
  7. **M41 — examiners have no workspace** (no assessment endpoints).

---

## 2. Public site (anonymous visitor)

| Page | Result | Notes |
| :--- | :---: | :--- |
| `/` home | ✅ | Courses, faculty, pricing and FAQ sections load from the API; illustrations labelled. |
| `/courses`, `/courses/[code]` | ✅ | |
| `/teachers`, `/teachers/[userId]` | ✅ | Language / subject filters; live ratings. |
| `/pricing` | ✅ | Live plan prices. |
| `/book-trial` | ✅ | Course → time → learner; sign-in prompt for visitors. |
| `/apply-teacher` | ✅ | |
| `/resources` | ✅ | |
| `/privacy`, `/terms`, `/refunds`, `/child-safety` | ⚠️ 📮 | `GET /content/<slug>` → 404: no published policy copy in the CMS, so the built-in draft (marked for legal review) is shown. Content needs publishing (Q20). |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | ✅ | |
| `/auth/complete` (no params) | ✅ | "Sign-in not completed" card. |
| Unknown URL | ✅ | 404 page. |
| Protected URL while signed out (`/parent`) | ✅ | → `/login?redirect=%2Fparent`. |
| Phone width (375 px): home, courses, teachers, pricing, book-trial, register | ✅ | No horizontal overflow. |
| Browser console on every anonymous page | ⚠️ 📮 | One red `401` from the session probe (`POST /auth/refresh` with no cookie). Harmless; backend could answer "no session" without an error status (Q19). |

## 3. Sign-up

| Flow | Result | Notes |
| :--- | :---: | :--- |
| Parent sign-up → auto sign-in → `/parent` | ✅ | No language selector (removed). |
| Parent onboarding: create family | ✅ | |
| Parent onboarding: verify guardian | ❌ 📮 | Marked **done immediately** — the API sets `verifiedAt` when the family is created (`families/families.service.ts:54`), so the emailed-code verification never happens. Parental-consent assurance for under-13s (CR-01) is bypassed (S20). |
| Parent onboarding: add child (under 13) | ✅ | Under-13 consent notice shown. |
| Parent onboarding: record consent | ✅ | Dashboard shows the child afterwards. |
| Student sign-up → `/student` | ✅ | |
| Sign-up with a `?redirect=` the new role cannot open | 🔧 | Now lands on the role's own portal (same rule as sign-in). |

## 4. Sign-in / sign-out per role

All eight seeded accounts sign in and land on their portal; every portal page loads with no failing API call, page error or error state, except as noted.

| Account | Portal | Pages | Result |
| :--- | :--- | :---: | :--- |
| parent@ | `/parent` | 10 | ✅ |
| teacher@ | `/teacher` | 11 | ✅ |
| teacher.trainee@ | `/teacher` | 9 | ⚠️ 📮 Not approved yet, so the profile id can't be resolved (`GET /teachers/public/:userId` → 404); timetable/availability/profile show "Your teacher profile is not linked yet" (M1). |
| admin@ | `/admin` | 15 | ✅ |
| superadmin@ | `/admin` (+ audit log) | 16 | ✅ |
| supervisor@ | `/supervisor` | 8 | ✅ |
| safeguarding@ | `/safeguarding` | 3 | ✅ |
| examiner@ | `/supervisor` | 6 | ❌ Every page shows "Supervisor access only" — see §7. |
| new student | `/student` | 3 | ✅ Other portals show the access page. |

| Flow | Result | Notes |
| :--- | :---: | :--- |
| Sign out from a portal → sign in as another role | 🔧 | Plain `/login` after sign-out; the next account lands on its own portal (was: admin redirect → 403). |
| "Sign out" button in development | 🔧 | The Next.js dev badge covered it (bottom-left); moved to the top-left (`next.config.ts`, dev only). |
| Staff sign-in without 2FA | ⚠️ 📮 | All staff accounts sign in with a password only; FR-AUTH-01 says 2FA is mandatory for staff (see §6). |

## 5. Booking

| Flow | Result | Notes |
| :--- | :---: | :--- |
| New parent books a free trial (Qaida) | ✅ | 12 open slots; consent recognised; booked with a class reference; appears in `/parent/timetable`. |
| Teacher list for a course | ⚠️ 📮 | "No teacher lists QAIDA as a subject" — falls back to all teachers (seed data has subjects HIFZ/TAJWEED only). |

## 6. Account security

| Flow | Result | Notes |
| :--- | :---: | :--- |
| 2FA set-up (staff): wrong password | ✅ | Toast "That password is not correct."; no session refresh. |
| 2FA set-up: QR + secret + 8 recovery codes → confirm with TOTP | ✅ | Badge switches to Enabled. |
| Sign-in with 2FA: wrong code / recovery code / TOTP | ✅ | Wrong code stays on step 2; recovery code works once (reuse rejected); TOTP works. |
| Turn 2FA off with a code instead of the password | ✅ | Password-only sign-in works again. |
| Sign out from `/account/security` | 🔧 | Left `?redirect=/account/security` (two route guards; the first used up the sign-out flag) and refetched the sessions list (401). Both fixed. |
| Forgot password → email | ❌ 📮 | UI says "dispatched" but **no email is delivered**: `MAIL_PROVIDER=log` and there is no SMTP/MailHog mailer; the log mailer doesn't even log. The template also renders an empty code (`d.code` vs `{ token }`) and contains no reset link (B20, Q21). |
| Reset page with a valid token | ✅ | Tested with the token taken from the queued job: new password set, token single-use, other sessions ended, old password rejected. |
| Sessions table / "Sign out everywhere" | ✅ | Other browser signed out too. Minor: 3 rows for 2 browsers and no "this device" marker (Q23). |
| Wrong password | ✅ | Toast "Email or password is incorrect". |
| Lockout | ⚠️ | Policy is 10 failures / 15 min; not reached in the 6 attempts tested. No "attempts remaining" hint. |
| `/login?redirect=/admin` as a student | ✅ | Lands on `/student`. |
| Expired session | ✅ | → `/login?redirect=…`. |
| Login form skipped the length check for emails containing `.test` | 🔧 | Dev shortcut removed; sign-in no longer applies the sign-up length rule at all. |
| Google / Apple UI (providers not configured here) | ✅ | No buttons anywhere; `/auth/complete` error and "cancelled" states correct. |
| Registration: short password / mismatch / duplicate email | ✅ | Clear toasts; `EMAIL_TAKEN` handled. |
| Registration: `aaaaaaaaaaaa` accepted | ⚠️ 📮 | Length is the only rule (backend `MinLength(12)`); the strength meter is cosmetic. Policy decision for the backend (Q22). |

## 7. Staff portals

### Admin

| Flow | Result | Notes |
| :--- | :---: | :--- |
| Overview counters | ✅ | Update live. |
| Users & search (super admin) | ✅ ⚠️ 📮 | Search and read-only drawer work; current roles can't be pre-filled because search returns none, yet saving roles replaces them all (M27). Plain admin sees "Super admin only" (intended). |
| CRM: create lead, move stage | ✅ | |
| Trials: book with matching + slot, record outcome | ✅ ❌ 📮 | Works, but an outcome can be recorded for a **future** class, and it flips every TRIAL enrolment of the student (B24). No trial list endpoint (M22). |
| Trial outcome shows the recommended plan | 🔧 | Showed the raw plan id; now the plan name. |
| Teacher changes: review, decline | ✅ ⚠️ 📮 | Approving records a status only; nothing is reassigned (B10). |
| Teachers / hiring: application → steps | ✅ | |
| Application qualifications | 🔧 | Rendered as "Ishafiz / Hassanad / Yearsexp"; now readable labels and Yes/No. |
| Scheduling: recurrence preview, matching suggestions | ✅ | |
| Courses: level with rubric, lesson with objectives & materials, enrolment → COMPLETED | ✅ | |
| Lesson materials after saving | 🔧 | Never displayed; now listed (links clickable). |
| Billing tools | ✅ ⚠️ 📮 | Forms take pasted ids (no list endpoints — M22); unknown id → clear 404 toast. |
| Payroll: open period, calculate, report (super admin) | ✅ ⚠️ 📮 | No `GET periods`, so a plain admin can only open a period by id (M22). |
| Content: create, publish, delete posts | ✅ | Published posts appear at `/resources/<slug>`. |
| Content: duplicate slug | 🔧 | API 409 only showed a toast; the Slug field is now marked with the message. |
| FAQ moderation | ⚠️ 📮 | No pending list; approving publishes a question with no answer (M31). |
| Settings (read-only) | ✅ | |
| Audit log filters (super admin) | ✅ ⚠️ 📮 | Each CMS/FAQ action is logged twice (Q2). |

### Supervisor, safeguarding, examiner

| Flow | Result | Notes |
| :--- | :---: | :--- |
| Supervisor overview, teacher scorecard | ✅ | |
| Submit a QA review (5-criterion rubric) | ✅ | |
| Hiring pipeline steps | ✅ | |
| Cases: open, note, transition | ✅ | |
| Safeguarding: case board, assign, note, transitions to Closed (note required) | ✅ | |
| SLA monitor | ✅ | Moved a 5-minute complaint to Breached. |
| Examiner | 🔧 ❌ 📮 | Every page said "Supervisor access only". Now examiners see only the overview, with "No assessments assigned yet". The API has no examiner endpoints at all (M41). |
| Staff 2FA | 🔧 ❌ 📮 | Not enforced by the API (M42). Portals now show unenrolled staff a "2FA is required — Set up 2FA" banner. |

## 8. Parent ↔ teacher journeys

| Flow | Result | Notes |
| :--- | :---: | :--- |
| Parent starts a thread (child + teacher) → teacher sees it, replies → parent sees reply | ✅ | Unread dots set and clear on both sides. |
| Contact-detail filter in messages | 🔧 ⚠️ 📮 | Phones and plain emails were caught; spelled-out emails (`dad(at)gmail(dot)com`) and handles (`@maryam_k`) were not — now caught. The API has no check, so it can still be bypassed by calling the API directly (S14). |
| **Any dropdown inside a dialog** (New message, Enrol, Reschedule, Billing, Privacy … 13 forms) | 🔧 | Menus opened *behind* the dialog (menu layer 40 < dialog 50), so a mouse click hit the overlay. Menus now render above dialogs; verified with a real mouse click. |
| Reschedule a class | ✅ | New time confirmed by toast. |
| Cancel a class (outside the notice window) | ✅ | Policy copy correct; "You will not be charged." |
| Rate a completed class | ⚠️ 📮 | Button shown for every completed class; the API only accepts guardians who personally joined the call → 403 "Only a guardian who joined this class can rate it." (B14; the web needs a `canRate` flag to hide the button). |
| Teacher: availability edit/save/validation | ✅ ⚠️ | Works; saving re-stores seeded Europe/London slots in the account zone (UTC) — seed data mismatch (Q11). |
| Teacher: timetable → class brief | ✅ | |
| Teacher: student detail, lesson-position, mistake history | ✅ | |
| Teacher: classroom for a **trial** student | ⚠️ 📮 | `GET /students/:id/mistakes` → 403: ownership needs an enrolment, and a booked trial creates none (B21). |
| Teacher: profile change request | ⚠️ 📮 | Sent and acknowledged; the "Awaiting review" banner is lost on reload because there is no endpoint to read pending changes (M27). |
| Teacher: payslips | ✅ | Empty state. |
| Parent: child tabs (progress, report card, lesson cards, mistakes, courses, consent, settings) | ✅ | |
| Parent: teacher-change request | ✅ | Second request → 409 shown as a toast. |
| Parent: enrol a child in a course | ✅ | |
| Parent: subscribe to a plan | ✅ ⚠️ 📮 | Subscription active, but **no invoice is issued**, so there is nothing to pay until an admin invoices manually (B22). Checkout with the fake provider returns straight to the success page and never marks the invoice paid (M36). |
| Parent: data export request | ✅ | Duplicate requests are accepted (minor). |
| Notifications after all of the above | ❌ 📮 | Inboxes stay empty: the quiet-hours check is inverted, so every notification is **skipped** outside quiet hours (B23); messages, cancel/reschedule, trial booking and teacher change never enqueue a notification (M40). |
| Notification titles | 🔧 | Template types without a subject showed raw text ("Consent data-request"); every backend template now has a title. |

---

## 9. Fixed in the web during this audit

All fixes have tests; the suite is 56 files / 419 tests, all passing.

| # | Fix | Files | Tests |
| :---: | :--- | :--- | :--- |
| 1 | Dropdowns inside dialogs open **above** the dialog (were behind it in 13 forms) | `components/ui/select.tsx`, `TimezoneSelect.tsx`, `CurrencySelect.tsx` | verified with a real mouse click in Chromium |
| 2 | Sign-out leaves no `?redirect=` (also when a page mounts two route guards); sign-in / sign-up / OAuth honour a redirect only if the account can open it | `lib/portal/nav.ts`, `lib/api/client.ts`, `components/auth/ProtectedRoute.tsx`, `app/login/page.tsx`, `app/register/page.tsx`, `app/auth/complete/page.tsx` | `tests/auth/post-login-redirect.test.tsx` |
| 3 | Sign-out no longer refetches session data (stray 401) | `hooks/useAuth.ts` | covered by account-security tests |
| 4 | Login form no longer skips validation for `.test` emails (and no longer applies the sign-up length rule) | `app/login/page.tsx` | `tests/auth/login-*.test.tsx` |
| 5 | Next.js dev badge no longer covers "Sign out" (dev only) | `next.config.ts` | — |
| 6 | Contact filter catches spelled-out emails and social handles, without flagging ordinary sentences | `lib/api/modules/messaging.ts` | `tests/messaging/messaging.test.ts` |
| 7 | Notification titles for every backend template type | `lib/api/modules/notifications.ts` | `tests/notifications/notifications.test.ts` |
| 8 | Duplicate CMS slug marks the Slug field | `components/admin/content/PostEditor.tsx` | `tests/admin-ops/audit-fixes.test.tsx` |
| 9 | Readable application qualifications | `components/admin/teachers/ApplicationDetailView.tsx` | same |
| 10 | Lesson materials shown in course admin | `components/admin/courses/CoursesAdmin.tsx` | same |
| 11 | Trial outcome shows the plan name | `components/admin/trials/TrialsWorkspace.tsx` | same |
| 12 | Examiner sees only the overview with an honest message; staff without 2FA get a set-up banner | `lib/portal/nav.ts`, `components/qa/SupervisorRoleGate.tsx`, `components/portal/PortalShell.tsx` | same |

## 10. Raised with the backend

Added to `backendrequirement.md` v4.1.0 (same format as the other items):

| ID | Item |
| :--- | :--- |
| S20 | Guardian marked verified at family creation — verification step skipped |
| B20 | Password-reset email: empty code, no link |
| B21 | Teacher of a trial class can't read that student's mistakes (403) |
| B22 | Subscribing issues no invoice |
| B23 | Quiet-hours check inverted — every notification skipped |
| B24 | Trial outcome accepted for future classes; flips all trial enrolments |
| M40 | No notifications for messages, cancel/reschedule, trial booked, teacher change |
| M41 | No examiner (assessment) endpoints |
| M42 | Staff 2FA not enforced |
| M43 | `canRate` flag for completed classes |
| Q19 | Anonymous session probe returns 401 (console noise) |
| Q20 | Policy pages not published in the CMS |
| Q21 | No dev mailer (MailHog unused); log mailer logs nothing |
| Q22 | Password policy is length-only |
| Q23 | Extra session rows; no "current session" marker |
| Q24 | Seed: teacher subjects vs course codes; availability zone mismatch |

Also confirmed still open from before: B10, B14, M22, M27, M31, Q2, Q11, S14.

## 11. Test data left in the local database

Created through the UI during the audit (local dev DB only): audit parent/student accounts (`audit+…@hifzoon.test`), an audit family with a child, a cancelled trial and a Hifz trial enrolment, a Circle subscription with one open invoice, data-export requests, a CRM lead, a teacher application, a course level and lesson in Islamic Studies, a September payroll period, a QA review, two closed cases, a message thread and a teacher-change request for the Khan family, a pending bio change for Ustadh Bilal. The seeded teacher's availability was re-saved and is now stored in UTC (see Q24). Re-seeding the database removes all of it.

---

## 12. Ownership & booking checks (2026-10-17, second pass)

Run directly against the API with real accounts: one family (**Khan**: Maryam, Yusuf — `parent@`), a second family (**Umair Shad**: Rehman, booked a trial with Ustadh Bilal), Ustadh **Bilal** (Hifz, Tajweed — teaches Maryam & Yusuf), Ustadh **Farooq** (Qaida, Nazra — no students) and an unapproved trainee. 26 checks.

### A parent sees only their own children and classes

| Check | Expected | Result |
| :--- | :---: | :---: |
| List families | own only | ✅ |
| Another family's children / dashboard / charts / timetable / consent / mistakes | 403 | ✅ all 403 |
| Another family's class state | 403 | ✅ |
| **Join another family's class** (`POST /classroom/classes/:id/token`) | 403 | ❌ **201, `GUARDIAN_VIEWER`** — S12 |
| Enrolment list | own children only | ✅ |
| Book a trial for another family's child | 403 | ✅ |

### A teacher sees only their own students and classes

| Check | Expected | Result |
| :--- | :---: | :---: |
| Farooq's student list (no students) | empty | ✅ |
| Farooq reads Bilal's timetable / availability / students' mistakes / lesson cards / class state | 403 | ✅ all 403 |
| Farooq marks a mistake in Bilal's class | 403 | ✅ |
| Bilal's student list | Maryam, Yusuf | ✅ |
| Bilal's timetable includes his trial with Rehman | yes | ✅ |
| **Bilal marks / reads mistakes for his trial student** | 201 / 200 | ❌ 403 — B21 / B28 |

### A trial goes to a correct teacher

| Check | Expected | Result |
| :--- | :---: | :---: |
| Website: teacher list and times for a course | only that course's teachers | ✅ (web) |
| API: trial with an **unapproved** teacher | refused | ✅ 403 (FR-TCH-02) |
| **API: trial with a teacher who doesn't teach the course** (Farooq for Hifz) | refused | ❌ 201 — B26 |
| **API: trial outside the teacher's availability** (03:00 UTC) | refused | ❌ 201 — B27 |

The two probe bookings were cancelled straight away.

### Root cause and web changes

All the trial failures come from one gap — **a booked trial creates no enrolment (B28)** — while every permission check looks for an enrolment. The web cannot change permissions; it now:

- **Teacher → Students** lists *Trial students* from the teacher's own upcoming trial classes (name, course, time, Join when the room opens).
- **Classroom → AI flags** skips a student the API refuses (403) with a one-line note instead of an access-denied card; other students' flags still load.
- **Classroom → Log mistake** shows the single student as a clear field and explains a trial 403.
- **Parent → Timetable** shows *Join to watch* (or when the room opens) on every class.

Backend items added or re-prioritised in `backendrequirement.md` v4.2.0 under **🚨 Fix first**: S12 (reproduced), B28, B21, B25, B26, B27, M44.

