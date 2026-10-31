# Hifzoon — Current Progress

**Updated:** 2026-10-30
**Branch:** `full-site-regression` (commit `fc18138` plus uncommitted work; see [`CHANGES.md`](./CHANGES.md))
**Scope:** `apps/web` (Next.js 16, React 19, Tailwind v4, TanStack Query v5) and `apps/api` (NestJS, Prisma, BullMQ)

Every number below was measured on 2026-10-30. Anything not measured says so.

---

## Status

| Check | Result | How it was checked |
|:--|:--|:--|
| Pages | 91 `page.tsx` routes | `find src/app -name page.tsx` |
| Web unit tests | 598 passed, 95 files | `npx vitest run` |
| API unit tests | 482 passed | `npx jest` |
| TypeScript | Clean in web and API | `tsc --noEmit` |
| ESLint (web) | 0 errors, 34 warnings | `npx eslint src tests` |
| API ↔ web | 208 of 212 operations have a web client; the other 4 are webhooks | Script over the live OpenAPI spec; see [`api-coverage.md`](./api-coverage.md) |
| Production build | **Not run on this branch** | An earlier note said `next build` failed to prerender `/resources/[slug]` because `ChatAssistantWidget` uses `usePathname()` outside `<Suspense>`. The widget is still rendered directly in `app/layout.tsx`, so check this before deploying. |
| Deployment | Not started | No staging environment yet |

## Checked in the browser on 2026-10-30

| Portal | Pages opened | Result |
|:--|:--|:--|
| Admin (super admin) | Overview, Users & search, CRM (all four tabs), Trials & placement, Teacher changes, Teachers (all six tabs), Scheduling, Courses, Enrolments, Billing, Invoices & refunds, Payroll, Content & FAQ, Settings, Audit log, Notifications, Safeguarding, Quality & supervision | Issues found were fixed (see `CHANGES.md` §4). The new trial list (`GET /trials`) was added after this pass and has not been opened in the browser yet. |
| Parent | Overview, Children, Timetable, Messages, Billing, Privacy & consent, Notifications | Issues found were fixed |
| Teacher | Not checked in the browser this pass | Needs a teacher login with a 2FA code |
| Student | Not checked in the browser this pass | — |

## Working end to end (local, Stripe test mode)

- **Trial and payment:** trial booking → result → the family continues with the trial teacher → Stripe Checkout → weekly classes created.
- **Subscription lifecycle:** cancel, then keep; upgrade with proration; downgrade at period end; failed renewal and recovery; final cancel.
- **Webhook safety:** webhook idempotency and the hourly reconcile job.
- **Pricing:** tier pricing and the admin price editor.
- **CRM:** the lead follows the trial (booked → trial done/lost → enrolled). This was added on 2026-10-30 and is covered by unit tests only.
- **Classroom:** LiveKit video, page/highlight/mistake sync, and the class room closing at the booked end time. The room close is covered by unit tests only.

## Open

- **Backend asks:** none open. Decisions still to confirm are in [`REQUIREMENTS.md`](./REQUIREMENTS.md).
- **Recording:** left for later; the UI stays hidden.
- **Test data:** the database was reset on 2026-10-30 and re-seeded with the development academy (`apps/api/prisma/seed-academy.ts`); the old Stripe test records are gone.
- **Public pages:** these were not part of this review. For example, the public Faculty cards still show subject codes.
- **Before deploying:** run the production build, apply the migrations listed in `REQUIREMENTS.md` §1, and configure the Stripe production keys and webhook.

## Local environment

Docker runs PostgreSQL, Redis, MinIO, MailHog, LiveKit, the API (port 4000) and the worker. The web dev server runs on port 3000. Seeded accounts use `@hifzoon.test`; staff accounts need 2FA.

The API container does not pick up file changes made on Windows. Restart it with `docker restart hifzoon-api-1 hifzoon-worker-1` after backend changes.
