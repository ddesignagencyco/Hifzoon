# Hifzoon — Development Tracker

Single source of truth for **frontend (FE)** and **backend (BE)** work. Both devs update this file as they build.

## How to use this file

- One row = one ticket. Ticket ID format: `<MODULE>-<BE|FE|FS>-<nn>` (FS = shared/full-stack).
- **Status**: `TODO` → `IN PROGRESS` → `IN REVIEW` → `QA` → `DONE` (or `BLOCKED`).
- Change only your own row's Status, Owner and Notes. Put the date in Notes when status changes (`2026-10-14 started`).
- **Branch name**: `feat/<TICKET-ID>-short-name`. Put the ticket ID in every commit.
- **SRS** column = the requirement IDs the ticket satisfies. Tests must reference these IDs.
- **Deps** = tickets that must be done first. FE tickets can start against mocks once the BE ticket's OpenAPI contract is merged (the BE ticket's "contract" step comes first).
- **Pri**: M = Must, S = Should, C = Could (from SRS). **Ph**: P1, P2, P3.
- Definition of Done (every ticket): code merged, unit/integration tests pass, SRS ID in test name, OpenAPI updated (BE), a11y + 360px check (FE), works in staging, demo to product owner.

## Progress summary (update weekly)

| Phase | Total | Done | %   |
| ----- | ----- | ---- | --- |
| P1    |       | —    | —   |
| P2    |       | —    | —   |
| P3    |       | —    | —   |

> **Reconciliation note (2026-10-14).** The **backend (BE)** work for every P1 module is
> implemented and verified — [`Hifzoon-STATUS.md`](./Hifzoon-STATUS.md) is the
> authoritative record (17 feature modules, 94 routes, 166 unit + 9 e2e + 88 full-flow
> checks green on `dev`). The per-ticket `Status` column below is the original planning
> view and is being back-filled module by module; read a `TODO` on a **BE** row as
> _not yet re-verified against the code_, not as _not built_. **Frontend (FE)** work has
> not started. Genuine BE gaps still open: `AUTH-BE-02` (Google/Apple OAuth), the provider
> webhook endpoints (`BIL`/`CLS`/`NTF`), and the HFZ/AIC/ENG modules (P2/P3, deferred by
> design). Do not fill the percentage row until the `Status` column is reconciled.

## Module index

0. PLAT — Platform and foundation
1. AUTH — Accounts, roles, consent
2. ADM — Public website and admissions
3. SCH — Scheduling and matching
4. CLS — Live classroom and Mushaf
5. REC — Lesson records and mistakes
6. HFZ — Hifz engine
7. AIC — AI recitation coach
8. CRS — Courses and assessments
9. PAR — Parent portal
10. TCH — Teacher portal and hiring
11. QA — Supervisor and quality
12. OPS — Admin and CRM
13. BIL — Billing and payroll
14. NTF — Notifications and messaging
15. ENG — Engagement
16. CMP — Compliance, security, data retention
17. REL — Release, testing, load, pilot

Blockers to resolve early (from SRS open questions): payment provider and operating country (BIL), Quran licence (CLS/Mushaf), video provider (CLS), safeguarding lead (CMP/QA), product name "Hifzoon" vs "Qirva" in SRS diagrams.

---

## 0. PLAT — Platform and foundation

| ID         | Side | Ticket                                                                                                                         | SRS         | Pri | Ph  | Deps       | Status | Owner | Notes |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- | --- | --- | ---------- | ------ | ----- | ----- |
| PLAT-FS-01 | FS   | Create npm workspaces monorepo (apps/api, apps/web, packages/shared), tsconfig base, ESLint, Prettier, Husky                   | TRD         | M   | P1  |            | TODO   |       |       |
| PLAT-FS-02 | FS   | Docker setup: api/web Dockerfiles, docker-compose (postgres, redis, minio, mailhog), env templates                             | TRD 16      | M   | P1  | PLAT-FS-01 | TODO   |       |       |
| PLAT-FS-03 | FS   | GitHub Actions CI: lint, typecheck, test, build, docker build, npm audit                                                       | NFR-MNT-01  | M   | P1  | PLAT-FS-01 | TODO   |       |       |
| PLAT-FS-04 | FS   | Staging environment and deploy pipeline                                                                                        | NFR-MNT-01  | M   | P1  | PLAT-FS-03 | TODO   |       |       |
| PLAT-BE-01 | BE   | NestJS bootstrap: config module (zod env), logger (Pino), global validation, error filter, response envelope                   | TRD 5       | M   | P1  | PLAT-FS-01 | TODO   |       |       |
| PLAT-BE-02 | BE   | Prisma setup, base schema, migration workflow, seed script                                                                     | ERD         | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-03 | BE   | OpenAPI (Swagger) generation + publish spec artifact in CI                                                                     | TRD 6       | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-04 | BE   | Redis + BullMQ setup, worker entrypoint, scheduler                                                                             | TRD 4       | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-05 | BE   | Health/readiness endpoints, Sentry, OpenTelemetry, alerts                                                                      | NFR-MNT-02  | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-06 | BE   | Storage integration (S3/MinIO) with signed URLs                                                                                | TRD 2       | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-07 | BE   | Integration interfaces: VideoProvider, PaymentProvider, Mailer, Messenger, QuranContent, SpeechProvider (with fakes for tests) | NFR-PORT-01 | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-BE-08 | BE   | Rate limiting (throttler) and security headers (helmet)                                                                        | NFR-SEC-04  | M   | P1  | PLAT-BE-01 | TODO   |       |       |
| PLAT-FE-01 | FE   | Next.js bootstrap: App Router, `[locale]` routing, next-intl (EN), Tailwind, shadcn/ui                                         | IR-UI-01    | M   | P1  | PLAT-FS-01 | TODO   |       |       |
| PLAT-FE-02 | FE   | Design system: tokens, light/dark themes, core components (button, form, table, dialog, toast), Storybook                      | IR-UI-01    | M   | P1  | PLAT-FE-01 | TODO   |       |       |
| PLAT-FE-03 | FE   | Typed API client generated from OpenAPI; TanStack Query provider; error handling                                               | TRD 6       | M   | P1  | PLAT-BE-03 | TODO   |       |       |
| PLAT-FE-04 | FE   | App shells per role (public, parent, student, teacher, staff, classroom), nav, responsive 360px                                | IR-UI-02    | M   | P1  | PLAT-FE-02 | TODO   |       |       |
| PLAT-FE-05 | FE   | Approved Mushaf font loader and `<QuranText>` component (non-editable, no system font fallback)                                | IR-UI-05    | M   | P1  | PLAT-FE-02 | TODO   |       |       |
| PLAT-FE-06 | FE   | Playwright + axe a11y setup in CI                                                                                              | NFR-ACC-01  | S   | P1  | PLAT-FS-03 | TODO   |       |       |
| PLAT-FE-07 | FE   | RTL support (logical CSS, `dir`), Urdu/Arabic message files scaffold                                                           | IR-UI-03    | M   | P2  | PLAT-FE-01 | TODO   |       |       |

---

## 1. AUTH — Accounts, roles and consent

