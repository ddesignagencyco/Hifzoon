# Hifzoon Frontend — Progress & Architecture Tracker

**Document Version:** 2.1.0  
**Last Updated:** 2026-10-16  
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

## 3. Backend API Integration

The hand-maintained matrix that used to live here listed several endpoints that do not exist in the backend. It is replaced by two generated / evidence-based documents:

- **[`api-coverage.md`](./api-coverage.md)** — every backend route read from the NestJS controllers, matched against the web API layer, with access roles, the web module that calls it, the screens that use it and any known backend issue. Regenerate with `python scripts/api-coverage.py`. Current result: **160 of 162 endpoints used (99%)**; the two unused are the Docker health probes; **0** web calls without a matching backend route.
- **[`backendrequirement.md`](./backendrequirement.md)** — backend fixes the web team needs (security, broken endpoints, missing endpoints), each with file:line evidence.

## 4. Routes by Portal

All portal routes are role-guarded (`ProtectedRoute` in `PortalShell`); `/dashboard` sends each user to their own portal. `/portal-preview` is a visitor-only marketing preview with sample data (signed-in users are redirected to their real portal). Global `not-found`, `error` and `global-error` pages share `components/errors/StatusPage.tsx`, which is also used for the 401/403 states.

| Area | Routes |
| :--- | :--- |
| Public site & auth (19) | `/`, `/apply-teacher`, `/book-trial`, `/child-safety`, `/courses`, `/courses/[code]`, `/forgot-password`, `/login`, `/portal-preview`, `/post-trial-placement`, `/pricing`, `/privacy`, `/refunds`, `/register`, `/reset-password`, `/resources`, `/resources/[slug]`, `/teachers`, `/terms` |
| Role router (1) | `/dashboard` |
| Account (inside portal) (1) | `/account/security` |
| Family (guardian) (12) | `/parent`, `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success`, `/parent/children`, `/parent/children/[studentId]`, `/parent/classroom/[classId]`, `/parent/messages`, `/parent/messages/[threadId]`, `/parent/notifications`, `/parent/privacy`, `/parent/timetable` |
| Student (3) | `/student`, `/student/classroom/[classId]`, `/student/notifications` |
| Teacher (14) | `/teacher`, `/teacher/availability`, `/teacher/classes/[classId]/brief`, `/teacher/classroom/[classId]`, `/teacher/classroom/[classId]/lesson-card`, `/teacher/lesson-cards/[lessonCardId]`, `/teacher/messages`, `/teacher/messages/[threadId]`, `/teacher/notifications`, `/teacher/payslips`, `/teacher/profile`, `/teacher/students`, `/teacher/students/[studentId]`, `/teacher/timetable` |
| Quality & supervision (9) | `/supervisor`, `/supervisor/applications`, `/supervisor/applications/[id]`, `/supervisor/cases`, `/supervisor/cases/[id]`, `/supervisor/lesson-cards/[lessonCardId]`, `/supervisor/reviews`, `/supervisor/teachers`, `/supervisor/teachers/[teacherId]` |
| Safeguarding (3) | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla` |
| Academy admin (15) | `/admin`, `/admin/audit`, `/admin/billing`, `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm`, `/admin/payroll`, `/admin/scheduling`, `/admin/settings`, `/admin/teacher-changes`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/admin/trials`, `/admin/users` |

**Total:** 77 routes.

Known limits that come from the backend (details in `backendrequirement.md`): student self-access (M7), Kids Mode PIN login (M2), OAuth (M3), real video and licensed Quran text providers (M16, Q8), guardian verification migration (B1).

---

## 5. Testing

| Suite | Command | Scope |
| :--- | :--- | :--- |
| Unit & component (Vitest + Testing Library/jsdom) | `npm run test --workspace @hifzoon/web` | 49 files · 365 tests: every API module (URL, method, body, headers, error paths), key forms and screens, toasts, route links |
| Live integration (real API, seeded DB) | `npm run test:integration --workspace @hifzoon/web` | 10 suites in `tests/integration/` exercising each portal's endpoints end-to-end |
| Demo data | `npm run demo:data --workspace @hifzoon/web` | Idempotent script that fills the seeded family, teacher, CRM, QA and safeguarding data through the API |
| API coverage report | `python scripts/api-coverage.py` (from `apps/web`) | Regenerates `docs/api-coverage.md` |

Unit test folders: `admin-ops`, `admin-system`, `api`, `auth`, `billing`, `booking`, `cases`, `classroom`, `content`, `courses`, `lessons`, `messaging`, `notifications`, `parent`, `pricing`, `qa`, `student`, `teacher`, `teachers`.

Quality gates at time of writing: `tsc --noEmit` 0 errors · ESLint 0 errors · `next build` succeeds (80 pages).

---

## 6. UI System & Recent Changes (2026-10-15)

| Area | What changed |
| :--- | :--- |
| Feedback | All errors and confirmations are toasts (site-wide provider); load failures show a compact Retry; invalid fields are outlined red. |
| Selects | Every `<select>` (76) replaced by the React `Select` (react-select): keyboard-friendly, searchable for long lists, menus portalled above dialogs. |
| Status pages | Shared 404 / 500 / 401 / 403 pages (`components/errors/StatusPage.tsx`). |
| Session boot | `AuthBootSplash` removes the header flicker on first load (logo with progress ring, max 4 s). |
| Account security | Lives inside the user's portal. 2FA shows a QR code + copyable key + recovery codes; the password is verified with a throwaway sign-in because the backend ignores it (backend S16); turning 2FA off needs password + current code; guardians/students see that 2FA is staff-only. |
| Portals | Fixed sidebar (does not scroll with content), logo block aligned with the top bar, portal badge removed; multi-role users get links to their other portals. `/portal-preview` is visitor-only sample data. |
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
| **Layout & Header Alignment** | Enforced strict header container alignment across all pages. Performed full-width responsive redesigns for Course Detail (`/courses/[slug]`), Post-Trial Placement (`/post-trial-placement`), and Resources/Blog (`/resources/how-long-does-hifz-take`). Standardized legal pages (`/child-safety`, `/privacy`, `/terms`, `/refunds`). |
| **FAQ Accordions & Resource Forms** | Replaced `x` icons with centered `+` / `−` indicators in FAQ components. Repositioned the inquiry form full-width directly below the FAQ accordion. |
| **Teacher Audition Voice Recording** | Integrated HTML5 `MediaRecorder` audio recording directly on `/apply-teacher` with microphone permission prompts, live timer, status indicator, and playback review. Added fallback file uploader (`.mp3`, `.wav`, `.m4a`, `.webm`). Replaced stretching select dropdowns with custom styled select menus. |
| **Multi-Role Login & Kids Mode** | Added quick-fill demo account switcher for Parent, Student, Faculty, and Staff on `/login`. Added 4-digit Kids PIN and temporary Student OTP access pass modes. Handled 2FA challenge transitions gracefully. |

---

*Seeded logins (password `Hifzoon!Dev2026`): parent@, teacher@, admin@, superadmin@, supervisor@, safeguarding@, examiner@, student@ — all `@hifzoon.test`.*
