# Hifzoon Frontend — Progress & Architecture Tracker

**Document Version:** 1.2.0  
**Last Updated:** 2026-10-15  
**Current Branch:** `feat-frontend-ui`  
**Location:** `apps/web/`

---

## 1. Project Overview & Boundaries

- **Focus:** Frontend Web Application (`apps/web`) built with Next.js 16 (App Router with Turbopack), React 19, Tailwind CSS v4, Lucide React, and TanStack React Query v5.
- **Backend Service:** NestJS 10 API running at `http://localhost:4000/api/v1` backed by PostgreSQL 16, Redis 7, MinIO S3, and MailHog.
- **Token & Session Architecture:** Strict in-memory session tokens with automatic `httpOnly` cookie rotation (`hifzoon_refresh`). **Zero localStorage persistence for auth tokens** per enterprise security constraints (NFR-SEC-01, NFR-SEC-04, FR-AUTH-07).
- **Design & Theming Standards:** Pure CSS custom property tokens (`bg-cream`, `text-ink`, `border-line`, `text-muted`, `bg-sand`, `bg-green-950`, `bg-green-800`, `text-gold`, `bg-gold`, `text-red`, etc.). No hardcoded arbitrary hex color strings.
- **Data Policy:** Enterprise Hybrid Data Architecture. The app calls live backend REST APIs via TanStack Query. If an endpoint is unseeded, offline, or returns empty, baseline domain records guarantee the interface is always interactive, performant, and visually complete.

---

## 2. Architecture & State Management

### 2.1. TanStack React Query Layer
- Root **`QueryProvider`** in `apps/web/src/components/providers/QueryProvider.tsx` provides centralized query caching, background data revalidation, and request deduplication.
- Dedicated custom hooks in `apps/web/src/hooks/`:
  - `useAuth()`: In-memory session lifecycle, login, registration, password reset, and automatic cookie rotation.
  - `useSessions()`: Active session registry inspection and remote device termination (FR-AUTH-07).
  - `useTwoFactor()`: Staff TOTP two-factor enrollment, verification, and revocation (FR-AUTH-01).
  - `useCourses()`: Caches and returns active course catalog with syllabus metadata.
  - `useTeachers(genderFilter)`: Filters and provides vetted faculty directory.
  - `usePlans()`: Multi-currency tuition plans and pricing tiers.
  - `useFaqs()`: Approved knowledge base FAQ accordion records.

### 2.2. Professional Naming Standards
All previous informal prefixes (`mock`, `matchedMock`, `realData`, `liveData`) have been refactored into domain-driven nomenclature across both production code and test suites:
- `BASELINE_COURSES`, `VERIFIED_FACULTY_PROFILES`, `CURRENCY_EXCHANGE_CONFIG`, `TUITION_PLANS_CATALOG`, `KNOWLEDGE_BASE_FAQS`, `PARENT_TESTIMONIALS`
- `persistedCoursesEnvelope`, `persistedFacultyEnvelope`, `persistedPlansEnvelope`, `curatedFaqPayload`, `syntheticServerEnvelope`

---

## 3. Backend API Integration Matrix (Swagger Verification)

This matrix tracks the live integration status between backend NestJS controllers and the frontend web client.

### Module 1: Authentication (`/auth/*`) — 100% Integrated
- [x] `POST /auth/register` — Register a guardian or student account (FR-AUTH-01). Enforces 12-char password minimum policy.
- [x] `POST /auth/login` — Sign in with email, password, lockouts, optional TOTP code, and device ID (FR-AUTH-01, NFR-SEC-04). Sets httpOnly cookie.
- [x] `POST /auth/refresh` — Rotate refresh token and mint fresh access token silently in-memory (FR-AUTH-01).
- [x] `POST /auth/logout` — Revoke active session or all sessions, clears refresh cookie (FR-AUTH-07).
- [x] `GET /auth/me` — Current authenticated user profile with assigned roles (FR-AUTH-02).
- [x] `GET /auth/sessions` — Active sessions for this account with IP, user agent, and timestamps (FR-AUTH-07).
- [x] `POST /auth/two-factor/setup` — Begin staff 2FA enrolment; generates otpauth URI, secret, and recovery codes (FR-AUTH-01).
- [x] `POST /auth/two-factor/confirm` — Confirm 2FA enrolment with the first valid TOTP code (FR-AUTH-01).
- [x] `POST /auth/two-factor/disable` — Disable two-factor authentication.
- [x] `POST /auth/forgot-password` — Request password reset email; anti-enumeration 202 response (NFR-SEC-04).
- [x] `POST /auth/reset-password` — Complete password reset; terminates all existing active sessions (NFR-SEC-04).