| ID         | Side | Ticket                                                                                                                          | SRS                      | Pri | Ph  | Deps       | Status | Owner | Notes |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --- | --- | ---------- | ------ | ----- | ----- |
| AUTH-BE-01 | BE   | User + role models; register/login with email+password (Argon2id), JWT access + rotating refresh                                | FR-AUTH-01, NFR-SEC-01   | M   | P1  | PLAT-BE-02 | TODO   |       |       |
| AUTH-BE-02 | BE   | Google and Apple OAuth sign-in                                                                                                  | FR-AUTH-01, IR-SW-08     | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-BE-03 | BE   | Staff 2FA (TOTP + recovery codes), enforced for staff roles                                                                     | FR-AUTH-01               | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-BE-04 | BE   | Multi-role support, RBAC guards, ownership policy guards                                                                        | FR-AUTH-02, NFR-SEC-02   | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-BE-05 | BE   | Family accounts: guardians, students without email, add child                                                                   | FR-AUTH-03               | M   | P1  | AUTH-BE-04 | TODO   |       |       |
| AUTH-BE-06 | BE   | Guardian-to-child verification flow                                                                                             | CR-10                    | M   | P1  | AUTH-BE-05 | TODO   |       |       |
| AUTH-BE-07 | BE   | Consent ledger: verifiable parental consent, separate opt-ins (data, recording, AI voice), withdrawal, `@RequiresConsent` guard | FR-AUTH-04, CR-01, CR-06 | M   | P1  | AUTH-BE-05 | TODO   |       |       |
| AUTH-BE-08 | BE   | Guardian data export/download/delete requests, withdraw consent                                                                 | FR-AUTH-05, CR-05        | M   | P1  | AUTH-BE-07 | TODO   |       |       |
| AUTH-BE-09 | BE   | Session expiry (30 d personal, 12 h staff), inactivity tracking                                                                 | FR-AUTH-07               | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-BE-10 | BE   | Login rate limit, lock after 10 failures, email recovery                                                                        | NFR-SEC-04               | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-BE-11 | BE   | Kids PIN/picture password credential                                                                                            | FR-AUTH-06               | S   | P2  | AUTH-BE-05 | TODO   |       |       |
| AUTH-FE-01 | FE   | Sign-up / sign-in / forgot password pages (email, Google, Apple)                                                                | FR-AUTH-01               | M   | P1  | AUTH-BE-01 | TODO   |       |       |
| AUTH-FE-02 | FE   | Staff 2FA setup and challenge screens                                                                                           | FR-AUTH-01               | M   | P1  | AUTH-BE-03 | TODO   |       |       |
| AUTH-FE-03 | FE   | Auth session handling: in-memory access token, refresh cookie, route guards by role, role switcher                              | FR-AUTH-02               | M   | P1  | AUTH-BE-04 | TODO   |       |       |
| AUTH-FE-04 | FE   | Family setup: add guardian, add child (no email), verify guardian                                                               | FR-AUTH-03, CR-10        | M   | P1  | AUTH-BE-05 | TODO   |       |       |
| AUTH-FE-05 | FE   | Parental consent screens with separate opt-ins, plain-language notices, policy acceptance                                       | FR-AUTH-04, CR-12        | M   | P1  | AUTH-BE-07 | TODO   |       |       |
| AUTH-FE-06 | FE   | Privacy centre in parent portal: view/download/delete data, withdraw consent                                                    | FR-AUTH-05               | M   | P1  | AUTH-BE-08 | TODO   |       |       |
| AUTH-FE-07 | FE   | Kids mode sign-in (PIN / picture)                                                                                               | FR-AUTH-06               | S   | P2  | AUTH-BE-11 | TODO   |       |       |

---

## 2. ADM — Public website and admissions

| ID        | Side | Ticket                                                                                           | SRS                    | Pri | Ph  | Deps                 | Status | Owner | Notes |
| --------- | ---- | ------------------------------------------------------------------------------------------------ | ---------------------- | --- | --- | -------------------- | ------ | ----- | ----- |
| ADM-BE-01 | BE   | Public catalog APIs: courses, teacher profiles, pricing by currency, FAQs                        | FR-ADM-01              | M   | P1  | CRS-BE-01, TCH-BE-04 | TODO   |       |       |
| ADM-BE-02 | BE   | Currency detection by geo header + price lookup                                                  | FR-ADM-02              | M   | P1  | BIL-BE-01            | TODO   |       |       |
| ADM-BE-03 | BE   | Free trial booking: open slots in visitor time zone, no card, create lead + trial class          | FR-ADM-03, FR-OPS-01   | M   | P1  | SCH-BE-03            | TODO   |       |       |
| ADM-BE-04 | BE   | Booking confirmation by email (P1) and WhatsApp (P2) within 1 min, join link + .ics              | FR-ADM-04, IR-SW-09    | M   | P1  | NTF-BE-02            | TODO   |       |       |
| ADM-BE-05 | BE   | Trial outcome: placement level, recommended plan, subscribe link                                 | FR-ADM-05              | M   | P1  | ADM-BE-03            | TODO   |       |       |
| ADM-BE-06 | BE   | Teacher change request to admin with reason                                                      | FR-ADM-06, FR-PAR-05   | M   | P1  | AUTH-BE-05           | TODO   |       |       |
| ADM-BE-07 | BE   | CMS: blog, printables, country/city landing pages                                                | FR-ADM-08              | S   | P1  | PLAT-BE-02           | TODO   |       |       |
| ADM-BE-08 | BE   | Chat assistant (FAQ retrieval from approved content, trial booking, handover) for web + WhatsApp | FR-ADM-07              | S   | P2  | ADM-BE-01, NTF-BE-05 | TODO   |       |       |
| ADM-FE-01 | FE   | Home, course pages, teacher listing and profile pages (SSR/ISR, SEO metadata, sitemap)           | FR-ADM-01, NFR-PERF-01 | M   | P1  | ADM-BE-01            | TODO   |       |       |
| ADM-FE-02 | FE   | Pricing page with currency switch (auto + manual)                                                | FR-ADM-02              | M   | P1  | ADM-BE-02            | TODO   |       |       |
| ADM-FE-03 | FE   | Trial booking flow (course, age, teacher gender, slot in own time zone); under 2 min             | FR-ADM-03, NFR-USE-01  | M   | P1  | ADM-BE-03            | TODO   |       |       |
| ADM-FE-04 | FE   | Booking confirmation page, calendar download                                                     | FR-ADM-04              | M   | P1  | ADM-BE-04            | TODO   |       |       |
| ADM-FE-05 | FE   | Post-trial placement summary and one-click subscribe page                                        | FR-ADM-05              | M   | P1  | ADM-BE-05            | TODO   |       |       |
| ADM-FE-06 | FE   | Teacher application form (public)                                                                | FR-ADM-09, FR-TCH-01   | M   | P1  | TCH-BE-01            | TODO   |       |       |
| ADM-FE-07 | FE   | Blog, printables, landing page templates                                                         | FR-ADM-08              | S   | P1  | ADM-BE-07            | TODO   |       |       |
| ADM-FE-08 | FE   | FAQ page and chat widget                                                                         | FR-ADM-07              | S   | P2  | ADM-BE-08            | TODO   |       |       |
| ADM-FE-09 | FE   | Staff console: manage CMS content                                                                | FR-ADM-08              | S   | P1  | ADM-BE-07            | TODO   |       |       |

---

## 3. SCH — Scheduling and matching

