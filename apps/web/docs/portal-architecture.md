# Hifzoon Web — Portal Architecture & Conventions

**Scope:** `apps/web` (Next.js 16 App Router, React 19, TanStack Query v5, Tailwind v4).
**Backend:** NestJS REST at `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`). Swagger at `http://localhost:4000/docs`.

## 1. Layers

| Layer | Location | Rule |
| :--- | :--- | :--- |
| Transport | `src/lib/api/client.ts` (`apiRequest`) | Bearer token in memory, `hifzoon_refresh` httpOnly cookie, silent refresh-and-retry once on 401 (all routes except login/register/refresh/forgot/reset, and never for a 401 whose code is `INVALID_CREDENTIALS`, `INVALID_TWO_FACTOR_CODE` or `TWO_FACTOR_REQUIRED` — a wrong secret is not an expired session). Errors are the flat backend shape `{ statusCode, code, message, details? }`; branch on `code`. |
| Typed REST | `src/lib/api/http.ts` | `http.get/post/put/patch/delete/getPage`. **Throws `ApiClientError`** (`status`, `code`, `details`) so React Query sees real errors. `getPage` keeps pagination `meta`. `newIdempotencyKey()` for payment calls. |
| Domain modules | `src/lib/api/modules/<domain>.ts` | One file per backend controller group. Exports `<domain>Api` object + TypeScript types that mirror the backend DTO/service `select` exactly. No UI code. |
| Hooks | `src/hooks/use<Domain>.ts` | `useQuery`/`useMutation` wrappers with a `<domain>Keys` query-key factory; mutations invalidate the affected keys. |
| UI kit | `src/components/ui/primitives.tsx`, `select.tsx`, `toast.tsx` | `UiButton`, `Card`, `PageHeader`, `Badge`/`StatusBadge`, `QueryState`, `LoadingState`/`ErrorState`/`EmptyState`, `Field`/`TextInput`/`Select` (react-select, drop-in for `<select>`)/`TextArea`/`Checkbox`, `DataTable`, `Tabs`, `Modal`, `Alert`, `StatTile`, `formatDate/DateTime/Money`, `humanize`. |
| Portal chrome | `src/components/portal/PortalShell.tsx`, `src/lib/portal/nav.ts` | Role guard + sidebar + portal switcher + notification bell + toasts. Every portal's `layout.tsx` wraps `PortalShell`. |
| Feature components | `src/components/<portal>/...` | Screens' building blocks for that portal. |
| Routes | `src/app/<portal>/...` | `'use client'` pages (auth is client-side, in-memory). Dynamic params via `useParams()`. |

## 2. Portals & role routing

`/dashboard` sends a signed-in user to their portal via `getDefaultRouteForRole` (priority: admin → safeguarding → supervisor → teacher → parent → student).

| Portal | Base path | Roles |
| :--- | :--- | :--- |
| Family | `/parent` | GUARDIAN |
| Student | `/student` | STUDENT, CHILD_STUDENT |
| Teacher | `/teacher` | TEACHER |
| Quality & supervision | `/supervisor` | SUPERVISOR, EXAMINER, SUPER_ADMIN |
| Safeguarding | `/safeguarding` | SAFEGUARDING_LEAD, SUPER_ADMIN |
| Academy admin | `/admin` | ADMIN, SUPER_ADMIN |

There are no sample or preview portals: every screen shows real API data or an honest loading / error / empty state (rule 4).

## 3. Screen rules

1. Every data region renders loading, error (with retry) and empty states — use `QueryState`.
2. Every mutation: disable + spinner while pending, toast on success/failure, invalidate queries.
3. Forms validate client-side to the same rules as the backend DTO (class-validator) before submitting; backend errors are shown verbatim.
4. Never fabricate data. If the API does not return a field, the UI does not show it (no invented ratings, counts or media).
5. Respect role gating in UI (hide actions the role cannot perform) — the backend still enforces it.
6. Mobile first: layouts work at 360px; tables scroll horizontally inside their card.
7. Dates: show in the viewer's timezone unless the record carries its own `timeZone`.
8. **Errors and confirmations are toasts, site-wide** (`useToast()`; the provider is mounted at the root in `QueryProvider`). Never render error banners or red text in the page body. Failed data loads use `ErrorState` (toasts the message, keeps a compact Retry); invalid fields are outlined red via `Field error=…` with the message kept for screen readers.
9. **No native `<select>`.** Use `Select` from `components/ui/select.tsx` — same `<option>` children and `onChange(e)` → `e.target.value`; `appearance="pill"` / `size="sm"` for public-site styling; searchable automatically above 8 options. Tests pick options with `chooseOption()` / `optionLabels()` from `tests/helpers/render.tsx`.
10. **Access & missing data:** a 403 (incl. `NOT_RESOURCE_OWNER`) or 404 from a data region renders through `ErrorState` as "You don't have access to this" / "Not found", with no toast and no Retry. Other failures toast and offer Retry.
11. **Sign-in methods:** Google/Apple buttons (`components/auth/OAuthButtons.tsx`) render only for providers `GET /auth/oauth/providers` reports as configured. The provider redirects to `/auth/oauth/[provider]` (route handler), which forwards to `/auth/complete`; linking is decided at `/start` by sending the access token.
12. **Status pages:** 404 (`app/not-found.tsx`), errors (`app/error.tsx`, `app/global-error.tsx`) and the 401/403 states in `ProtectedRoute` all use `components/errors/StatusPage.tsx`.
13. **Session boot:** `AuthBootSplash` (logo + progress ring) covers the first page load until the session is restored from the refresh cookie (max 4 s), so the header never flashes signed-out UI. `useAuth().isResolved` tells components when the session state is known.
14. **Cache Components:** portal pages read the URL and the in-memory session, so `ProtectedRoute` wraps them in `<Suspense>` and portal layouts export `instant = false`; `next.config.ts` sets `instantInsights.validationLevel: 'manual-warning'`. Public pages that read `useParams`/`useSearchParams` put that read in a child inside `<Suspense>`.

## 4. Testing

| Suite | Command | What |
| :--- | :--- | :--- |
| Unit / component | `npm run test --workspace @hifzoon/web` | `tests/<domain>/*.test.ts(x)`. API modules tested with `tests/helpers/fetch-mock.ts` (`mockApi`, `envelope`, `apiError`). Components: add `// @vitest-environment jsdom` and use Testing Library. |
| Live integration | `npm run test:integration --workspace @hifzoon/web` | `tests/integration/*.test.ts` against the running, seeded API using `tests/helpers/live.ts` (`actAs('guardian')`, `SEED` ids, `uniq()`). Requires `docker compose up -d` + seed. |

Seeded accounts (password `Hifzoon!Dev2026`): `parent@`, `teacher@`, `teacher.trainee@`, `admin@`, `superadmin@`, `supervisor@`, `safeguarding@`, `examiner@` — all `@hifzoon.test`.

Populate realistic activity (classes, lesson cards, threads, applications) with the backend flow script:
`cd apps/api && SUPERADMIN_EMAIL=superadmin@hifzoon.test npx ts-node --transpile-only scripts/full-flow-check.ts`

Other scripts: `npm run demo:data` (idempotent demo data through the API) and `python scripts/api-coverage.py` (regenerates `docs/api-coverage.md`).

## 5. Backend changes

The web team does not modify `apps/api`. Anything needed from the backend goes in `apps/web/docs/backendrequirement.md`.
