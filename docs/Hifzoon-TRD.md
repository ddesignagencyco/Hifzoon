# Hifzoon — Technical Requirements Document (TRD)

Version 1.0 · Derived from Hifzoon SRS (Oct 11, 2026) · Stack: Node.js, TypeScript, NestJS, Next.js, PostgreSQL, Docker, npm

---

## 1. Purpose and scope

This TRD explains **how** Hifzoon is built to satisfy the SRS. The SRS says what the system must do; this document fixes the stack, structure, conventions and infrastructure so frontend and backend developers work against the same design.

Companion files: `ERD.md` (database design), `TRACKER.md` (tickets per module).

## 2. Technology stack

| Layer            | Choice                                                                  | Why                                                                   |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Language         | TypeScript (strict) everywhere                                          | One language, shared types between FE and BE                          |
| Runtime          | Node.js 22 LTS                                                          | Current LTS                                                           |
| Package manager  | npm (workspaces)                                                        | Requested; monorepo support built in                                  |
| Backend          | NestJS 10+                                                              | Modular structure maps 1:1 to SRS modules                             |
| Frontend         | Next.js 15 (App Router)                                                 | SSR needed for SEO (FR-ADM-01), RSC, i18n routing                     |
| Database         | PostgreSQL 16                                                           | Relational data, JSONB, strong constraints                            |
| ORM / migrations | Prisma                                                                  | Typed client, migrations, easy for a small team                       |
| Cache / queues   | Redis + BullMQ                                                          | Reminders, payroll jobs, retries (FR-BIL-03), notifications           |
| Realtime         | Socket.IO (NestJS gateway) + Redis adapter                              | Mushaf page/highlight sync under 500 ms (NFR-PERF-02)                 |
| Video            | LiveKit (default, see open question) behind a `VideoProvider` interface | Browser WebRTC, recording, data channel                               |
| File storage     | S3-compatible (MinIO locally)                                           | Recordings, certificates, documents, AI audio                         |
| Payments         | `PaymentProvider` interface (Stripe / PayPal adapters)                  | Stripe does not serve Pakistan-registered companies; entity undecided |
| Email            | Transactional provider (Resend/SES) behind `Mailer` interface           | IR-SW-04                                                              |
| WhatsApp         | WhatsApp Business API behind `Messenger` interface                      | P2, IR-SW-05                                                          |
| Validation       | `zod` shared schemas (packages/shared) + `class-validator` in Nest DTOs | One source of truth for request shapes                                |
| Auth             | JWT access (15 min) + rotating refresh token; Google/Apple OAuth        | FR-AUTH-01, 07                                                        |
| UI               | Tailwind CSS + shadcn/ui, one design system                             | IR-UI-01, light/dark                                                  |
| i18n             | `next-intl`, RTL via `dir` attribute                                    | NFR-L10N-01, IR-UI-03                                                 |
| Testing          | Jest (BE), Vitest + Testing Library (FE), Playwright (e2e)              | NFR-MNT-01 (70% BE coverage)                                          |
| CI/CD            | GitHub Actions → build, test, Docker image, deploy to staging           | Acceptance needs staging                                              |
| Observability    | Pino logs, Sentry, OpenTelemetry, health endpoints                      | NFR-MNT-02                                                            |

## 3. Repository layout (npm workspaces monorepo)

```
hifzoon/
├─ apps/
│  ├─ api/                  # NestJS backend
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ common/         # guards, interceptors, filters, pipes, decorators
│  │  │  ├─ config/         # env validation (zod)
│  │  │  ├─ prisma/         # PrismaService, schema.prisma, migrations, seed
│  │  │  ├─ integrations/   # video, payments, mailer, whatsapp, quran-content, storage
│  │  │  └─ modules/        # one folder per SRS module (see section 5)
│  │  └─ test/
│  └─ web/                  # Next.js frontend
│     ├─ src/app/[locale]/  # (public) (auth) (parent) (student) (teacher) (staff) (classroom)
│     ├─ src/components/    # ui/, mushaf/, classroom/, charts/
│     ├─ src/lib/           # api client, socket client, auth, i18n
│     └─ messages/          # en.json, ur.json, ar.json, fr.json
├─ packages/
│  └─ shared/               # DTO types, zod schemas, enums, constants (Hifz states, mistake types)
├─ docker/
│  ├─ api.Dockerfile
│  ├─ web.Dockerfile
│  └─ nginx/ (optional)
├─ docker-compose.yml
├─ docker-compose.override.yml   # dev: hot reload, mailhog, minio
├─ .github/workflows/
├─ package.json             # "workspaces": ["apps/*", "packages/*"]
├─ tsconfig.base.json
└─ docs/ (SRS, TRD, ERD, TRACKER)
```