| ID        | Side | Ticket                                                                                             | SRS                  | Pri | Ph  | Deps      | Status | Owner | Notes |
| --------- | ---- | -------------------------------------------------------------------------------------------------- | -------------------- | --- | --- | --------- | ------ | ----- | ----- |
| SCH-BE-01 | BE   | Teacher weekly availability (UTC storage, local display)                                           | FR-SCH-01            | M   | P1  | TCH-BE-04 | TODO   |       |       |
| SCH-BE-02 | BE   | Recurring schedule engine (RRULE + luxon) materialising class sessions; DST-safe                   | FR-SCH-02            | M   | P1  | SCH-BE-01 | TODO   |       |       |
| SCH-BE-03 | BE   | Open-slot search for trials and bookings                                                           | FR-ADM-03            | M   | P1  | SCH-BE-01 | TODO   |       |       |
| SCH-BE-04 | BE   | DST clash detection job + warn teacher 14+ days ahead                                              | FR-SCH-02            | M   | P1  | SCH-BE-02 | TODO   |       |       |
| SCH-BE-05 | BE   | Matching: filters (course, level, gender, language, age group, availability) and top 3 suggestions | FR-SCH-03            | M   | P1  | SCH-BE-01 | TODO   |       |       |
| SCH-BE-06 | BE   | Reschedule/cancel with configurable notice (default 4 h), make-up credit, late charge              | FR-SCH-04            | M   | P1  | SCH-BE-02 | TODO   |       |       |
| SCH-BE-07 | BE   | DB exclusion constraints + service checks against double-booking                                   | FR-SCH-07            | M   | P1  | SCH-BE-02 | TODO   |       |       |
| SCH-BE-08 | BE   | Substitute teacher offers in order + family notification                                           | FR-SCH-05            | S   | P2  | SCH-BE-06 | TODO   |       |       |
| SCH-BE-09 | BE   | Academy holidays and Ramadan timetable shift                                                       | FR-SCH-06            | S   | P2  | SCH-BE-02 | TODO   |       |       |
| SCH-FE-01 | FE   | Teacher availability editor (weekly grid, local time)                                              | FR-SCH-01            | M   | P1  | SCH-BE-01 | TODO   |       |       |
| SCH-FE-02 | FE   | Timetable/calendar views for teacher and family (local time, with DST-safe display)                | FR-SCH-01, FR-TCH-03 | M   | P1  | SCH-BE-02 | TODO   |       |       |
| SCH-FE-03 | FE   | Admin matching screen with filters and top-3 suggestions                                           | FR-SCH-03            | M   | P1  | SCH-BE-05 | TODO   |       |       |
| SCH-FE-04 | FE   | Reschedule/cancel dialogs, make-up credit display, late-charge warning                             | FR-SCH-04            | M   | P1  | SCH-BE-06 | TODO   |       |       |
| SCH-FE-05 | FE   | Teacher DST clash warnings UI                                                                      | FR-SCH-02            | M   | P1  | SCH-BE-04 | TODO   |       |       |
| SCH-FE-06 | FE   | Substitute offer inbox for teachers; family change notice                                          | FR-SCH-05            | S   | P2  | SCH-BE-08 | TODO   |       |       |
| SCH-FE-07 | FE   | Admin holidays / Ramadan timetable settings                                                        | FR-SCH-06            | S   | P2  | SCH-BE-09 | TODO   |       |       |

---

## 4. CLS — Live classroom and Mushaf

| ID        | Side | Ticket                                                                                            | SRS                             | Pri | Ph    | Deps                  | Status | Owner                        | Notes                       |
| --------- | ---- | ------------------------------------------------------------------------------------------------- | ------------------------------- | --- | ----- | --------------------- | ------ | ---------------------------- | --------------------------- |
| CLS-BE-01 | BE   | Mushaf content service (licensed source only), page/ayah/word data, cache TTL ≤ 7 days            | CR-11, IR-SW-02                 | M   | P1    | PLAT-BE-07            | TODO   |                              | Blocked on licence decision |
| CLS-BE-02 | BE   | Room token issuing: open 10 min before class, enrolment checks                                    | FR-CLS-01                       | M   | P1    | SCH-BE-02             | TODO   |                              |                             |
| CLS-BE-03 | BE   | LiveKit adapter: create room, tokens, webhooks                                                    | IR-SW-01, FR-CLS-02             | M   | P1    | PLAT-BE-07            | TODO   | Blocked on provider decision |
| CLS-BE-04 | BE   | Socket.IO gateway `/classroom`: page, highlight, pen, presence; teacher-only control; Redis state | FR-CLS-03, FR-CLS-07, IR-COM-02 | M   | P1    | CLS-BE-02             | TODO   |                              |
| CLS-BE-05 | BE   | Reconnect/rejoin restoring state in < 10 s                                                        | NFR-REL-01                      | M   | P1    | CLS-BE-04             | TODO   |                              |
| CLS-BE-06 | BE   | Attendance tracking (join/leave/minutes)                                                          | FR-CLS-14                       | M   | P1    | CLS-BE-04             | TODO   |                              |
| CLS-BE-07 | BE   | Layout support: Madani 15-line (P1), IndoPak 13/16 (P2), teacher choice synced                    | FR-CLS-04                       | M   | P1/P2 | CLS-BE-01             | TODO   |                              |
| CLS-BE-08 | BE   | Noorani Qaida board content and pointer events                                                    | FR-CLS-06                       | M   | P1    | CLS-BE-04             | TODO   |                              |
| CLS-BE-09 | BE   | Tajweed colour layer data + toggle event                                                          | FR-CLS-05                       | S   | P1    | CLS-BE-01             | TODO   |                              |
| CLS-BE-10 | BE   | Recording (egress) with consent check; ayah markers; 90-day deletion                              | FR-CLS-12, CR-02                | M   | P2    | CLS-BE-03, AUTH-BE-07 | TODO   |                              |
| CLS-BE-11 | BE   | Reference recitation audio from ≥ 3 qaris (URLs, loop metadata)                                   | FR-CLS-08                       | S   | P2    | CLS-BE-01             | TODO   |                              |
| CLS-BE-12 | BE   | Word meaning/translation API                                                                      | FR-CLS-09                       | C   | P2    | CLS-BE-01             | TODO   |                              |
| CLS-BE-13 | BE   | Circles: up to 8 students, recitation queue, hand-raise events                                    | FR-CLS-10                       | M   | P2    | CLS-BE-04             | TODO   |                              |
| CLS-BE-14 | BE   | Guardian view-only join, presence visible to teacher                                              | FR-CLS-13                       | M   | P2    | CLS-BE-02             | TODO   |                              |
| CLS-BE-15 | BE   | Women-only circles: hide male staff except permitted supervisors                                  | FR-CLS-15                       | S   | P2    | CLS-BE-13             | TODO   |                              |
| CLS-BE-16 | BE   | Poor-network handling: server-side bandwidth hints, audio/Mushaf continue without video           | FR-CLS-11                       | M   | P1    | CLS-BE-03             | TODO   |                              |
| CLS-FE-01 | FE   | Pre-join device check (camera, mic, speakers) with plain permission explanations                  | FR-CLS-02, IR-HW-01             | M   | P1    | CLS-BE-03             | TODO   |                              |
| CLS-FE-02 | FE   | One-tap join page/link; room opens 10 min early                                                   | FR-CLS-01                       | M   | P1    | CLS-BE-02             | TODO   |                              |
| CLS-FE-03 | FE   | Classroom layout: video tiles, mute controls, leave, responsive                                   | FR-CLS-02                       | M   | P1    | CLS-BE-03             | TODO   |                              |
| CLS-FE-04 | FE   | Mushaf viewer component (Madani 15-line) with page turn and word highlight sync < 500 ms          | FR-CLS-03, NFR-PERF-02          | M   | P1    | CLS-BE-04, PLAT-FE-05 | TODO   |                              |
| CLS-FE-05 | FE   | Teacher controls: layout switch, Tajweed colour toggle                                            | FR-CLS-04, FR-CLS-05            | M   | P1    | CLS-FE-04             | TODO   |                              |
| CLS-FE-06 | FE   | Pen and highlighter canvas (stylus/touch), cleared on page change                                 | FR-CLS-07, IR-HW-02             | S   | P1    | CLS-FE-04             | TODO   |                              |
| CLS-FE-07 | FE   | Noorani Qaida board with pointer                                                                  | FR-CLS-06                       | M   | P1    | CLS-BE-08             | TODO   |                              |
| CLS-FE-08 | FE   | Adaptive degradation: auto drop video, keep audio and sync; reconnect UI                          | FR-CLS-11, NFR-REL-01           | M   | P1    | CLS-FE-03             | TODO   |                              |
| CLS-FE-09 | FE   | IndoPak 13/16-line layouts                                                                        | FR-CLS-04                       | M   | P2    | CLS-BE-07             | TODO   |                              |
| CLS-FE-10 | FE   | Reference recitation player (3 qaris, loop, 0.75×)                                                | FR-CLS-08                       | S   | P2    | CLS-BE-11             | TODO   |                              |
| CLS-FE-11 | FE   | Tap-word meaning popover                                                                          | FR-CLS-09                       | C   | P2    | CLS-BE-12             | TODO   |                              |
| CLS-FE-12 | FE   | Circle UI: grid of up to 8, recitation queue, hand-raise                                          | FR-CLS-10                       | M   | P2    | CLS-BE-13             | TODO   |                              |
| CLS-FE-13 | FE   | Recording playback with ayah jump markers                                                         | FR-CLS-12                       | M   | P2    | CLS-BE-10             | TODO   |                              |
| CLS-FE-14 | FE   | Guardian view-only mode UI + teacher indicator                                                    | FR-CLS-13                       | M   | P2    | CLS-BE-14             | TODO   |                              |
| CLS-FE-15 | FE   | Report button in every class                                                                      | CR-08                           | M   | P1    | QA-BE-05              | TODO   |                              |