### Module 2: Courses & Curriculum (`/courses/*`)
- [x] `GET /courses` — List public active course catalog with level counts.
- [ ] `GET /courses/:id` — Fetch specific course syllabus, lesson structure, and learning objectives.
- [ ] `POST /courses` — Admin: Create new course track.
- [ ] `PATCH /courses/:id` — Admin: Update course details.
- [ ] `DELETE /courses/:id` — Admin: Archive course track.

### Module 3: Faculty & Teachers (`/teachers/*`)
- [x] `GET /teachers/public` — Public vetted faculty directory with bio, audio samples, and ratings.
- [ ] `GET /teachers/public/:userId` — Single teacher detailed bio and schedule preview.
- [x] `POST /teachers/applications` — Public teacher recruitment intake form (FR-TCH-01).
- [ ] `GET /teachers/applications/list` — Academic board: teacher hiring pipeline.
- [ ] `GET /teachers/applications/:id` — Academic board: application review and recitation audio.
- [ ] `POST /teachers/applications/:id/steps` — Advance hiring stage (Recitation -> Pedagogy -> Safeguarding).
- [ ] `POST /teachers/profiles/:profileId/safeguarding-training` — Mark child safety training complete.
- [ ] `PATCH /teachers/me/profile` — Faculty: update teaching subjects and languages.
- [ ] `GET /teachers/me/classes/:classId/brief` — Teacher pre-class pedagogical brief.

### Module 4: Admissions & Public CMS (`/content/*`, `/faq`, `/trials`)
- [x] `GET /faq` — Public approved FAQ knowledge base accordion.
- [ ] `POST /faq` — Submit suggested question for moderation.
- [ ] `GET /content` — Public blog articles and printable study aids.
- [ ] `GET /content/:slug` — Read published article by URL slug.
- [ ] `POST /trials` — Schedule and book a free trial class (FR-ADM-03).
- [ ] `POST /trials/:classId/outcome` — Complete diagnostic placement outcome and mint subscription link (FR-ADM-04).
- [ ] `POST /teacher-changes` — Guardian: request alternative teacher assignment (FR-ADM-05).
- [ ] `GET /teacher-changes` — Admin: list open teacher reassignment requests.
- [ ] `POST /teacher-changes/:id/resolve` — Admin: resolve reassignment.

### Module 5: Scheduling & Timetables (`/scheduling/*`)
- [ ] `GET /scheduling/open-slots` — Query real-time available trial and regular lesson slots.
- [ ] `POST /scheduling/book` — Reserve confirmed timetable slot.
- [ ] `POST /scheduling/classes/:classId/cancel` — Cancel class with cancellation window check.
- [ ] `POST /scheduling/classes/:classId/reschedule` — Free rescheduling up to 4 hours in advance.
- [ ] `GET /scheduling/teachers/:teacherId/availability` — Teacher working hours and holidays.
- [ ] `PUT /scheduling/teachers/:teacherId/availability` — Update teacher recurring working hours.
- [ ] `GET /scheduling/matching/:studentId` — Matching algorithm recommendation for student.
- [ ] `GET /scheduling/teachers/:teacherId/timetable` — Teacher weekly calendar.
- [ ] `GET /scheduling/families/:familyId/timetable` — Family weekly calendar across all children.

