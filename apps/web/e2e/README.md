# E2E (Playwright) — Hifzoon web app

Automated counterpart to [`../docs/MODULE-FLOWS.md`](../../docs/MODULE-FLOWS.md). Same modules, same steps, run by machine instead of by hand.

---

## 1. Install

```bash
cd apps/web
npm install
npm run e2e:install      # downloads the Chromium binary (one time)
```

## 2. Prerequisites (same as the manual doc)

```bash
# from the repo root
POSTGRES_PORT=5435 REDIS_PORT=6382 npm run docker:up
npm run db:seed
npm run dev              # api :4000 + worker

# then load demo data (courses, classes, threads, cases, payroll, ...)
cd apps/web && npm run demo:data
```

`playwright.config.ts` starts `npm run dev` for the web app itself if it is not already listening on :3000 (it reuses an existing server).

## 3. Run

```bash
cd apps/web

npm run e2e                        # everything
npm run e2e -- --project=desktop   # desktop only
npm run e2e -- auth.spec.ts        # one file
npm run e2e -- -g "Parent portal"  # by test name
npm run e2e:ui                     # interactive debugger
npm run e2e:headed                 # watch it run
npm run e2e:report                 # open the HTML report
```

Useful env vars:

| Var | Default |
|---|---|
| `E2E_WEB_URL` | `http://localhost:3000` |
| `E2E_API_URL` | `http://localhost:4000/api/v1` |
| `SEED_PASSWORD` | `Hifzoon!Dev2026` |
| `E2E_SKIP_WEBSERVER` | unset (set to `1` if you run `next dev` yourself) |

## 4. Layout

| File | Covers | Manual doc section |
|---|---|---|
| `e2e/global-setup.spec.ts` | Preconditions: API health, seeded logins, demo data, web responds | §0 |
| `e2e/auth.spec.ts` | Login, role tabs, Kids Mode disabled, 2FA step, role routing, guards, 403, refresh survival, open-redirect guard | §1 |
| `e2e/public.spec.ts` | Home sections, header/footer links, policies, 404, courses, teachers, resources, pricing + currency, booking wizard, teacher application | §2, §3 |
| `e2e/parent.spec.ts` | Family nav, children, child detail tabs, timetable, messaging send, consent, billing, notifications, watch-only classroom | §5, §10, §11, §12, §13, §25 |
| `e2e/teacher.spec.ts` | Teacher nav, Today, timetable, availability, students, payslips, profile, messaging, classroom token window, brief, lesson card, Mushaf API | §7, §8, §9, §14, §21 |
| `e2e/supervisor.spec.ts` | Supervisor nav, scorecards, review wizard, hiring pipeline, cases, examiner empty state, safeguarding board/SLA | §15, §16, §4 |
| `e2e/admin.spec.ts` | Admin nav, users, CRM, trials, teacher changes, teacher hub, scheduling + rrule preview, courses, billing, payroll, content, settings, super-admin-only audit | §6, §7, §17–§23 |
| `e2e/student.spec.ts` | Student portal, notifications, role isolation, portal switcher, route-sweep smoke tests | §26, §27 |
| `e2e/responsive.spec.ts` | Mobile drawer, mobile login, horizontal overflow | §27 |

`e2e/helpers.ts` holds the shared fixtures (`guardian`, `teacher`, `supervisor`, `admin`, `superAdmin`, `safeguarding`, `student`), the API helpers, and the selector cheat-sheet.

## 5. Design notes

- **Selectors are role/placeholder based, not CSS classes.** Tailwind utility strings are unstable; accessible names and placeholders are stable. Literal strings were read from the component source, e.g. `getByPlaceholder('name@example.com')` (`app/login/page.tsx:337`), `getByRole('button', { name: 'Sign out' })` (`components/portal/PortalShell.tsx:122`).
- **The app has almost no `data-testid`s** (only two). If you want these tests hardened further, adding `data-testid` to the forms would help; the current suite deliberately avoids that dependency.
- **Serial execution (`workers: 1`)** because the API has a shared login rate limiter and the demo data is shared across tests.
- **Self-skipping.** Tests that need a live scheduled class call `findTeacherClassId()` and `test.skip()` when the demo window has closed, so the suite stays green outside the seeded window.
- **Mutation-tolerant.** A few tests write (send a message, toggle consent, create a lead) and are written to assert the outcome, not the exact row count, so they are re-runnable.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `is the API running on :4000?` | Start `npm run dev` from the repo root |
| `Login failed for … Did you run npm run db:seed` | Run `npm run db:seed`, then `cd apps/web && npm run demo:data` |
| `ECONNREFUSED :3000` | Start `npm run dev:web`, or unset `E2E_SKIP_WEBSERVER` |
| `Verifying secure session...` hangs | The refresh cookie was not set — check `CORS_ORIGINS` in `apps/api/.env` includes `http://localhost:3000` |
| Browser binary missing | `npm run e2e:install` |
| Port 5432/6379 already in use | Use `POSTGRES_PORT=5435 REDIS_PORT=6382` to match `apps/api/.env` |