---

## 5. REC — Lesson records and mistake logging

| ID        | Side | Ticket                                                               | SRS                  | Pri | Ph  | Deps                 | Status | Owner | Notes |
| --------- | ---- | -------------------------------------------------------------------- | -------------------- | --- | --- | -------------------- | ------ | ----- | ----- |
| REC-BE-01 | BE   | Mistake model + create/list API (6 types, position data)             | FR-REC-01, FR-REC-02 | M   | P1  | CLS-BE-04            | TODO   |       |       |
| REC-BE-02 | BE   | Lesson card model + submit API with portions and grades              | FR-REC-03            | M   | P1  | REC-BE-01            | TODO   |       |       |
| REC-BE-03 | BE   | Prefill lesson card from class (pages shown, mistakes, attendance)   | FR-REC-04            | M   | P1  | REC-BE-02, CLS-BE-06 | TODO   |       |       |
| REC-BE-04 | BE   | Share lesson card to parent/student within 15 min of class end (job) | FR-REC-06            | M   | P1  | REC-BE-02, NTF-BE-02 | TODO   |       |       |
| REC-BE-05 | BE   | 48-hour lock; supervisor edits with edit log                         | FR-REC-08            | M   | P1  | REC-BE-02            | TODO   |       |       |
| REC-BE-06 | BE   | AI draft parent summary; teacher approval before send                | FR-REC-05            | S   | P2  | REC-BE-02            | TODO   |       |       |
| REC-BE-07 | BE   | Clip up to 60 s from recording and attach                            | FR-REC-07            | C   | P2  | CLS-BE-10            | TODO   |       |       |
| REC-FE-01 | FE   | In-class mistake marking: tap word → choose type                     | FR-REC-01            | M   | P1  | REC-BE-01, CLS-FE-04 | TODO   |       |       |
| REC-FE-02 | FE   | Lesson card form (prefilled, < 2 min to confirm)                     | FR-REC-03, FR-REC-04 | M   | P1  | REC-BE-03            | TODO   |       |       |
| REC-FE-03 | FE   | Lesson card viewer for parent and student                            | FR-REC-06, FR-PAR-02 | M   | P1  | REC-BE-04            | TODO   |       |       |
| REC-FE-04 | FE   | Supervisor edit UI with edit history                                 | FR-REC-08            | M   | P1  | REC-BE-05            | TODO   |       |       |
| REC-FE-05 | FE   | AI summary review/approve UI                                         | FR-REC-05            | S   | P2  | REC-BE-06            | TODO   |       |       |
| REC-FE-06 | FE   | Recording clip tool                                                  | FR-REC-07            | C   | P2  | REC-BE-07            | TODO   |       |       |

---

## 6. HFZ — Hifz engine (P2)

| ID        | Side | Ticket                                                                                     | SRS       | Pri | Ph  | Deps      | Status | Owner | Notes |
| --------- | ---- | ------------------------------------------------------------------------------------------ | --------- | --- | --- | --------- | ------ | ----- | ----- |
| HFZ-BE-01 | BE   | Page state model (604 pages × student)                                                     | FR-HFZ-01 | M   | P2  | REC-BE-02 | TODO   |       |       |
| HFZ-BE-02 | BE   | Rules engine: update page state from grades and mistakes; academic-head-configurable rules | FR-HFZ-02 | M   | P2  | HFZ-BE-01 | TODO   |       |       |
| HFZ-BE-03 | BE   | Daily sabaq/sabqi/manzil proposal; accept/change API                                       | FR-HFZ-03 | M   | P2  | HFZ-BE-02 | TODO   |       |       |
| HFZ-BE-04 | BE   | Spaced repetition scheduling for manzil                                                    | FR-HFZ-04 | S   | P2  | HFZ-BE-02 | TODO   |       |       |
| HFZ-BE-05 | BE   | Heat map data endpoint                                                                     | FR-HFZ-05 | S   | P2  | HFZ-BE-01 | TODO   |       |       |
| HFZ-BE-06 | BE   | Goals + lines/day calculation + 7-day behind alerts                                        | FR-HFZ-06 | S   | P2  | HFZ-BE-01 | TODO   |       |       |
| HFZ-BE-07 | BE   | Teacher alert: good sabaq + falling manzil for 2 weeks                                     | FR-HFZ-07 | S   | P2  | HFZ-BE-02 | TODO   |       |       |
| HFZ-BE-08 | BE   | Muraja'ah-only plan                                                                        | FR-HFZ-08 | C   | P3  | HFZ-BE-03 | TODO   |       |       |
| HFZ-FE-01 | FE   | Mushaf heat map component (604 pages) for student/parent/teacher                           | FR-HFZ-05 | S   | P2  | HFZ-BE-05 | TODO   |       |       |
| HFZ-FE-02 | FE   | Daily plan screen for teacher (accept/change) and student view                             | FR-HFZ-03 | M   | P2  | HFZ-BE-03 | TODO   |       |       |
| HFZ-FE-03 | FE   | Goal setting and progress UI                                                               | FR-HFZ-06 | S   | P2  | HFZ-BE-06 | TODO   |       |       |
| HFZ-FE-04 | FE   | Teacher alerts panel                                                                       | FR-HFZ-07 | S   | P2  | HFZ-BE-07 | TODO   |       |       |
| HFZ-FE-05 | FE   | Admin/academic head rule configuration screen                                              | FR-HFZ-02 | M   | P2  | HFZ-BE-02 | TODO   |       |       |
| HFZ-FE-06 | FE   | Muraja'ah plan switch                                                                      | FR-HFZ-08 | C   | P3  | HFZ-BE-08 | TODO   |       |       |

---

## 7. AIC — AI recitation coach (P3)