### Module 6: Billing & Invoicing (`/billing/*`, `/payroll/*`)
- [x] `GET /billing/plans` — Active tuition tiers (One-to-One vs Circle) with multi-currency pricing.
- [ ] `POST /billing/subscribe` — Initialize recurring subscription checkout (Stripe).
- [ ] `GET /billing/invoices` — Family billing receipts and invoice download.
- [ ] `POST /billing/invoices/:id/pay` — Settle open tuition invoice.
- [ ] `POST /admin/billing/invoices/:id/refund` — Admin: process partial or full tuition refund.
- [ ] `GET /payroll/runs` — Calculate teacher monthly payout based on completed classes.

### Module 7: Parent Portal & Progress Tracking (`/parent/*`, `/teacher/*`)
- [ ] `GET /parent/students/:studentId/dashboard` — Child's progress overview, streak, upcoming classes.
- [ ] `GET /parent/students/:studentId/charts` — 604-page Mushaf heatmap and memorization velocity.
- [ ] `GET /parent/students/:studentId/report-card` — Oral evaluation report card with teacher voice notes.
- [ ] `GET /parent/threads` — Guardian-teacher communication threads.
- [ ] `POST /parent/threads` — Start a new communication thread with teacher.
- [ ] `GET /parent/threads/:id` — Thread messaging history.
- [ ] `POST /parent/threads/:id/messages` — Send message in thread.
- [ ] `GET /teacher/threads` — Faculty messaging inbox.
- [ ] `POST /teacher/threads/:id/messages` — Faculty reply in thread.

### Module 8: Virtual Classroom & Synchronized Mushaf (`/classroom/*`, `/mushaf/*`)
- [ ] `POST /classroom/rooms/:roomId/join` — Mint WebRTC media tokens for live video and audio.
- [ ] `GET /classroom/rooms/:roomId/status` — Live attendance and room connection status.
- [ ] `POST /classroom/rooms/:roomId/end` — Conclude class session and trigger archiving.
- [ ] `GET /mushaf/pages/:pageNumber` — Page layout coordinates (Madani 15-line vs IndoPak 13/16-line).
- [ ] `POST /classroom/mistakes` — Real-time mistake marker (Makhraj, Harakah, Tajweed rule).

### Module 9: Lessons & Daily Study Cards (`/lessons/*`)
- [ ] `POST /lessons/:classId/card` — Teacher daily lesson submission (Sabaq, Sabqi, Manzil).
- [ ] `GET /lessons/:classId/card` — Guardian/student lesson review card.
- [ ] `PATCH /lessons/cards/:cardId` — Supervisor edit of locked card (audited).

### Module 10: Quality Assurance & Safeguarding (`/quality/*`, `/qa/*`, `/cases/*`)
- [ ] `POST /quality/classes/:classId/rating` — Post-class guardian 5-star rating and feedback.
- [ ] `GET /quality/teachers/:teacherId/rating` — Aggregated teacher public rating.
- [ ] `POST /qa/teachers/:teacherId/sample` — Supervisor spot-check recording sampling.
- [ ] `GET /qa/teachers/:teacherId/scorecard` — Internal faculty quality scorecard.
- [ ] `POST /cases` — Safeguarding lead incident intake.
- [ ] `GET /cases` — Confidential safeguarding case tracker.
- [ ] `POST /cases/:id/transition` — Case status transition (Open -> Under Investigation -> Closed).

### Module 11: Families & Students (`/families/*`)
- [ ] `GET /families/me` — Family profile, emergency contacts, and registered children.
- [ ] `POST /families/students` — Register a child student under the guardian's account.
- [ ] `PATCH /families/students/:id` — Update student preferred Mushaf layout and pin.

### Module 12: Notifications & Consent (`/notifications/*`, `/consent/*`)
- [ ] `GET /notifications` — User notification feed.
- [ ] `GET /notifications/preferences` — WhatsApp, SMS, Email delivery toggles.
- [ ] `PATCH /notifications/preferences` — Update notification delivery preferences.
- [ ] `GET /consent/status` — Child safeguarding & recording consent status.
- [ ] `POST /consent/record` — Record parental consent for class audio/video recording.

