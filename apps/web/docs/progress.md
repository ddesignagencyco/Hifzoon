# Hifzoon Web — Current Progress

**Updated:** 2026-10-29  
**Branch:** `feat-frontend-ui` (uncommitted Oct 2026 wiring on top of `05c7287`)  
**Scope:** `apps/web` — Next.js 16, React 19, Tailwind v4, TanStack Query v5

---

## 📊 Overall Status

| Area | Status | Confidence |
|:---|:---|:---|
| **Pages built** | 91/91 | ✅ Complete |
| **Tests** | 587 Vitest (94 files) | ✅ Passing |
| **TypeScript** | No errors | ✅ Clean |
| **ESLint** | 23 errors, 33 warnings | 🔴 Cleanup needed |
| **Build** | Fails on prerender | 🔴 `ChatAssistantWidget` Suspense issue |
| **Deployment** | Not started | ⏸ Waiting on target |

---

## ✅ Complete — No Further Work Needed

### Infrastructure & Setup
- ✅ Next.js 16 App Router with `[locale]` i18n routing
- ✅ Tailwind v4 + custom design tokens (cream, ink, green, gold)
- ✅ shadcn/ui + custom component library
- ✅ TanStack Query v5 with error handling
- ✅ Type-safe API client generated from backend OpenAPI

### Public Site (17 pages)
- ✅ Home, courses, teachers, pricing, resources, policies
- ✅ Trial booking flow (< 2 min)
- ✅ Teacher application with file upload to MinIO
- ✅ SEO scaffolding (titles, descriptions, fonts)

### Authentication & Account (8 pages)
- ✅ Login / register (email, Google, Apple OAuth)
- ✅ Staff 2FA setup and challenge
- ✅ Password reset (MailHog in dev)
- ✅ Sessions list, 2FA management
- ✅ Account security (password reset links)

### Parent Portal (13 pages)
- ✅ Overview, children, child detail
- ✅ Timetable (All / Today / Tomorrow / week / date filters)
- ✅ Lesson cards (DRAFT, SUBMITTED, etc. states)
- ✅ Messaging with live notifications
- ✅ Billing page (hidden until provider set)
- ✅ Privacy/consent center

### Student Portal (5 pages)
- ✅ Overview, progress (Hifz map or level ladder)
- ✅ Classroom join
- ✅ Notifications

### Teacher Portal (13 pages)
- ✅ Overview, timetable (day/date/student filters)
- ✅ Classroom + lesson card
- ✅ Students list & profile (name, progress, family)
- ✅ Availability editor (weekly grid, UTC storage, local display)
- ✅ Profile (with staged changes for admin approval)
- ✅ Payslips, messages, notifications

### Supervisor Portal (9 pages)
- ✅ Overview, applications, cases, lesson cards
- ✅ QA reviews with rubric scoring
- ✅ Teachers list, notifications

### Safeguarding (4 pages)
- ✅ Overview, case detail, notifications, SLA

### Admin (14 pages)
- ✅ Overview, audit, CRM, scheduling, users
- ✅ Teacher management (approval, profile changes tracking)
- ✅ Trials workspace
- ✅ Payroll, billing, notifications
- ✅ Content/CMS management
- ✅ Settings

### Classroom (Shared)
- ✅ Device check (camera, mic, speakers)
- ✅ One-tap join, video tiles, mute controls
- ✅ Mushaf viewer (Madani 15-line) with page sync
- ✅ Mistake logging (after start time only)
- ✅ Lesson card post-class
- ✅ Teacher controls (layout switch, Tajweed toggle)
- ✅ Pen/highlighter canvas (touch/stylus)
- ✅ Reference recitation (3 qaris, loop, 0.75×)
- ✅ Attendee list with presence
- ✅ Recording indicator + status

### Design System & Components
- ✅ Button, form, table, dialog, toast, select
- ✅ CurrencySelect, TimezoneSelect, PhoneInput (React Select)
- ✅ BrandLoader (fullscreen, page, section)
- ✅ Collapsible sidebar, scroll-to-top
- ✅ Loading, empty, error, success states
- ✅ Dark/light theme toggle

### Features
- ✅ Real live API calls (no fake writes)
- ✅ Hifz page state map (read-only)
- ✅ Family messaging & teacher chat
- ✅ Lesson card editor (with QA rubric scoring)
- ✅ Teacher profile changes (staged for admin approval)
- ✅ Timetable with DST-aware timezone display
- ✅ Make-up credits tracking
- ✅ Quran text from API (licensed or Quran.com fallback)

---

## 🔴 Known Issues — Fix Before Deploy

### Build Failure
- **Issue:** `next build` fails on prerendering `/resources/[slug]`
- **Cause:** `ChatAssistantWidget` calls `usePathname()` outside `<Suspense>` boundary (CLIENT_HOOK_DYNAMIC)
- **Fix:** Wrap `ChatAssistantWidget` in `<Suspense>`
- **File:** `apps/web/src/components/[...] (find and wrap)`

### Linting
- **23 ESLint errors** (mostly unused variables)
- **33 warnings** (deprecated patterns, unused imports)
- **Action:** Run `npm run lint:fix` and review

### Formatting
- **Prettier not yet applied** (384 files would reformat)
- **Action:** Run `npm run format` as a single commit

---

## ✅ October 2026 Batch — Wired (2026-10-29)

All eight Oct 2026 features and carry-forward items M47, M48, M49, M54, M55, M56, M57 and M69 now have working UI. Every backend endpoint except the four webhooks is reachable from a page. See [`api-coverage.md`](./api-coverage.md) for the per-endpoint table.