| ID        | Side | Ticket                                                                | SRS                    | Pri | Ph  | Deps       | Status | Owner | Notes |
| --------- | ---- | --------------------------------------------------------------------- | ---------------------- | --- | --- | ---------- | ------ | ----- | ----- |
| AIC-BE-01 | BE   | Practice assignment API                                               | FR-AIC-01              | M   | P3  | REC-BE-01  | TODO   |       |       |
| AIC-BE-02 | BE   | SpeechProvider adapter + streaming audio endpoint                     | IR-SW-07               | M   | P3  | PLAT-BE-07 | TODO   |       |       |
| AIC-BE-03 | BE   | Reading mode: word alignment, flag skipped/added/wrong word/vowel     | FR-AIC-02              | M   | P3  | AIC-BE-02  | TODO   |       |       |
| AIC-BE-04 | BE   | Memorisation mode: hidden text, reveal counting                       | FR-AIC-03              | M   | P3  | AIC-BE-02  | TODO   |       |       |
| AIC-BE-05 | BE   | Feedback < 3 s; correct recitation retry audio                        | FR-AIC-04, NFR-PERF-04 | M   | P3  | AIC-BE-03  | TODO   |       |       |
| AIC-BE-06 | BE   | Tajweed beta suggestions with confidence                              | FR-AIC-05              | S   | P3  | AIC-BE-03  | TODO   |       |       |
| AIC-BE-07 | BE   | Save results to learning record and teacher pre-class brief           | FR-AIC-06              | M   | P3  | AIC-BE-03  | TODO   |       |       |
| AIC-BE-08 | BE   | Teacher confirm/dismiss flags; keep dismissed for evaluation          | FR-AIC-07              | S   | P3  | AIC-BE-03  | TODO   |       |       |
| AIC-BE-09 | BE   | Voice search for surah/ayah                                           | FR-AIC-08              | C   | P3  | AIC-BE-02  | TODO   |       |       |
| AIC-BE-10 | BE   | Consent gate for children; 30-day audio deletion                      | FR-AIC-09, CR-02       | M   | P3  | AUTH-BE-07 | TODO   |       |       |
| AIC-BE-11 | BE   | Evaluation harness: AI vs teacher test set agreement report (P3 gate) | SRS 9                  | M   | P3  | AIC-BE-08  | TODO   |       |       |
| AIC-FE-01 | FE   | Home screen practice card from assignments                            | FR-AIC-01              | M   | P3  | AIC-BE-01  | TODO   |       |       |
| AIC-FE-02 | FE   | Reading mode UI: live word-by-word highlighting and flags             | FR-AIC-02              | M   | P3  | AIC-BE-03  | TODO   |       |       |
| AIC-FE-03 | FE   | Memorisation mode UI: hidden text, one-word reveal                    | FR-AIC-03              | M   | P3  | AIC-BE-04  | TODO   |       |       |
| AIC-FE-04 | FE   | Hear correct recitation + retry                                       | FR-AIC-04              | M   | P3  | AIC-BE-05  | TODO   |       |       |
| AIC-FE-05 | FE   | Beta Tajweed feedback with confidence badge                           | FR-AIC-05              | S   | P3  | AIC-BE-06  | TODO   |       |       |
| AIC-FE-06 | FE   | Teacher review screen for AI flags                                    | FR-AIC-07              | S   | P3  | AIC-BE-08  | TODO   |       |       |
| AIC-FE-07 | FE   | Voice search UI                                                       | FR-AIC-08              | C   | P3  | AIC-BE-09  | TODO   |       |       |
| AIC-FE-08 | FE   | AI voice consent prompt when disabled                                 | FR-AIC-09              | M   | P3  | AIC-BE-10  | TODO   |       |       |

---

## 8. CRS — Courses and assessments

| ID        | Side | Ticket                                                                  | SRS       | Pri | Ph  | Deps       | Status | Owner | Notes |
| --------- | ---- | ----------------------------------------------------------------------- | --------- | --- | --- | ---------- | ------ | ----- | ----- |
| CRS-BE-01 | BE   | Course/level/lesson CRUD and seed of all course types                   | FR-CRS-01 | M   | P1  | PLAT-BE-02 | TODO   |       |       |
| CRS-BE-02 | BE   | Enrolment API; next lesson for any teacher incl. substitute             | FR-CRS-02 | M   | P1  | CRS-BE-01  | TODO   |       |       |
| CRS-BE-03 | BE   | Level assessments with rubric; pass moves level                         | FR-CRS-03 | M   | P2  | CRS-BE-02  | TODO   |       |       |
| CRS-BE-04 | BE   | Milestone exams assigned to non-own examiner                            | FR-CRS-04 | M   | P2  | CRS-BE-03  | TODO   |       |       |
| CRS-BE-05 | BE   | Certificate generation (PDF, serial, QR) + public verification endpoint | FR-CRS-05 | M   | P2  | CRS-BE-03  | TODO   |       |       |
| CRS-BE-06 | BE   | Ijazah track with sanad                                                 | FR-CRS-06 | C   | P3  | CRS-BE-04  | TODO   |       |       |
| CRS-FE-01 | FE   | Admin course builder (levels, ordered lessons, materials)               | FR-CRS-01 | M   | P1  | CRS-BE-01  | TODO   |       |       |
| CRS-FE-02 | FE   | Lesson plan panel for teachers (objectives, notes, next lesson)         | FR-CRS-02 | M   | P1  | CRS-BE-02  | TODO   |       |       |
| CRS-FE-03 | FE   | Assessment form with rubric and result                                  | FR-CRS-03 | M   | P2  | CRS-BE-03  | TODO   |       |       |
| CRS-FE-04 | FE   | Examiner dashboard: assigned milestone exams                            | FR-CRS-04 | M   | P2  | CRS-BE-04  | TODO   |       |       |
| CRS-FE-05 | FE   | Certificate view/download + public verification page                    | FR-CRS-05 | M   | P2  | CRS-BE-05  | TODO   |       |       |
| CRS-FE-06 | FE   | Ijazah recording and sanad screens                                      | FR-CRS-06 | C   | P3  | CRS-BE-06  | TODO   |       |       |

---

## 9. PAR — Parent portal

| ID        | Side | Ticket                                                                                 | SRS                  | Pri | Ph  | Deps                 | Status | Owner | Notes |
| --------- | ---- | -------------------------------------------------------------------------------------- | -------------------- | --- | --- | -------------------- | ------ | ----- | ----- |
| PAR-BE-01 | BE   | Family dashboard aggregation (next class, monthly attendance, weekly practice minutes) | FR-PAR-01            | M   | P1  | CLS-BE-06            | TODO   |       |       |
| PAR-BE-02 | BE   | Lesson card + recording access with mistake jumps                                      | FR-PAR-02            | M   | P1  | REC-BE-02            | TODO   |       |       |
| PAR-BE-03 | BE   | 3-month charts data (mistakes per lesson, practice per week)                           | FR-PAR-03            | S   | P2  | REC-BE-01            | TODO   |       |       |
| PAR-BE-04 | BE   | Monthly report card: computed figures + teacher comments + 5 ratings                   | FR-PAR-04            | M   | P2  | REC-BE-02            | TODO   |       |       |
| PAR-BE-05 | BE   | Plan actions: reschedule, pause ≤ 30 days, cancel, teacher change                      | FR-PAR-05            | M   | P1  | BIL-BE-04, SCH-BE-06 | TODO   |       |       |
| PAR-BE-06 | BE   | In-app messaging with logging, supervisor visibility                                   | FR-PAR-07, FR-NTF-03 | M   | P1  | AUTH-BE-04           | TODO   |       |       |
| PAR-FE-01 | FE   | Family dashboard (multi-child)                                                         | FR-PAR-01            | M   | P1  | PAR-BE-01            | TODO   |       |       |
| PAR-FE-02 | FE   | Lesson card list/detail + recording player                                             | FR-PAR-02            | M   | P1  | PAR-BE-02            | TODO   |       |       |
| PAR-FE-03 | FE   | Progress charts                                                                        | FR-PAR-03            | S   | P2  | PAR-BE-03            | TODO   |       |       |
| PAR-FE-04 | FE   | Monthly report card page/printable                                                     | FR-PAR-04            | M   | P2  | PAR-BE-04            | TODO   |       |       |
| PAR-FE-05 | FE   | Plan management UI (pause/cancel/change teacher)                                       | FR-PAR-05            | M   | P1  | PAR-BE-05            | TODO   |       |       |
| PAR-FE-06 | FE   | Billing area: invoices, payment method, receipts, certificates                         | FR-PAR-06            | M   | P1  | BIL-BE-05            | TODO   |       |       |
| PAR-FE-07 | FE   | Messaging inbox with teacher                                                           | FR-PAR-07            | M   | P1  | PAR-BE-06            | TODO   |       |       |
| PAR-FE-08 | FE   | Class rating prompt after lesson card                                                  | FR-QA-04             | S   | P1  | QA-BE-01             | TODO   |       |       |

