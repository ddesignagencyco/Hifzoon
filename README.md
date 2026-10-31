# Hifzoon

An online Quran **Hifz** (memorisation) and **recitation academy** platform — connecting families with
qualified teachers for one-to-one live lessons, tracked lesson records, and a parent-facing portal.

This repository currently contains the **backend**. The frontend (`apps/web`) is designed but not built yet.

---

## Table of contents

- [What this is](#what-this-is)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [npm scripts](#npm-scripts)
- [Testing](#testing)
- [API conventions](#api-conventions)
- [Docker](#docker)
- [Deployment (Render)](#deployment-render)
- [Database and seeding](#database-and-seeding)
- [Development workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Related documents](#related-documents)

---

## What this is

Hifzoon is specified in three companion documents (see [Related documents](#related-documents)):

| Document                  | Answers                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `docs/Hifzoon-TRD.md`     | **How** it is built — stack, structure, conventions, infrastructure, environments |
| `docs/Hifzoon-ERD.md`     | The **database** design — entities, relationships, constraints                    |
| `docs/Hifzoon-TRACKER.md` | Per-module **tickets** in build order, with the blockers still open               |
| `docs/Hifzoon-STATUS.md`  | **What is done, what is left**, and the main design logic behind the code         |

**New to the project?** Read `docs/Hifzoon-STATUS.md` first — it gives the state of the build, explains how
the system works, and lists the gaps.

Requirements are referenced throughout the code by ID (`FR-AUTH-03`, `NFR-SEC-02`, `CR-11`). Those IDs
match the SRS and appear in test names, so you can trace a rule from the document to the code to the test
that proves it.

---

## Stack

| Layer            | Choice                                                                 |
| ---------------- | ---------------------------------------------------------------------- |
| Language         | TypeScript (strict)                                                    |
| Runtime          | Node.js 22+                                                            |
| Package manager  | npm workspaces                                                         |
| Backend          | NestJS 10                                                              |
| Database         | PostgreSQL 16                                                          |
| ORM / migrations | Prisma                                                                 |
| Cache / queues   | Redis + BullMQ                                                         |
| Realtime         | Socket.IO (NestJS gateway) + Redis adapter                             |
| File storage     | Cloudinary (authenticated assets); recordings on S3-compatible storage |
| Validation       | `zod` schemas shared from `packages/shared`                            |
| Auth             | JWT access token (15 min) + rotating refresh token, Google/Apple OAuth |
| Testing          | Jest (unit + e2e via supertest), requirement-ID traceable              |

Every third-party dependency (video, payments, email, WhatsApp, Quran content, speech) sits behind a
provider interface in `src/integrations/`. Local development selects the `fake`/`log` adapter, so the app
runs with no external accounts or API keys.

---

## Repository layout

```
hifzoon/
├── apps/
│   └── api/                      # NestJS backend
│       ├── src/
│       │   ├── main.ts           # HTTP entry point (helmet, CORS, pipes, Swagger)
│       │   ├── worker.ts         # BullMQ worker entry point
│       │   ├── app.module.ts     # root module; registers every global provider
│       │   ├── common/           # guards, interceptors, filters, pipes, decorators
│       │   ├── config/           # env validation (zod)
│       │   ├── prisma/           # PrismaService
│       │   ├── integrations/     # video, payments, mailer, whatsapp, quran-content, storage
│       │   ├── modules/          # one folder per feature module
│       │   └── worker/           # BullMQ processors
│       ├── prisma/               # schema.prisma, migrations, seed
│       ├── scripts/              # full-flow-check.ts (HTTP walk of the product)
│       └── test/                 # e2e suite
├── packages/
│   └── shared/                   # enums, constants, DTO and event types
├── docker/api.Dockerfile         # one image, two entry points (api + worker)
├── docs/                         # TRD, ERD, tracker
└── docker-compose.yml            # production-shaped stack
    docker-compose.override.yml   # dev overlay: hot reload
```

### Backend modules

Each folder under `src/modules/` is a self-contained feature: controller, service and module file.

`admin`, `admissions`, `audit`, `auth`, `billing`, `classroom`, `consent`, `courses`, `crm`, `families`,
`lessons`, `mushaf`, `notifications`, `parent-portal`, `qa`, `scheduling`, `settings`, `teachers`

---

## Architecture

A **modular monolith**: one NestJS application with strictly separated modules communicating through
service interfaces and domain events. It suits a small team, and modules can be split into services later.

```
Browser / Mobile  --HTTPS-->  Next.js (not built yet)
                            |  REST /api/v1      --> NestJS API --> PostgreSQL
                            |  WebSocket (Socket.IO)    --> Redis (cache, queues, socket adapter)
                            |  WebRTC             --> LiveKit
                                                      --> Cloudinary (uploads)
                                                      --> S3-compatible (class recordings)
                                                      --> Payment / Email / WhatsApp / Quran content
```

**Cross-cutting concerns are registered once** in `app.module.ts` as global providers, so a new module
folder automatically inherits them:

- `JwtAuthGuard` + `RolesGuard` + `ConsentGuard` — authentication and authorisation
- `ThrottlerGuard` — one global rate-limit ceiling; auth routes tighten it for themselves
- `ResponseInterceptor` — wraps every success in the `{ data, meta }` envelope
- `AllExceptionsFilter` — one error shape for the whole API
- `RequestIdMiddleware` — correlates a request across logs

**Statelessness.** API instances hold no session state — auth is JWT plus refresh tokens in the database.
Socket.IO uses the Redis adapter so any instance can serve a classroom. Background jobs run in a separate
`worker` process built from the same image, so a slow job can never block a request.

---

## Getting started

### Prerequisites

- **Node.js 22+** — check with `node -v`
- **Docker Desktop** — for PostgreSQL, Redis, MinIO and MailHog
- A **Cloudinary** account (free tier is enough) for file uploads. Set
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` in
  `apps/api/.env` before uploading an avatar, application document or recitation.
- **npm 10+** (ships with Node 22)

### 1. Install dependencies

```bash
npm install
```

This installs both workspaces. `@hifzoon/shared` is symlinked into `node_modules`, so edit the package
source and the API picks it up — no rebuild of `shared` needed while developing.

### 2. Create the environment file

```bash
cp apps/api/.env.example apps/api/.env
```

Then open `apps/api/.env` and confirm the two connection strings match your setup:

```dotenv
DATABASE_URL=postgresql://hifzoon:hifzoon@localhost:5432/hifzoon?schema=public
REDIS_URL=redis://localhost:6379
```

> **Port conflicts.** The defaults are `5432` (Postgres) and `6379` (Redis). If something already holds
> those on your machine, either publish different ports via `POSTGRES_PORT` / `REDIS_PORT` when starting
> compose, **or** point `.env` at the different ports you used. They must agree.

### 3. Start the infrastructure

```bash
npm run docker:up
```

Brings up PostgreSQL, Redis, MinIO and MailHog, plus a one-shot `migrate` container that applies the
Prisma migrations. MinIO is only the LiveKit Egress target for class recordings; uploads go to
Cloudinary. Check it worked:

```bash
docker compose ps
npm run db:generate     # generate the Prisma client
npm run db:deploy       # apply migrations (idempotent)
npm run db:seed         # load roles, courses, settings and demo accounts
```

### 4. Run the API

```bash
npm run dev        # API + worker together, both with hot reload
```

Or separately:

```bash
npm run dev:api
npm run dev:worker
```

### 5. Verify

```bash
# liveness — process is up
curl http://localhost:4000/api/v1/health/live

# readiness — database and Redis reachable
curl http://localhost:4000/api/v1/health/ready
```

Readiness should report `"status":"ok"` with both `database` and `redis` as `up`.

**Swagger UI** is served at <http://localhost:4000/api/docs> in development.

### Local ports

| Service   | Port                       |
| --------- | -------------------------- |
| API       | `4000`                     |
| Postgres  | `5432` (see note above)    |
| Redis     | `6379` (see note above)    |
| MinIO API | `9000` (console on `9001`) |
| MailHog   | `8025`                     |

### Demo accounts

`npm run db:seed` creates a guardian and a teacher. Every seeded account shares one password:

```
Hifzoon!Dev2026
```

| Role     | Email                  |
| -------- | ---------------------- |
| Guardian | `parent@hifzoon.test`  |
| Teacher  | `teacher@hifzoon.test` |

A super-admin is **not** seeded, because its password must never have a well-known default. Create one:

```bash
npm run bootstrap:superadmin --workspace @hifzoon/api
```

---

## Environment variables

All variables are validated at boot by `src/config/env.schema.ts` — the process **refuses to start** on an
invalid configuration rather than failing later at runtime. See `apps/api/.env.example` for the full list
with comments.

### The ones that matter

| Variable                    | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `NODE_ENV`                  | `development` \| `test` \| `staging` \| `production` |
| `PORT`, `API_PREFIX`        | Default `4000` and `api/v1`                          |
| `DATABASE_URL`              | PostgreSQL connection string                         |
| `REDIS_URL`                 | Redis connection string                              |
| `JWT_ACCESS_SECRET`         | Signs access tokens                                  |
| `JWT_REFRESH_SECRET`        | Signs refresh tokens                                 |
| `TOKEN_PEPPER`              | HMAC pepper for hashing refresh and reset tokens     |
| `TWO_FACTOR_ENCRYPTION_KEY` | Derives the AES-256-GCM key for 2FA secrets via HKDF |
| `COOKIE_SECURE`             | Set `true` behind HTTPS in staging and production    |

### Security rules the code enforces

- Placeholder secrets containing `change-me` are **rejected** when `NODE_ENV=production`.
- `CORS_ORIGINS=*` is **rejected** when `NODE_ENV=production`.
- `.env` is git-ignored. Only `.env.example` is committed, and it contains placeholders only.

### Provider selection

Each integration picks an adapter via an env var, which keeps local development hermetic:

```dotenv
VIDEO_PROVIDER=fake
PAYMENT_PROVIDER=fake
MAIL_PROVIDER=log
WHATSAPP_PROVIDER=fake
QURAN_CONTENT_PROVIDER=fake
SPEECH_PROVIDER=fake
```

Real credentials (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `LIVEKIT_API_KEY`, …) are all optional in
development and are only needed when you switch the corresponding provider off `fake`.

---

## npm scripts

Run from the repository root.

### Everyday

| Command                | Does                                  |
| ---------------------- | ------------------------------------- |
| `npm run dev`          | API + worker with hot reload          |
| `npm run dev:api`      | API only, watch mode                  |
| `npm run dev:worker`   | Worker only                           |
| `npm run build`        | Build `shared`, then `api`            |
| `npm run typecheck`    | `tsc --noEmit` across both workspaces |
| `npm run lint`         | ESLint                                |
| `npm run lint:fix`     | ESLint with `--fix`                   |
| `npm run format`       | Prettier write                        |
| `npm run format:check` | Prettier check (use in CI)            |

### Database

| Command               | Does                                                 |
| --------------------- | ---------------------------------------------------- |
| `npm run db:generate` | Generate the Prisma client                           |
| `npm run db:migrate`  | Create and apply a migration (dev)                   |
| `npm run db:deploy`   | Apply pending migrations (CI and production)         |
| `npm run db:seed`     | Load demo data                                       |
| `npm run db:reset`    | Drop, re-migrate and re-seed — **destroys all data** |
| `npm run db:studio`   | Open Prisma Studio                                   |

### Docker

| Command               | Does                  |
| --------------------- | --------------------- |
| `npm run docker:up`   | Start the stack       |
| `npm run docker:down` | Stop the stack        |
| `npm run docker:logs` | Follow container logs |

---

## Testing

Three layers, all runnable from the root:

```bash
npm test                          # unit tests       — 166 tests
npm run test:e2e                  # e2e (supertest)  — 9 tests
npm run test:flow --workspace @hifzoon/api   # full HTTP flow — 88 checks
npm run test:cov                  # unit tests with a coverage report
```

> `test:flow` lives on the `@hifzoon/api` workspace rather than the root, so it needs `--workspace`.

### What each layer is for

**Unit tests** (`src/**/*.spec.ts`) test services in isolation with every dependency mocked. Fast, no
infrastructure needed.

**E2E tests** (`test/app.e2e-spec.ts`) boot the _real_ Nest application — the whole DI graph, global
guards, the response envelope and the exception filter — and drive it over HTTP with supertest, against a
real Postgres and Redis. This catches what unit tests cannot: a provider that throws on init, a route
that is only reachable because a pipe was set up, or an envelope that changed shape.

**The full-flow check** (`scripts/full-flow-check.ts`) is a real HTTP client against an _already running_
server. It walks the entire product — sign-up, consent, tenancy isolation, teacher hiring, scheduling,
lesson cards, privacy — and prints `PASS`/`FAIL` per requirement ID. It is the script to run after a
deploy or before a demo, because it exercises things an in-process test hides: helmet, CORS, the rate
limiter, the global prefix and real status codes.

```bash
# terminal 1
npm run dev

# terminal 2
npm run test:flow --workspace @hifzoon/api
API=http://localhost:4100 npm run test:flow --workspace @hifzoon/api   # non-default host
```

It exits non-zero if anything fails, so CI can gate on it.

### Coverage

Jest enforces a **70% global threshold** (branches, functions, lines, statements) per NFR-MNT-01. A drop
below it fails `npm run test:cov`.

---

## API conventions

- **Base path** `/api/v1`, REST + JSON
- **Swagger UI** at `/api/docs` in development and staging only
- **Naming** plural nouns in kebab-case (`/lesson-cards`); actions are sub-resources (`POST /classes/:id/cancel`)
- **Auth** `Authorization: Bearer <access>`; the refresh token is an httpOnly cookie on `/auth/refresh`
- **Dates** ISO 8601 UTC; **IDs** UUID v7

Every time in the system is stored in UTC and rendered in the viewer's timezone at the edge — the
scheduling module exists specifically so a lesson keeps its local time across a DST boundary.

### Response envelope

Success:

```json
{ "data": { "...": "..." }, "meta": { "requestId": "…" } }
```

Error:

```json
{
  "statusCode": 401,
  "code": "UNAUTHENTICATED",
  "message": "…",
  "requestId": "…",
  "timestamp": "…"
}
```

Log the `requestId` — it appears in the server logs for the same call.

---

## Docker

`docker-compose.yml` brings up PostgreSQL, Redis, MinIO and MailHog, and builds the API and worker from a
single Dockerfile (`node dist/main.js` vs `node dist/worker.js`).

`docker-compose.override.yml` is applied automatically on top and switches the API to hot reload with the
source mounted, for the local test loop. **Never deploy it** — staging and production use
`docker-compose.yml` as-is.

The `migrate` service applies migrations and exits; `api` and `worker` wait for it to succeed, so a deploy
cannot start against an un-migrated schema.

---

## Deployment (Render)

The backend deploys with the `render.yaml` Blueprint: Render Postgres, Key Value, the API and the BullMQ
worker. Step-by-step instructions — first deploy, required secrets, demo accounts, LiveKit, storage,
custom domains and troubleshooting — are in [`docs/Hifzoon-RENDER-DEPLOY.md`](docs/Hifzoon-RENDER-DEPLOY.md).

---

## Database and seeding

The schema lives in `apps/api/prisma/schema.prisma`, with SQL migrations under
`apps/api/prisma/migrations/`.

```bash
npm run db:generate          # after editing schema.prisma
npm run db:migrate           # creates a new migration from the schema diff
npm run db:deploy            # applies pending migrations
npm run db:studio            # browse the data
```

`db:migrate` is for **development** — it creates a migration file. `db:deploy` is for CI and production —
it only applies migrations that already exist and never creates one.

The seed loads roles, courses, plans, the Hifz rule config, pay rates, FAQ items, QA rubrics, app
settings, CMS posts and a small set of demo accounts. It is idempotent, so re-running it is safe.

---

## Development workflow

Branching is trunk-based with short-lived branches, per TRD section 17:

```
feat/<TICKET-ID>-short-name
```

Commit messages carry the ticket ID. The tracker groups work by module (`AUTH`, `SCH`, `CLS`, `REC`, …),
and a requirement ID in the message makes it traceable back to the SRS.

Before opening a pull request:

```bash
npm run lint && npm run typecheck && npm run format:check && npm test && npm run build
```

---

## Troubleshooting

**`db:seed` fails with `Cannot find module '@hifzoon/shared'`**
The workspace symlink is broken or points at an old path — common after moving or renaming the repository
folder. Repair it by reinstalling from the root:

```bash
npm install
```

**`npm start` reports `Cannot find module 'dist/main.js'`**
The build produced nothing. `packages/shared` must be built before the API:

```bash
npm run build
```

**`db:deploy` cannot connect to PostgreSQL**
The container and `.env` disagree on the port. If you started compose with `POSTGRES_PORT=5435`, then
`DATABASE_URL` must also say `5435`. Confirm what is actually listening with `docker compose ps`.

**Readiness reports `"status":"degraded"`**
One dependency is down. The response names which one under `checks` — check that container, and check
`REDIS_URL` in `.env` matches the published Redis port.

**Swagger UI 404s**
It is only mounted when `NODE_ENV` is not `test`. Confirm `NODE_ENV=development`.

**Port already in use**
Publish a different host port rather than editing `docker-compose.yml` (it is shared with production
shapes):

```bash
POSTGRES_PORT=5435 REDIS_PORT=6382 npm run docker:up
```

Then point `.env` at the same ports.

---

## Related documents

| File                      | Contents                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `docs/Hifzoon-STATUS.md`  | Project status, core design logic, and remaining work      |
| `docs/Hifzoon-TRD.md`     | Technical requirements — stack, layout, conventions, infra |
| `docs/Hifzoon-ERD.md`     | Entity-relationship design and database rules              |
| `docs/Hifzoon-TRACKER.md` | Per-module tickets in suggested build order, plus blockers |

Open product decisions still blocking parts of the build are listed at the end of the tracker — notably the
payment provider and operating country, the Quran licence, and the video provider.
