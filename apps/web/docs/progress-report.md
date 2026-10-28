# Hifzoon Web — Implementation Progress Report

**Updated:** 2026-10-20
**Branch:** `feat-frontend-ui` (head `aecd406`, includes `backend-regression` and `dev`)
**Scope:** `apps/web` only (Next.js 16 App Router, React 19, TypeScript, Tailwind v4, TanStack Query v5)

Status legend: ✅ done · 🟡 partly done · ⏳ waiting on backend · ❌ not started

---

## 1. Project boundaries

| Rule | Status |
| :--- | :--- |
| All changes inside `apps/web` | ✅ Only merges brought in backend files; the web team edits none of them |
| Backend gaps documented, never invented | ✅ `docs/backendrequirement.md` v4.8.0 (0 open defects, 2 questions, 20 requests, 13 workflow items) |
| Real integrations only (no fake writes) | ✅ Every list comes from the live API; billing hidden behind `NEXT_PUBLIC_BILLING_ENABLED=false` until a payment provider exists |
| Design language preserved | ✅ Cream / ink / green-950 / gold tokens in `globals.css` |

## 2. Homepage

| Section | Status |
| :--- | :--- |
| Header with currency picker, mobile menu | ✅ `components/layout/Header.tsx` |
| Hero, highlights strip | ✅ `HeroSection`, `HighlightsStrip` |
| Courses / curriculum | ✅ `CurriculumSection` (live courses) |
| Faculty | ✅ `FacultySection`, `TeacherCard` (live teachers) |
| Live classroom demo (meeting-style) | ✅ `ClassroomLiveSection` + `classroom-demo/` |
| Hifz tracker showcase | ✅ `HifzTrackerSection` |
| Pricing | ✅ `PricingSection`, `PlanPriceGrid` (live plans) |
| FAQ | ✅ `FAQSection` (live FAQs) |
| Final CTA, footer, chat assistant | ✅ `FinalCTASection`, `Footer`, `ChatAssistantWidget` |
| Testimonials / reviews | ❌ Not shown — no approved review source in the API, and fabricated reviews are not allowed |

## 3. Animations and interactions

| Item | Status |
| :--- | :--- |
| Brand loader (logo + ring) everywhere, no double loader | ✅ `ui/BrandLoader.tsx` (fullscreen / page / section) |
| Collapsible portal sidebar, toasts, scroll-to-top | ✅ |
| Hover / focus / press states on buttons and cards | ✅ CSS transitions |
| Loading, empty, error, success states | ✅ `LoadingState`, `PublicLoadState`, retryable errors |
| Scroll-triggered entrance animations | ❌ Not added (no animation library; would need a decision on `motion`) |
| `prefers-reduced-motion` | 🟡 Applies to the CSS transitions only |

## 4. Pages and routes (91 pages)

**Public (17):** `/`, `/courses`, `/courses/[code]`, `/teachers`, `/teachers/[userId]`, `/pricing`, `/book-trial`, `/apply-teacher`, `/resources`, `/resources/[slug]`, `/privacy`, `/terms`, `/refunds`, `/child-safety`, `/safeguarding`, plus `not-found`, `error` and `global-error`.

**Auth and account (8):** `/login` (with 2FA step), `/register`, `/forgot-password`, `/reset-password`, `/auth/complete` (OAuth), `/auth/two-factor/setup` (staff enrolment), `/account/security` (sessions, 2FA, password reset), `/dashboard` (role redirect).

**Parent (13):** overview, children and child detail, timetable (filters + outcome badges), classroom, lesson cards, messages, notifications, privacy/consent, billing (hidden until payments exist).

**Student (5):** overview, My progress (Hifz map or level ladder per course), classroom, notifications; `/student/hifz` redirects to progress.

**Teacher (13):** overview, timetable (day/date/student filters), availability, class brief, classroom + lesson card, lesson cards, students and student profile, messages, notifications, payslips, profile.

**Supervisor (9):** overview, applications, cases, lesson cards, reviews, teachers, notifications.

**Safeguarding (4):** overview, case detail, notifications, SLA.

**Admin (14):** overview, audit, billing (hidden), content, courses, CRM, notifications, payroll, scheduling, settings, teacher changes, teachers + application detail, trials, users.

**Shared classroom:** `/classroom/[classId]` (link target for reminders).

| Missing route | Status |
| :--- | :--- |
| `sitemap.xml`, `robots.txt` | ❌ Not added yet |
| Report a concern (M56), student timetable (M49), change password while signed in (M69) | ⏳ Backend shipped on `backend-regression`; web mapping is next |

## 5. Search and filtering