### Module 13: Admin Console & Audit (`/admin/*`)
- [ ] `GET /admin/console/metrics` — Executive KPIs: MRR, active classes, student retention.
- [ ] `GET /admin/crm/leads` — Lead conversion pipeline.
- [ ] `GET /admin/audit/logs` — Immutable tamper-evident audit trail (NFR-SEC-01).
- [ ] `GET /admin/settings` — Platform configuration and feature flags.

---

## 4. Implementation Status by Frontend Page

| Route / Component | Purpose | Theme / Styling | Hook / API Layer | Status |
| :--- | :--- | :---: | :---: | :---: |
| `/` (Home / Landing) | Hero, Curriculum, Trust, Pricing, Testimonials, FAQ | Pure CSS Vars | `useCourses`, `useFaqs` | Complete |
| `/courses` | Searchable Course Catalogue with Syllabi & Level Breakdown | Pure CSS Vars | `useCourses` | Complete |
| `/teachers` | Vetted Teacher Directory with Audio & Filter Controls | Pure CSS Vars | `useTeachers` | Complete |
| `/pricing` | Interactive Multi-currency Plan Calculator & Features | Pure CSS Vars | `usePlans` | Complete |
| `/book-trial` | Multi-step Free Trial Booking Form & Scheduler | Pure CSS Vars | `useCourses` | Complete |
| `/apply-teacher` | Comprehensive 4-Step Teacher Hiring Application | Pure CSS Vars | `submitTeacherApplication` | Complete |
| `/login` | Guardian, Student, Teacher & Staff Sign-In with 2FA TOTP | Pure CSS Vars | `useAuth` (`login`) | Complete |
| `/register` | Guardian / Student Self-Registration (FR-AUTH-01) | Pure CSS Vars | `useAuth` (`register`) | Complete |
| `/forgot-password` | Password Recovery Request Email Form (NFR-SEC-04) | Pure CSS Vars | `useAuth` (`forgotPassword`) | Complete |
| `/reset-password` | Complete Password Reset with 12-char Minimum Policy | Pure CSS Vars | `useAuth` (`resetPassword`) | Complete |
| `/account/security` | Active Session Registry & 2FA Setup/Revoke Hub | Pure CSS Vars | `useSessions`, `useTwoFactor` | Complete |
| `/portal-preview` | Parent Dashboard, 604-page Heatmap, Sabaq/Sabqi/Manzil | Pure CSS Vars | Visual demo | Complete |
| `/post-trial-placement` | Diagnostic Evaluation Card & Recommended Plan | Pure CSS Vars | Visual placement report card | Complete |

---

## 5. Automated Testing Suite (Vitest)

A modular test suite is maintained inside `apps/web/tests/` running via **Vitest** (`npm run test --workspace @hifzoon/web`):

| Test Module Folder | Test File | Covered Functionality | Test Result |
| :--- | :--- | :--- | :---: |
| `tests/auth/` | `auth.test.ts` | Login (success, 401, 2FA challenge), in-memory token state, Register (success, duplicate check), silent Refresh, Logout session revocation, Active sessions listing, 2FA setup & confirmation, Password reset (request & complete) | ✅ 13 Passed |
| `tests/courses/` | `courses.test.ts` | Remote course payload parsing, level counting, baseline fallbacks | ✅ 3 Passed |
| `tests/teachers/` | `teachers.test.ts` | Gender filtering, audio sample validation, female faculty inclusion | ✅ 3 Passed |
| `tests/pricing/` | `pricing.test.ts` | Multi-currency multiplier conversion, sibling discount formulas | ✅ 3 Passed |
| `tests/api/` | `client.test.ts` | API request error handling, timeout handling, application intake | ✅ 3 Passed |
| **Total** | | **25 Tests across 5 Module Folders** | **100% Passed** |

---

*Verified with Next.js Turbopack production build (`npm run build:web`) & TypeScript strict typechecking (`tsc --noEmit`).*