---

## 10. TCH — Teacher portal and hiring

| ID        | Side | Ticket                                                                       | SRS              | Pri | Ph  | Deps       | Status | Owner | Notes |
| --------- | ---- | ---------------------------------------------------------------------------- | ---------------- | --- | --- | ---------- | ------ | ----- | ----- |
| TCH-BE-01 | BE   | Teacher application API (details, documents, recitation upload)              | FR-TCH-01        | M   | P1  | PLAT-BE-06 | TODO   |       |       |
| TCH-BE-02 | BE   | Hiring pipeline steps and status tracking                                    | FR-TCH-01        | M   | P1  | TCH-BE-01  | TODO   |       |       |
| TCH-BE-03 | BE   | `ready_to_match` rule: all steps + safeguarding training complete            | FR-TCH-02, CR-09 | M   | P1  | TCH-BE-02  | TODO   |       |       |
| TCH-BE-04 | BE   | Teacher profile + admin approval of profile changes                          | FR-TCH-05        | S   | P1  | TCH-BE-02  | TODO   |       |       |
| TCH-BE-05 | BE   | Pre-class brief API (last card, homework, recurring mistakes, AI results P3) | FR-TCH-04        | M   | P1  | REC-BE-02  | TODO   |       |       |
| TCH-BE-06 | BE   | Earnings API (classes, deductions, bonuses, payout status)                   | FR-TCH-06        | M   | P1  | BIL-BE-08  | TODO   |       |       |
| TCH-BE-07 | BE   | Planned absence → trigger substitution                                       | FR-TCH-07        | M   | P2  | SCH-BE-08  | TODO   |       |       |
| TCH-BE-08 | BE   | Training courses/quizzes assignment and tracking                             | FR-TCH-08        | S   | P2  | TCH-BE-02  | TODO   |       |       |
| TCH-FE-01 | FE   | Admin hiring pipeline board                                                  | FR-TCH-01        | M   | P1  | TCH-BE-02  | TODO   |       |       |
| TCH-FE-02 | FE   | Teacher daily timetable with one-tap join                                    | FR-TCH-03        | M   | P1  | SCH-BE-02  | TODO   |       |       |
| TCH-FE-03 | FE   | Pre-class brief screen                                                       | FR-TCH-04        | M   | P1  | TCH-BE-05  | TODO   |       |       |
| TCH-FE-04 | FE   | Profile editor (changes pending admin approval)                              | FR-TCH-05        | S   | P1  | TCH-BE-04  | TODO   |       |       |
| TCH-FE-05 | FE   | Earnings screen                                                              | FR-TCH-06        | M   | P1  | TCH-BE-06  | TODO   |       |       |
| TCH-FE-06 | FE   | Mark absence UI                                                              | FR-TCH-07        | M   | P2  | TCH-BE-07  | TODO   |       |       |
| TCH-FE-07 | FE   | Training portal                                                              | FR-TCH-08        | S   | P2  | TCH-BE-08  | TODO   |       |       |

---

## 11. QA — Supervisor and quality

| ID       | Side | Ticket                                                                                        | SRS                | Pri | Ph  | Deps      | Status | Owner | Notes |
| -------- | ---- | --------------------------------------------------------------------------------------------- | ------------------ | --- | --- | --------- | ------ | ----- | ----- |
| QA-BE-01 | BE   | Class rating API (1–5 stars + comment)                                                        | FR-QA-04           | S   | P1  | REC-BE-04 | TODO   |       |       |
| QA-BE-02 | BE   | Monthly random recording sampling job (default 2/teacher)                                     | FR-QA-01           | S   | P2  | CLS-BE-10 | TODO   |       |       |
| QA-BE-03 | BE   | Rubric scoring and feedback; teacher reply                                                    | FR-QA-02           | M   | P2  | QA-BE-02  | TODO   |       |       |
| QA-BE-04 | BE   | Teacher scorecard aggregation                                                                 | FR-QA-03           | M   | P2  | QA-BE-03  | TODO   |       |       |
| QA-BE-05 | BE   | Case management (complaint, safeguarding) with RLS; report button; lead alerted within 15 min | FR-QA-05, CR-08    | M   | P1  | NTF-BE-02 | TODO   |       |       |
| QA-FE-01 | FE   | Rating UI                                                                                     | FR-QA-04           | S   | P1  | QA-BE-01  | TODO   |       |       |
| QA-FE-02 | FE   | Supervisor review queue + rubric scoring screen                                               | FR-QA-01, FR-QA-02 | M   | P2  | QA-BE-03  | TODO   |       |       |
| QA-FE-03 | FE   | Teacher feedback inbox/reply                                                                  | FR-QA-02           | M   | P2  | QA-BE-03  | TODO   |       |       |
| QA-FE-04 | FE   | Teacher scorecard dashboard                                                                   | FR-QA-03           | M   | P2  | QA-BE-04  | TODO   |       |       |
| QA-FE-05 | FE   | Case list/detail UI; reusable report dialog for class, chat, profile                          | FR-QA-05, CR-08    | M   | P1  | QA-BE-05  | TODO   |       |       |

---

## 12. OPS — Admin and CRM

| ID        | Side | Ticket                                                                                           | SRS                  | Pri | Ph  | Deps       | Status | Owner | Notes |
| --------- | ---- | ------------------------------------------------------------------------------------------------ | -------------------- | --- | --- | ---------- | ------ | ----- | ----- |
| OPS-BE-01 | BE   | Lead model, status flow, owner assignment, auto-create from enquiries/trials                     | FR-OPS-01            | M   | P1  | ADM-BE-03  | TODO   |       |       |
| OPS-BE-02 | BE   | Follow-up tasks for no-shows and unconverted trials (3 days)                                     | FR-OPS-02            | S   | P1  | OPS-BE-01  | TODO   |       |       |
| OPS-BE-03 | BE   | Admin CRUD/search/filter for students, families, teachers, classes, subscriptions                | FR-OPS-03            | M   | P1  | AUTH-BE-04 | TODO   |       |       |
| OPS-BE-04 | BE   | Dashboard metrics (active students, trials, conversion, churn, revenue, utilisation, completion) | FR-OPS-04            | M   | P2  | BIL-BE-04  | TODO   |       |       |
| OPS-BE-05 | BE   | App settings and role-permission config without code changes                                     | FR-OPS-05            | M   | P1  | AUTH-BE-04 | TODO   |       |       |
| OPS-BE-06 | BE   | Audit log interceptor, append-only table                                                         | FR-OPS-06            | M   | P1  | PLAT-BE-02 | TODO   |       |       |
| OPS-FE-01 | FE   | Staff console shell: nav, permissions-based menus, 12 h session                                  | FR-AUTH-07           | M   | P1  | PLAT-FE-04 | TODO   |       |       |
| OPS-FE-02 | FE   | CRM leads board/list + tasks                                                                     | FR-OPS-01, FR-OPS-02 | M   | P1  | OPS-BE-01  | TODO   |       |       |
| OPS-FE-03 | FE   | Admin data management screens with search/filter                                                 | FR-OPS-03            | M   | P1  | OPS-BE-03  | TODO   |       |       |
| OPS-FE-04 | FE   | Analytics dashboards (weekly/monthly)                                                            | FR-OPS-04            | M   | P2  | OPS-BE-04  | TODO   |       |       |
| OPS-FE-05 | FE   | Super-admin settings: prices, plans, discounts, cancellation rules, roles/permissions            | FR-OPS-05            | M   | P1  | OPS-BE-05  | TODO   |       |       |
| OPS-FE-06 | FE   | Audit log viewer                                                                                 | FR-OPS-06            | M   | P1  | OPS-BE-06  | TODO   |       |       |