| Feature | Where |
|:---|:---|
| #1 Monthly hours + leave | Teacher → Availability → Month by month & days off |
| #2 Geo leads | CRM new-lead form (region/city/postcode) + CRM → Areas |
| #3 3 trials per week | Trials hint uses `TRIAL_SESSIONS_PER_WEEK` |
| #4 Teacher tiers | Admin → Teachers → Teacher tiers, per-teacher tier panel, badges on public cards and profiles |
| #5 Plans sell tiers | Home and `/pricing` tier cards; Parent billing and Admin billing read prices per plan |
| #7 Credential verification | Admin → Teachers → Profile changes (before/after, verified on approval) |
| M69 / M9 / M49 / M47 / M56 / M48 / M55 | Change password, live consent version, student timetable, teacher's view of a student, Report a concern, parent joins as child, course title and REC in classroom |

**Still open:** backend asks R1–R4 and M50, Q9, M26. All are in [`REQUIREMENTS.md`](./REQUIREMENTS.md).

---

## 📈 Test Coverage

| Layer | Count | Status |
|:---|---:|:---|
| Unit/component (Vitest) | 587 tests | ✅ 100% pass |
| TypeScript (`tsc --noEmit`) | Clean | ✅ No errors |
| ESLint | 23 errors, 33 warnings | 🔴 Needs cleanup |
| Build (`next build`) | Fails on prerender | 🔴 Suspense issue |
| Manual (production) | Not deployed | ⏸ No staging env |

---

## 🔧 Local Development Status

| Component | Status | Notes |
|:---|:---|:---|
| PostgreSQL | ✅ Running | 5432 |
| Redis | ✅ Running | 6379 |
| MinIO | ✅ Running | 9000/9001 |
| MailHog | ✅ Running | 8025 |
| Backend API | ✅ Ready | 4000 |
| Web dev server | ✅ Ready | 3000 |
| Seeded accounts | ✅ Available | `@hifzoon.test` accounts |
| OAuth (local) | ⏸ Optional | Requires provider creds |

---

## 📋 Recent Changes

### October 29, 2026
- ✅ Wired every remaining Oct 2026 and carry-forward endpoint (see api-coverage.md)
- ✅ Fixed three screens that crashed after `/billing/plans` stopped returning prices
- ✅ Docker capped at 4 GB RAM via `%USERPROFILE%\.wslconfig`

### October 28, 2026
- ✅ Consolidated backend requirements (now in REQUIREMENTS.md)
- ✅ Removed GB from currency dropdown (7 currencies now)
- ✅ Removed GB from phone country picker (defaults to US)
- ✅ Replaced complex React Select in PhoneInput with clean native select
- ✅ Fixed PhoneInput alignment and styling

### October 19, 2026
- ✅ Verified all v4.7 backend fixes (17 live checks passed)
- ✅ Applied 14 backend defect fixes
- ✅ Merged `backend-regression` and `dev`
- ✅ Updated migration: MinIO volume ownership for bitnamilegacy image

---

## 🎯 Next Sprint (Recommended Priority)

1. **Fix build failure** — Wrap `ChatAssistantWidget` in `<Suspense>`
2. **Lint cleanup** — `npm run lint:fix` + review
3. **Format** — `npm run format` as single commit
4. **Feature #5** — Rewrite pricing page (blocks public site)
5. **Feature #3** — Add "N of 3 trials" indicator
6. **Features #4** — Tier picker + badge display
7. **Blockers** — M48, M54, M56 (wait on backend)

---

## 📞 Blockers & Dependencies

### Waiting on Backend
- M48, M49, M50 (classroom workflows)
- M54, M56, M69 (critical gaps)
- Migrations validation before deploying Oct 2026 batch

### Waiting on Product
- Q9 (pricing periods by currency)
- M26 (public trial intake rules)
- Feature #4 final tier names (currently: STANDARD, CERTIFIED, SENIOR)
- Video provider selection (LiveKit vs open-source)
- Payment provider selection (Stripe, etc.)

### Waiting on DevOps
- Staging environment setup
- Production domain & SSL
- OAuth provider credential registration (Google, Apple)

---

## 📊 Metrics

| Metric | Value |
|:---|---:|
| Pages built | 91 |
| Components | 150+ |
| API routes called | 170/174 |
| Bundle size (unminified) | ~2.5 MB |
| Lighthouse (local) | 92/100 |
| Mobile responsive | ✅ 360px+ |
| Dark mode | ✅ Full |
| i18n ready | ✅ (EN scaffold) |

---

## 💾 File Health

| Check | Result |
|:---|:---|
| Unused imports | 33 found |
| Unused variables | 23 found |
| Dead code | Few, mostly test fixtures |
| Type coverage | 100% |
| Branch complexity | Low–medium |
| Test coverage | 70%+ (enforced) |

---

## 🚀 Launch Readiness

| Gate | Status |
|:---|:---|
| Feature complete | 🟡 91 pages done, 8 backend features pending |
| Build passing | 🔴 Fails on prerender |
| Tests passing | ✅ 587/587 |
| Type safe | ✅ Clean |
| Lint clean | 🔴 23 errors |
| Staging deployed | ❌ Not started |
| Security audit | ⏸ Not scheduled |
| Performance audit | ⏸ Not scheduled |
| UAT ready | 🟡 Local only |

**ETA to production:** Depends on backend migration validation, staging setup, and feature #5 rewrite. Estimate: 2–3 weeks if unblocked.

---

**Last reviewed:** 2026-10-29  
**By:** Frontend team  
**Shared with:** Backend, Product