| Item | Status |
| :--- | :--- |
| Teacher directory filter (gender) | ✅ |
| Parent timetable: All / Today / Tomorrow / This week / date, child filter, past vs upcoming | ✅ |
| Teacher timetable: week / Today / Tomorrow / date, student filter | ✅ |
| Admin lists (users, trials, applications) with filters | ✅ |
| Filters reflected in the URL | 🟡 Some screens only |

## 6. Functional workflows

| Workflow | Status |
| :--- | :--- |
| Sign in, register, OAuth, sign out, session list | ✅ |
| Staff 2FA (setup page after login, QR, recovery codes) | ✅ |
| Password reset by email (MailHog in dev) | ✅ |
| Book a trial, teacher application with uploads (MinIO) | ✅ |
| Classroom: shared Mushaf page, Quran text (Quran.com fallback), mistake logging after start, hide tiles/panel, full-screen Mushaf, countdown and ended card | ✅ |
| Video in the classroom | ⏳ Fake provider; LiveKit or open-source WebRTC per `docs/realtime-classroom-setup.md` |
| Lesson cards, Hifz page states, level ladder | ✅ |
| Messaging and notifications (no "undefined" text) | ✅ |
| Teacher profile changes → admin approval | 🟡 Admin queue page exists; M54/M57 now shipped by backend, mapping next |
| Guardian joins as child (M48) | ⏳ Shipped by backend, mapping next |
| Billing, checkout, refunds | ⏳ Hidden until a payment provider is integrated |

## 7. Design system and components

`components/ui`: `BrandLoader`, `primitives`, `select`, `toast`, `CountrySelect`, `CurrencySelect`, `PhoneInput`, `TimezoneSelect`, `CopyReference`.
`components/landing`: `Button`, `Eyebrow`, `IconTile`, `Logo`, `PillTabs`, `PublicLoadState`, `SectionHeader`.
Domain folders: `admin`, `auth`, `billing`, `booking`, `cases`, `classroom`, `content`, `errors`, `hifz`, `lessons`, `messaging`, `mushaf`, `parent`, `portal`, `student`, `teacher`.
Shared hooks: `useDisplayZone` (account time zone everywhere), `useMushaf`, `useAuth`, `useSessions`, `useTwoFactor`.

## 8. SEO, accessibility, performance

| Item | Status |
| :--- | :--- |
| Page titles and descriptions | ✅ Per route |
| Fonts via `next/font` (incl. Amiri Quran) | ✅ |
| Keyboard focus, labelled forms, tab roles | ✅ Covered by tests |
| Sitemap, robots, Open Graph images, structured data | ❌ Not added |

## 9. Production and deployment

| Item | Status |
| :--- | :--- |
| `.env.example` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BILLING_ENABLED`) | ✅ |
| No secrets in client code; tokens in memory + httpOnly refresh cookie | ✅ |
| Single-origin dev tunnel mode (`API_PROXY_TARGET`, `allowedDevOrigins`) | ✅ |
| Production without seed data | ⏳ Needs M51–M53 (first super admin, plan management, seed split) |
| Deployment | ❌ Not deployed; no target or credentials yet |

## 10. Test results (2026-10-20)

| Check | Result |
| :--- | :--- |
| Vitest | ✅ 569 tests in 92 files passed |
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| ESLint | ❌ 23 errors, 33 warnings (mostly unused variables); to be cleaned up |
| Production build (`next build`) | ❌ Fails prerendering `/resources/[slug]`: `ChatAssistantWidget` calls `usePathname()` outside a `<Suspense>` boundary (`CLIENT_HOOK_DYNAMIC`). Fix: wrap the widget in `<Suspense>` |
| Backend fix verification | ✅ 17/17 live checks (v4.7) |
| Prettier | ⏸ Not applied yet (would reformat 384 files; waiting for go-ahead) |

## 11. Phases

| Phase | Status |
| :--- | :--- |
| 1. Repo inspection and design system | ✅ |
| 2. Homepage and shared layout | ✅ (testimonials and scroll animations open) |
| 3. Courses, teachers, booking | ✅ |
| 4. Portals: parent, student, teacher | ✅ |
| 5. Supervisor, safeguarding, admin | ✅ |
| 6. Animations, SEO, performance | 🟡 Sitemap, robots, OG and scroll animations open |
| 7. Testing and deployment | 🟡 Tests pass; lint errors and the build failure open; deployment not started |

## 12. Next steps and blockers

1. Map the new backend features from `backend-regression`: M48, M49, M50, M54/M57, M55, M56, M47, M69, M9, M14.
2. Add `sitemap.ts`, `robots.ts` and Open Graph metadata.
3. Run Prettier as its own commit.
4. Pick the video provider (LiveKit or open-source WebRTC) and the payment provider.
5. Backend: M51–M53 for production without seed data; Q9 and M26 still unanswered.