---

## 13. BIL — Billing and payroll

| ID        | Side | Ticket                                                                                    | SRS                             | Pri | Ph  | Deps                 | Status | Owner | Notes                                |
| --------- | ---- | ----------------------------------------------------------------------------------------- | ------------------------------- | --- | --- | -------------------- | ------ | ----- | ------------------------------------ |
| BIL-BE-01 | BE   | Plans, per-currency prices, discount rules                                                | FR-BIL-01, FR-BIL-02, FR-ADM-02 | M   | P1  | PLAT-BE-02           | TODO   |       | Needs final prices                   |
| BIL-BE-02 | BE   | PaymentProvider adapter (first provider) + webhooks + idempotency                         | FR-BIL-01, IR-SW-03             | M   | P1  | PLAT-BE-07           | TODO   |       | Blocked on operating entity decision |
| BIL-BE-03 | BE   | PayPal / Apple Pay / Google Pay support                                                   | FR-BIL-01                       | M   | P1  | BIL-BE-02            | TODO   |       |                                      |
| BIL-BE-04 | BE   | Subscriptions: create, pause (≤ 30 d), cancel, prepaid 3/6-month, sibling discount        | FR-BIL-01, FR-BIL-02, FR-PAR-05 | M   | P1  | BIL-BE-02            | TODO   |       |                                      |
| BIL-BE-05 | BE   | Invoices/receipts (PDF, currency paid, academy details)                                   | FR-BIL-04                       | M   | P1  | BIL-BE-04            | TODO   |       |                                      |
| BIL-BE-06 | BE   | Failed-payment dunning: 3 retries / 7 days + reminders; pause classes after final failure | FR-BIL-03                       | M   | P1  | BIL-BE-04, NTF-BE-02 | TODO   |       |                                      |
| BIL-BE-07 | BE   | Refunds (full/partial) and class credits with reason                                      | FR-BIL-05                       | M   | P1  | BIL-BE-02            | TODO   |       |                                      |
| BIL-BE-08 | BE   | Payroll calculation per period (rates, deductions, bonuses)                               | FR-BIL-06                       | M   | P1  | CLS-BE-06, SCH-BE-06 | TODO   |       |                                      |
| BIL-BE-09 | BE   | Payroll export and mark paid                                                              | FR-BIL-07                       | M   | P1  | BIL-BE-08            | TODO   |       |                                      |
| BIL-BE-10 | BE   | Sponsorship: donor-funded seats and anonymous updates                                     | FR-BIL-08                       | C   | P3  | BIL-BE-04            | TODO   |       |                                      |
| BIL-FE-01 | FE   | Subscribe/checkout flow (plan, currency, payment method)                                  | FR-BIL-01                       | M   | P1  | BIL-BE-04            | TODO   |       |                                      |
| BIL-FE-02 | FE   | Payment method management and failed payment banners                                      | FR-BIL-03, FR-PAR-06            | M   | P1  | BIL-BE-06            | TODO   |       |                                      |
| BIL-FE-03 | FE   | Invoice and receipt pages                                                                 | FR-BIL-04                       | M   | P1  | BIL-BE-05            | TODO   |       |                                      |
| BIL-FE-04 | FE   | Admin refunds/credits UI                                                                  | FR-BIL-05                       | M   | P1  | BIL-BE-07            | TODO   |       |                                      |
| BIL-FE-05 | FE   | Admin payroll screens: period run, review, export, mark paid                              | FR-BIL-06, FR-BIL-07            | M   | P1  | BIL-BE-09            | TODO   |       |                                      |
| BIL-FE-06 | FE   | Sponsorship admin and donor pages                                                         | FR-BIL-08                       | C   | P3  | BIL-BE-10            | TODO   |       |                                      |

---

## 14. NTF — Notifications and messaging

| ID        | Side | Ticket                                                                                                            | SRS                  | Pri | Ph  | Deps                 | Status | Owner | Notes |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------------- | -------------------- | --- | --- | -------------------- | ------ | ----- | ----- |
| NTF-BE-01 | BE   | Notification templates (locale-aware) and preferences model                                                       | FR-NTF-01, FR-NTF-04 | M   | P1  | PLAT-BE-04           | TODO   |       |       |
| NTF-BE-02 | BE   | Email channel + queue; event listeners for lesson card, report card, missed class, teacher change, payment events | FR-NTF-02, IR-SW-04  | M   | P1  | NTF-BE-01            | TODO   |       |       |
| NTF-BE-03 | BE   | Class reminders at 24 h and 15 min (email P1), re-plan on reschedule                                              | FR-NTF-01            | M   | P1  | NTF-BE-02, SCH-BE-02 | TODO   |       |       |
| NTF-BE-04 | BE   | Contact masking rules; all staff/family messaging in-app or official WhatsApp                                     | FR-NTF-03, CR-07     | M   | P1  | PAR-BE-06            | TODO   |       |       |
| NTF-BE-05 | BE   | WhatsApp Business API channel                                                                                     | FR-NTF-01, IR-SW-05  | M   | P2  | NTF-BE-02            | TODO   |       |       |
| NTF-BE-06 | BE   | Push notifications (APNs/FCM), device tokens                                                                      | IR-SW-06             | M   | P2  | NTF-BE-02            | TODO   |       |       |
| NTF-BE-07 | BE   | Quiet hours and language handling                                                                                 | FR-NTF-04            | S   | P2  | NTF-BE-01            | TODO   |       |       |
| NTF-FE-01 | FE   | Notification preferences UI (channels, quiet hours, language)                                                     | FR-NTF-01, FR-NTF-04 | M   | P1  | NTF-BE-01            | TODO   |       |       |
| NTF-FE-02 | FE   | In-app notification centre                                                                                        | FR-NTF-02            | S   | P1  | NTF-BE-02            | TODO   |       |       |
| NTF-FE-03 | FE   | Push permission flow (mobile/PWA)                                                                                 | IR-SW-06             | M   | P2  | NTF-BE-06            | TODO   |       |       |

---

## 15. ENG — Engagement (P2–P3)