Rule: FE and BE both import types and enums from `packages/shared`. No duplicated enum definitions.

## 4. Architecture

### 4.1 Style

A **modular monolith**: one NestJS application, strictly separated modules, communicating through service interfaces and domain events (`@nestjs/event-emitter`). This fits a small team (SRS section 9 assumes one), and modules can be split into services later (NFR-CAP-01 scale to 10x by adding instances).

```
Browser / Mobile ──HTTPS──> Next.js (SSR + client)
        │                        │
        └──── REST /api/v1 ──────┴──> NestJS API ──> PostgreSQL
        └──── WebSocket (Socket.IO) ─┘      │──> Redis (cache, queues, socket adapter)
        └──── WebRTC ──> LiveKit            │──> S3 storage
                                            │──> Payment / Email / WhatsApp / Quran content
```

### 4.2 Statelessness and scaling

- API instances are stateless; sessions are JWT + refresh tokens stored in the DB.
- Socket.IO uses the Redis adapter so any API instance can serve a classroom.
- Background jobs run in a separate `worker` container (same image, different entry command).

### 4.3 Time handling (FR-SCH-01, 02)

- All timestamps `timestamptz`, stored in UTC.
- Recurring classes store `local_time`, `iana_timezone` (family's zone) and an RRULE; occurrences are materialised into `class_session` rows for the next 60 days by a nightly job, computed with `luxon` so DST changes keep the family's local time.
- A job runs 14+ days before DST changes in US/UK/EU/AU to detect teacher clashes and notify.

## 5. Backend modules (NestJS)

Each folder under `apps/api/src/modules/` contains `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities` (Prisma models in shared schema), and `*.spec.ts`.

| Module          | SRS area | Responsibilities                                                                                             |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `auth`          | AUTH     | Sign-up/in, OAuth, 2FA (TOTP for staff), sessions, rate limit, lockout (NFR-SEC-04)                          |
| `users`         | AUTH     | Users, roles (multi-role), profile                                                                           |
| `families`      | AUTH     | Family accounts, guardians, students, guardian verification (CR-10)                                          |
| `consent`       | AUTH, CR | Verifiable parental consent, per-purpose opt-ins, withdrawal, data export/delete                             |
| `admissions`    | ADM      | Public catalog, trial booking, placement result, teacher change request                                      |
| `cms`           | ADM      | Blog, printables, landing pages                                                                              |
| `chatbot`       | ADM (P2) | FAQ assistant, trial booking, handover                                                                       |
| `scheduling`    | SCH      | Availability, recurring classes, reschedule/cancel, make-up credits, matching, substitutes, holidays/Ramadan |
| `classroom`     | CLS      | Room token issuing, presence, Mushaf sync gateway, attendance, recording webhooks                            |
| `mushaf`        | CLS      | Quran content service (verified source only), layouts, page/ayah/word index, caching rules (CR-11)           |
| `lessons`       | REC      | Mistakes, lesson cards, summaries, 48-hour lock, audit of edits                                              |
| `hifz`          | HFZ      | Page states, rules engine, daily portions, spaced repetition, goals, alerts                                  |
| `ai-coach`      | AIC      | Practice assignments, speech provider, mistake detection, confirm/dismiss                                    |
| `courses`       | CRS      | Courses/levels/lessons, assessments, milestone exams, certificates + QR verification                         |
| `parent-portal` | PAR      | Aggregations: dashboard, charts, monthly report card, messaging                                              |
| `teachers`      | TCH      | Hiring pipeline, profile approval, earnings view, training                                                   |
| `quality`       | QA       | Sampling, rubric scoring, scorecard, ratings, cases (complaints, safeguarding)                               |
| `crm`           | OPS      | Leads, follow-up tasks, dashboards, config (prices, plans, roles)                                            |
| `billing`       | BIL      | Plans, subscriptions, invoices, retries, refunds, credits, sponsorship                                       |
| `payroll`       | BIL      | Pay calculation, deductions, bonuses, export                                                                 |
| `notifications` | NTF      | Channel preferences, quiet hours, reminders, templates, queue                                                |
| `engagement`    | ENG      | Streaks, badges, stickers, referrals, daily ayah                                                             |
| `audit`         | OPS, CR  | Append-only audit log interceptor                                                                            |
| `health`        | NFR      | Liveness/readiness, metrics                                                                                  |

### 5.1 Cross-cutting backend rules

- **RBAC**: `@Roles()` decorator + `RolesGuard`; resource ownership checks in services via `PoliciesGuard` (e.g., teacher sees only own students, NFR-SEC-02; guardian only own children, CR-10).
- **Validation**: global `ValidationPipe` (whitelist, forbid unknown).
- **Errors**: one `HttpExceptionFilter`, response shape `{ statusCode, code, message, details? }`.
- **Pagination**: cursor or `page/limit`, response `{ data, meta }`.
- **Audit**: interceptor writes to `audit_log` for admin actions on personal/financial data (FR-OPS-06).
- **Idempotency**: payment and webhook endpoints require `Idempotency-Key`.
- **Soft delete + retention jobs**: scheduled cleanup per SRS section 7 retention table.
- **Config**: all secrets from env, validated at boot with zod; no secrets in repo.

## 6. API conventions

- Base path `/api/v1`, REST + JSON, OpenAPI generated by `@nestjs/swagger` at `/api/docs` (dev/staging only).
- The OpenAPI spec is the FE/BE contract; FE generates a typed client (`openapi-typescript` + `openapi-fetch`) into `apps/web/src/lib/api`.
- Naming: plural nouns, kebab-case (`/lesson-cards`), actions as sub-resources (`POST /classes/:id/cancel`).
- Auth: `Authorization: Bearer <access>`; refresh via httpOnly cookie on `/auth/refresh`.
- Dates ISO 8601 UTC; IDs are UUID v7.
- Rate limiting: `@nestjs/throttler` globally; stricter on auth.
- Webhooks: `/webhooks/payments`, `/webhooks/video`, `/webhooks/whatsapp` — signature verified, idempotent.

## 7. Realtime design (Mushaf sync, CLS-03, NFR-PERF-02)

- Socket.IO namespace `/classroom`, room per `class_session_id`.
- Join requires a short-lived room token issued by `classroom` module after checking enrolment and the 10-minute-early rule (FR-CLS-01).
- Events (typed in `packages/shared`):
  - `mushaf:page` `{ layout, page }`
  - `mushaf:highlight` `{ surah, ayah, wordIndex }`
  - `board:stroke` / `board:clear` (pen, FR-CLS-07)
  - `mistake:marked` (teacher only → persisted via REST, echoed for UI)
  - `presence:join` / `presence:leave` (feeds attendance, FR-CLS-14)
- Server holds last state (page, highlights) in Redis so a rejoining participant resumes in under 10 seconds (NFR-REL-01).
- Only the teacher role may emit control events; server enforces.
- Weak connection (FR-CLS-11): client uses LiveKit adaptive stream; if bandwidth falls below threshold the client unpublishes video, keeps audio and socket.

## 8. Video and recording

- `VideoProvider` interface: `createRoom`, `issueToken`, `startRecording`, `stopRecording`, `handleWebhook`.
- LiveKit adapter first. Egress recording writes to S3; webhook creates a `recording` row.
- Ayah markers: while recording, `mushaf:highlight` and page events are logged with timestamps into `recording_marker` so playback can jump (FR-CLS-12).
- Recording only starts if both consents exist (FR-AUTH-04).

## 9. Quran content rules (CR-11, SRS constraints)

- Text/fonts/audio only from the licensed provider through the `mushaf` module.
- Text is never stored editable, never generated by AI, never changed by code.
- Respect caching limit (Quran Foundation: 1 week) via TTL on cache entries; a `content_cache` table stores `fetched_at` and a job purges expired entries.
- Frontend renders with approved Mushaf fonts only (IR-UI-05); no `contenteditable`, no system-font fallback for Quran text.
- Page-level data model: `mushaf_layout` (MADANI_15, INDOPAK_13, INDOPAK_16), pages 1–604 for Madani; word index keyed `(surah, ayah, word)`.

## 10. Frontend (Next.js)

- App Router with `[locale]` segment; route groups per role.
- **Rendering**: public site (courses, teachers, pricing, blog, landing pages) is server-rendered/ISR for SEO and LCP < 2.5 s (NFR-PERF-01). Authenticated apps use client components with data fetching via TanStack Query.
- **State**: server state in TanStack Query; local UI state with Zustand where needed; forms with React Hook Form + zod.
- **Classroom** route is code-split and client-only (WebRTC, canvas).
- **RTL**: `dir="rtl"` for `ur` and `ar`; use logical CSS properties (`ms-`, `me-`) only.
- **Responsive**: mobile-first, 360 px minimum, no horizontal scroll (IR-UI-02).
- **Accessibility**: WCAG 2.2 AA checks in CI via `axe` + Playwright (NFR-ACC-01).
- **Kids mode**: separate layout with 48 px targets, icon + audio labels, no free text (IR-UI-04), P3.
- **Currency/locale**: `Intl` APIs; currency from geo header with manual switch (FR-ADM-02).
- **Auth in Next**: tokens never in localStorage; refresh cookie httpOnly, access token in memory.

## 11. Database

- PostgreSQL 16, Prisma schema as source of truth; migrations in `apps/api/src/prisma/migrations`.
- Naming: `snake_case` tables/columns (Prisma `@map`).
- Constraints: foreign keys everywhere, unique and exclusion constraints for no double-booking (FR-SCH-07), e.g. `EXCLUDE USING gist (teacher_id WITH =, tstzrange(starts_at, ends_at) WITH &&)` through a raw migration.
- Indexes: on FK columns, `(student_id, page_number)`, `(class_session_id)`, `(starts_at)`, `(status)`.
- Encryption: disk/volume encryption at rest (managed DB), TLS in transit; column-level encryption for ID documents (via app-layer AES-GCM with KMS key).
- Backups: continuous WAL archiving, PITR 14 days, cross-region encrypted copy, quarterly restore test (DR-01–03).
- Full design in `ERD.md`.

## 12. Security and privacy

| Requirement          | Technical approach                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-01           | Argon2id for passwords; TLS 1.2+; encrypted storage                                                                                   |
| NFR-SEC-02           | RBAC + ownership policies, tested per endpoint                                                                                        |
| NFR-SEC-04           | Throttler + lockout after 10 failed attempts, email recovery                                                                          |
| FR-AUTH-01 staff 2FA | TOTP (otplib), recovery codes                                                                                                         |
| FR-AUTH-07           | Refresh token TTL 30 d (personal), 12 h (staff) with inactivity tracking                                                              |
| CR-01–06             | `consent` module, consent ledger table, gating guard `@RequiresConsent('AI_VOICE')`                                                   |
| CR-02 retention      | Scheduled jobs: delete recordings at 90 d, AI audio at 30 d, leads at 12 m                                                            |
| CR-05                | Export (JSON/ZIP) and delete requests processed by a queue, SLA 30 days                                                               |
| CR-07                | Masked contact data in API responses for staff/teacher roles                                                                          |
| CR-08                | Report button creates `case`; alert to safeguarding lead through notifications within 15 min (BullMQ priority job + escalation timer) |
| NFR-SEC-03           | Pen test before P1 launch; dependency scanning (`npm audit`, Dependabot), SAST in CI                                                  |
| Headers              | Helmet (API), strict CSP, HSTS, SameSite cookies, CSRF protection on cookie-auth routes                                               |

## 13. Notifications

- All sends go through a `notifications` queue (BullMQ). Templates per event and locale.
- Reminders at 24 h and 15 min before class scheduled as delayed jobs on class creation, re-planned on reschedule.
- Channels: email (P1), WhatsApp and push (P2) with per-user preferences and quiet hours.
- Staff–family messaging via in-app chat; WhatsApp through the official number only (FR-NTF-03).

## 14. Billing and payroll

- `PaymentProvider` abstraction; subscription state mirrored locally from webhooks.
- Dunning: retries on day 1, 3, 7 via delayed jobs; class pause after final failure (FR-BIL-03).
- Multi-currency: price table per plan per currency (USD, GBP, CAD, AUD, AED, PKR).
- Payroll job per period: counts completed classes from attendance, applies rates, deductions, bonuses; produces CSV export (FR-BIL-07).
- **Blocker**: operating entity and provider must be decided before billing build (SRS open question 1).

## 15. AI components

- **Lesson summary (FR-REC-05)**: LLM call produces parent-friendly text from the lesson card only; never touches Quran text; teacher must approve before sending.
- **Chat assistant (FR-ADM-07)**: retrieval over approved FAQ content only; handover to staff.
- **Recitation coach (P3)**: `SpeechProvider` interface; streaming audio via WebSocket to speech service; alignment against the licensed word sequence produces word-level flags. Latency target < 3 s (NFR-PERF-04). Dismissed flags stored for evaluation. Children's audio is not used for training without separate consent (CR-06).

## 16. Docker and environments

### 16.1 Containers

| Service         | Image                              | Notes                                        |
| --------------- | ---------------------------------- | -------------------------------------------- |
| `postgres`      | postgres:16-alpine                 | Volume `pgdata`                              |
| `redis`         | redis:7-alpine                     | Queues, socket adapter                       |
| `api`           | built from `docker/api.Dockerfile` | `node dist/main`                             |
| `worker`        | same image as api                  | `node dist/worker` (BullMQ processors, cron) |
| `web`           | built from `docker/web.Dockerfile` | Next.js standalone output                    |
| `minio` (dev)   | minio/minio                        | S3-compatible storage                        |
| `mailhog` (dev) | mailhog/mailhog                    | Email capture                                |
| `livekit` (dev) | livekit/livekit-server             | Local video                                  |

### 16.2 Dockerfile approach

Multi-stage: `deps` (npm ci) → `build` (npm run build for the workspace) → `runner` (node:22-alpine, non-root user, production deps only). Next.js uses `output: 'standalone'`.

### 16.3 Sample `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: hifzoon
      POSTGRES_PASSWORD: hifzoon
      POSTGRES_DB: hifzoon
    ports: ['5432:5432']
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U hifzoon']
      interval: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
  api:
    build: { context: ., dockerfile: docker/api.Dockerfile }
    env_file: apps/api/.env
    depends_on: { postgres: { condition: service_healthy }, redis: { condition: service_started } }
    ports: ['4000:4000']
  worker:
    build: { context: ., dockerfile: docker/api.Dockerfile }
    command: ['node', 'dist/worker.js']
    env_file: apps/api/.env
    depends_on: [postgres, redis]
  web:
    build: { context: ., dockerfile: docker/web.Dockerfile }
    env_file: apps/web/.env
    depends_on: [api]
    ports: ['3000:3000']
volumes:
  pgdata:
```

### 16.4 Environments

| Env        | Purpose                     | Notes                                                        |
| ---------- | --------------------------- | ------------------------------------------------------------ |
| local      | Developer machine           | docker compose up, hot reload via override file              |
| staging    | Acceptance, load, pen tests | Mirrors production, anonymised data                          |
| production | Live                        | Containers on a managed platform, managed Postgres, multi-AZ |

### 16.5 npm scripts (root)

```
npm run dev:api      npm run dev:web      npm run dev        # both
npm run build        npm run test         npm run lint
npm run db:migrate   npm run db:seed      npm run db:studio
npm run docker:up    npm run docker:down
```

## 17. CI/CD

1. Pull request: `lint` → `typecheck` → unit tests → build → Playwright smoke → `npm audit`.
2. Merge to `main`: build Docker images, push to registry, deploy to staging, run e2e.
3. Tag release: manual approval → production deploy, run DB migrations as a pre-deploy job.
4. Branching: trunk-based with short-lived feature branches named `feat/<TICKET-ID>-short-name`. Commit messages include the ticket ID.

## 18. Testing strategy

- Every SRS requirement ID has at least one test linked to it (acceptance rule, SRS section 9). Test names include the ID, e.g. `it('FR-SCH-07 prevents teacher double booking')`.
- Backend: unit (services), integration (Nest + test Postgres via Testcontainers), contract (OpenAPI diff in CI). Coverage ≥ 70% (NFR-MNT-01).
- Frontend: component tests, Playwright e2e for critical flows (trial booking, join class, lesson card, payment).
- Load: k6 scripts for 200 simultaneous classes and 5,000 active students (NFR-CAP-01); socket latency test for NFR-PERF-02.
- Accessibility: axe in e2e.

## 19. Non-functional mapping

| NFR       | Technical measure                                                                     |
| --------- | ------------------------------------------------------------------------------------- |
| PERF-01   | SSR/ISR, image optimisation, font subsetting, CDN                                     |
| PERF-02   | Socket.IO with Redis state, small payloads, regional deployment close to users        |
| PERF-03   | LiveKit regional edge/TURN, deploy SFU nodes in multiple regions                      |
| PERF-04   | Streaming speech pipeline, warm models                                                |
| CAP-01    | Horizontal scaling of api/worker, connection pooling (PgBouncer), read replicas later |
| AVL-01/02 | Multi-AZ, rolling deploys, maintenance windows announced via notifications            |
| REL-01    | Server-held room state, auto-reconnect in client                                      |
| MNT-02    | Sentry + OpenTelemetry + alerting to on-call                                          |
| PORT-01   | Only Docker and env-based config, no provider-specific code outside `integrations/`   |

## 20. Phases mapped to technical work

| Phase | Technical focus                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | Monorepo, Docker, auth, consent, families, admissions, scheduling, classroom (Madani), lessons, parent portal, billing, payroll, teacher hiring, email notifications, CRM, compliance items                |
| P2    | Mobile apps (React Native/Expo sharing `packages/shared`, or PWA first), IndoPak layouts, Hifz engine, assessments/certificates, recordings, circles, substitutes, QA, WhatsApp, push, RTL and Urdu/Arabic |
| P3    | AI coach, Tajweed beta, kids mode, badges, Ijazah, sponsorship, French, Muraja'ah plan                                                                                                                     |

## 21. Decisions needed from the product side (from SRS open questions)

1. **Operating company country and payment provider** — blocks billing (BIL).
2. **Quran text/font licence** (Quran Foundation commercial vs King Fahd Complex) — blocks Mushaf (mushaf, CLS).
3. **Video provider** — this TRD assumes LiveKit behind an interface; switching to Agora means one new adapter.
4. **Prices and teacher pay rates** — needed for seed data and payroll tests.
5. **Circle gender rules and age** — affects FR-CLS-15 rules.
6. **Safeguarding lead and out-of-hours route** — needed for CR-08 alert routing.
7. **Trademark and domain** — SRS diagrams still say "Qirva"; confirm the final product name before branding assets and package names.

## 22. Risks

| Risk                                  | Mitigation                                                          |
| ------------------------------------- | ------------------------------------------------------------------- |
| Quran license terms limit caching/use | Wrap all access in `mushaf` module with TTL and licence flag        |
| Realtime latency across continents    | Regional LiveKit nodes, measure early in P1 pilot                   |
| COPPA/GDPR gaps                       | Consent ledger, retention jobs, lawyer review (CR-13) before launch |
| DST bugs in recurring classes         | `luxon` + property-based tests across DST boundaries                |
| Payment provider uncertainty          | Provider abstraction, build billing last in P1                      |
| AI Quran recitation accuracy          | Gate P3 with test set agreement (SRS section 9)                     |