| ID        | Side | Ticket                                                                                          | SRS                             | Pri | Ph  | Deps      | Status | Owner | Notes |
| --------- | ---- | ----------------------------------------------------------------------------------------------- | ------------------------------- | --- | --- | --------- | ------ | ----- | ----- |
| ENG-BE-01 | BE   | Referral codes with free week each                                                              | FR-ENG-06                       | S   | P2  | BIL-BE-04 | TODO   |       |       |
| ENG-BE-02 | BE   | Teacher-awarded stickers                                                                        | FR-ENG-03                       | C   | P2  | CLS-BE-04 | TODO   |       |       |
| ENG-BE-03 | BE   | Effort-based streaks and badges; family-only leaderboard                                        | FR-ENG-01, FR-ENG-02            | S   | P3  | REC-BE-02 | TODO   |       |       |
| ENG-BE-04 | BE   | Adult goals, per-ayah notes, vocabulary flashcards                                              | FR-ENG-04                       | C   | P3  | CLS-BE-01 | TODO   |       |       |
| ENG-BE-05 | BE   | Daily ayah, prayer times, Ramadan khatm planner                                                 | FR-ENG-05                       | C   | P3  | CLS-BE-01 | TODO   |       |       |
| ENG-FE-01 | FE   | Referral share UI                                                                               | FR-ENG-06                       | S   | P2  | ENG-BE-01 | TODO   |       |       |
| ENG-FE-02 | FE   | Sticker awarding and display                                                                    | FR-ENG-03                       | C   | P2  | ENG-BE-02 | TODO   |       |       |
| ENG-FE-03 | FE   | Kids mode home: join, practice, journey map, badges; large targets, spoken labels, no free text | FR-ENG-01, IR-UI-04, NFR-USE-02 | S   | P3  | ENG-BE-03 | TODO   |       |       |
| ENG-FE-04 | FE   | Adult learning tools UI                                                                         | FR-ENG-04                       | C   | P3  | ENG-BE-04 | TODO   |       |       |
| ENG-FE-05 | FE   | Home widgets: daily ayah, prayer times, Ramadan planner                                         | FR-ENG-05                       | C   | P3  | ENG-BE-05 | TODO   |       |       |

---

## 16. CMP — Compliance, security and data retention

| ID        | Side | Ticket                                                                                | SRS                 | Pri | Ph  | Deps       | Status | Owner | Notes |
| --------- | ---- | ------------------------------------------------------------------------------------- | ------------------- | --- | --- | ---------- | ------ | ----- | ----- |
| CMP-BE-01 | BE   | Retention jobs: recordings 90 d, AI audio 30 d, leads 12 m, audit 3 y                 | Sec 7, CR-02        | M   | P1  | PLAT-BE-04 | TODO   |       |       |
| CMP-BE-02 | BE   | Biometric (voice/face) data handling: consent-gated collection and storage encryption | CR-02               | M   | P1  | AUTH-BE-07 | TODO   |       |       |
| CMP-BE-03 | BE   | Block use of children's data for ads/training without separate consent                | CR-06               | M   | P1  | AUTH-BE-07 | TODO   |       |       |
| CMP-BE-04 | BE   | Data export/deletion within 30 days workflow (queue + SLA tracking)                   | CR-05               | M   | P1  | AUTH-BE-08 | TODO   |       |       |
| CMP-BE-05 | BE   | Encryption at rest/in transit checks; column encryption for ID documents              | NFR-SEC-01          | M   | P1  | TCH-BE-01  | TODO   |       |       |
| CMP-BE-06 | BE   | Backups: PITR 14 d, cross-region copy, restore drill script                           | DR-01, DR-02, DR-03 | M   | P1  | PLAT-FS-04 | TODO   |       |       |
| CMP-FS-01 | FS   | Policy pages and acceptance at sign-up: ToS, privacy, child safety, refund            | CR-12               | M   | P1  | AUTH-FE-01 | TODO   |       |       |
| CMP-FS-02 | FS   | Written security programme and data retention policy docs                             | CR-03               | M   | P1  |            | TODO   |       |       |
| CMP-FS-03 | FS   | UK GDPR DPIA + high-privacy defaults (no nudging children)                            | CR-04               | M   | P1  |            | TODO   |       |       |
| CMP-FS-04 | FS   | Privacy lawyer review of consent flows, policies, retention                           | CR-13               | M   | P1  | AUTH-FE-05 | TODO   |       |       |
| CMP-FS-05 | FS   | Independent penetration test before P1 launch; fix critical/high                      | NFR-SEC-03          | M   | P1  |            | TODO   |       |       |
| CMP-FE-01 | FE   | Contact detail masking in all staff/teacher views                                     | CR-07               | M   | P1  | NTF-BE-04  | TODO   |       |       |
| CMP-FE-02 | FE   | WCAG 2.2 AA audit and fixes                                                           | NFR-ACC-01          | S   | P1  | PLAT-FE-06 | TODO   |       |       |

---

## 17. REL — Release, testing, load and pilot

| ID        | Side | Ticket                                                                     | SRS                      | Pri | Ph    | Deps       | Status | Owner | Notes                       |
| --------- | ---- | -------------------------------------------------------------------------- | ------------------------ | --- | ----- | ---------- | ------ | ----- | --------------------------- |
| REL-FS-01 | FS   | Test case per requirement ID, linked in test names; traceability report    | SRS 9                    | M   | P1    |            | TODO   |       |                             |
| REL-BE-01 | BE   | Load test: 200 simultaneous classes, 5,000 active students (k6)            | NFR-CAP-01               | M   | P1    | CLS-BE-04  | TODO   |       |                             |
| REL-BE-02 | BE   | Latency tests: Mushaf sync < 500 ms (p95), audio < 400 ms (p95)            | NFR-PERF-02, NFR-PERF-03 | M   | P1    | CLS-BE-04  | TODO   |       |                             |
| REL-FE-01 | FE   | Performance: LCP < 2.5 s on mid-range phone over 4G                        | NFR-PERF-01              | M   | P1    | ADM-FE-01  | TODO   |       |                             |
| REL-FS-02 | FS   | Usability tests: 5 parents, 5 children, 3 teachers                         | NFR-USE-01, NFR-USE-02   | M   | P1    |            | TODO   |       |                             |
| REL-FS-03 | FS   | Pilot: ~10 families, 3 teachers, 2 weeks with no platform-fault class loss | SRS 9                    | M   | P1    |            | TODO   |       |                             |
| REL-FS-04 | FS   | P1 gate: 50 paying families run fully in-app                               | SRS 9                    | M   | P1    |            | TODO   |       |                             |
| REL-FS-05 | FS   | P2 gate: 300 active students; teachers complete lesson card every class    | SRS 9                    | M   | P2    |            | TODO   |       |                             |
| REL-FS-06 | FS   | P3 gate: AI agrees with teachers on test set before opening to all         | SRS 9                    | M   | P3    | AIC-BE-11  | TODO   |       |                             |
| REL-FS-07 | FS   | Mobile apps (iOS 16+, Android 10+)                                         | SRS 2                    | M   | P2    |            | TODO   |       | Decide RN/Expo vs PWA-first |
| REL-FS-08 | FS   | Localisation: Urdu + Arabic (P2), French (P3)                              | NFR-L10N-01              | M   | P2/P3 | PLAT-FE-07 | TODO   |       |                             |

---

## Suggested build order (P1)

1. PLAT (all FS/BE/FE foundation)
2. AUTH + consent → families
3. CRS (courses) + TCH hiring → SCH availability/matching
4. CLS Mushaf + classroom + REC (mistakes, lesson card)
5. ADM public site + trial booking + OPS leads
6. PAR portal + NTF email
7. BIL (after payment decision) + payroll
8. CMP, REL: pen test, lawyer review, load test, pilot

Parallel work: BE merges the OpenAPI contract for a ticket first; FE builds against the generated client and mocks (MSW), then switches to the live API.

## Change log

| Date       | Who | Change                                          |
| ---------- | --- | ----------------------------------------------- |
| 2026-10-12 |     | Initial tracker created from SRS (Oct 11, 2026) |
