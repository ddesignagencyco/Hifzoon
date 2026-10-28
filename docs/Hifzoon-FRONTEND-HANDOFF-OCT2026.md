# Frontend handoff — Oct 2026 feature batch

Eight features were added to the backend only (per product decision — no new pages/components were built). This doc tells the frontend team what changed, what each new endpoint looks like, and what UI work is still needed. Start from the typed client at `apps/web/src/lib/api/modules/backend-updates-oct2026.ts` — every call below already has a ready-to-import function and type there.

Nothing described here has been committed to git; it's sitting as uncommitted backend changes on the `backend-stripe-livekit` branch.

**Before any of this goes live:** 4 new Prisma migrations were hand-written because the dev database was unreachable while building this (`P1000` auth error each time). They need `npx prisma migrate deploy` run against a real database before these endpoints will work:

- `20261028000000_teacher_leave_and_availability_month`
- `20261028000100_lead_geolocation`
- `20261028000200_teacher_tiers_and_plan_tier`
- `20261028000300_trial_multi_session`

---

## Frontend files already touched

"Backend only" was the instruction for this batch, but two items (#7 and #8) already had frontend edits in flight by the time that instruction landed, so they were left in place rather than reverted. These 10 existing files were modified — nothing else in `apps/web` was touched for this batch besides the new helper file above.

**From #8 — invoice write-off:**

| File                                                       | Why it changed                                                                                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/api/modules/billing-admin.ts`            | Adds the `WriteOffInput` type, `billingAdminApi.writeOffInvoice` client call, and its request validation — the typed call for the new `POST /billing/invoices/:invoiceId/write-off` endpoint. |
| `apps/web/src/hooks/useFinance.ts`                         | Adds the `useWriteOffInvoice` React Query mutation hook wrapping that client call, so components can trigger it with loading/error state.                                                     |
| `apps/web/src/components/admin/finance/BillingForms.tsx`   | Adds the `WriteOffForm` component itself (reason field + submit), mirroring the existing `RefundForm`.                                                                                        |
| `apps/web/src/components/admin/finance/BillingConsole.tsx` | Renders `WriteOffForm` next to the existing refund form on an invoice row, so admin has a "Write off" action alongside "Refund".                                                              |

**From #7 — admin-verified certificates/associations:**

| File                                                | Why it changed                                                                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/api/modules/teacher.ts`           | Adds the `TeacherCredential`-shaped request/response types (`type`, `title`, `issuer`, `documentUrl`, `verified`, `verifiedById`, `verifiedAt`) now that `qualifications` is a structured list instead of a free-form blob.                |
| `apps/web/src/lib/api/modules/teacher-me.ts`        | Small matching type tweak so the teacher's own-profile client stays aligned with the new `qualifications` shape.                                                                                                                           |
| `apps/web/src/components/teacher/ProfileForm.tsx`   | Adds a credentials editor to the teacher's own profile form — type dropdown, title, issuer, and a document field per credential entry, so a teacher can submit certificates/associations in the new structured shape instead of free text. |
| `apps/web/src/components/teacher/ProfileScreen.tsx` | Displays a "Verified" badge next to any credential entry the admin has approved/stamped as verified.                                                                                                                                       |

**Test fixtures, fixed mechanically because `qualifications` became a required typed field:**

| File                                             | Why it changed                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `apps/web/tests/teacher/components.test.tsx`     | Test fixture needed `qualifications: []` added once the form made it a required field. |
| `apps/web/tests/teacher/profile-changes.test.ts` | Same fixture fix, plus one stale assertion updated to match the new shape.             |

Everything else in this handoff (#1, #2, #3, #4, #5, #6) touched **zero** files under `apps/web` — those sections above are the starting point for whoever picks up that UI work.

---

## ⚠️ Breaking change — public pricing page

`GET /billing/plans` (the public, unauthenticated plan listing) **no longer returns `prices`/`amountMinor`**. It now returns each plan's teacher `tier` instead, and will never include a price on this route — that's the point of feature #5 (see below).

`apps/web/src/lib/api/client.ts`'s `fetchPlans()` — used by `usePlans()` → `PricingSection.tsx` / `apps/web/src/app/pricing/page.tsx` / `TrialsWorkspace.tsx` — still expects the old `prices` shape. It was **not** updated. Right now it will silently compute an empty `pricesMinor` for every plan. This needs a frontend fix before deploying: switch it to `publicPlansApi.list()` (new shape below) and redesign the pricing cards around tier, not price, per feature #5.

---

## 1. Monthly tutor availability + leave

A tutor sets their hours and off-days once for a whole calendar month, instead of a recurring weekly-only pattern. There's no lock — calling the "set" endpoint again for the same month just replaces it, so individual days stay editable afterward.

Client: `monthlyAvailabilityApi` in the handoff file.

| Call                                           | Method & path                                                   | Who                                | Notes                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setMonth(teacherId, month, slots, timeZone?)` | `PUT /scheduling/teachers/:teacherId/availability-month/:month` | TEACHER (self), ADMIN, SUPER_ADMIN | `month` is `YYYY-MM`. `slots: [{ weekday: 0-6, startTime: 'HH:mm', endTime: 'HH:mm' }]`. Replaces only that month.                                 |
| `getMonth(teacherId, month)`                   | `GET /scheduling/teachers/:teacherId/availability-month/:month` | same                               | Returns slots + leave days + `submittedAt` together — one call to prefill the calendar UI.                                                         |
| `setLeaveMonth(teacherId, month, days)`        | `PUT /scheduling/teachers/:teacherId/leave-month/:month`        | same                               | `days: [{ date: ISO date, reason?: string }]`. A leave day is automatically excluded from open-slot search — no extra wiring needed for that part. |

**UI still needed:** a tutor-facing month-calendar page (hours grid + mark-off-days), and prefilling it from `getMonth`. Reuse the admin `ScheduleBuilder.tsx` grid patterns for the calendar widget if useful, but this is a self-service (teacher) page, not an admin one.

---

## 2. Marketing — geolocation leads by area

`Lead` now carries `region`, `city`, `postcode`, `lat`, `lng` alongside the existing `country`. These are optional fields on the existing `POST /admin/crm/leads` body — no new create-lead endpoint, just extra fields (see `LeadGeoFields` in the handoff file; the existing `CreateLeadForm.tsx` fields map can simply gain region/city/postcode inputs).

New read endpoint — client: `leadsByAreaApi.list(country?)`.

| Call                            | Method & path                           | Who                            |
| ------------------------------- | --------------------------------------- | ------------------------------ |
| `leadsByAreaApi.list(country?)` | `GET /admin/crm/leads/by-area?country=` | ADMIN, SUPER_ADMIN, SUPERVISOR |

Returns `[{ country, region, count }]` sorted by count descending.

**Note:** there is no IP-based auto-geolocation — lead creation is staff-only (no public funnel endpoint exists yet), so region/city/postcode/lat/lng are entered by staff directly, same as `country` today.

**UI still needed:** region/city/postcode fields added to `CreateLeadForm.tsx`, and an area breakdown view/filter in `CrmWorkspace.tsx` (table or simple grouped-count chart).

---

## 3. Trials — 3×30-min sessions per week

No new endpoints. `POST /trials` (book) and `POST /trials/:classId/outcome` (record outcome) kept their exact existing request/response shapes — only server-side behavior changed:

- A family can now book up to **3 trial sessions per week** per enrolment (was: exactly 1, ever). A 4th booking attempt in the same calendar week is rejected with a 400.
- Recording an outcome is now idempotent **per enrolment**, not per class — recording it against any of the week's sessions resolves to the same outcome record, so admin doesn't need to pick "the right" class.

Exported constant: `TRIAL_SESSIONS_PER_WEEK = 3` — use this instead of hardcoding `3` anywhere in the UI.

**UI still needed:** `apps/web/src/components/admin/trials/TrialsWorkspace.tsx` currently shows a binary booked/not-booked state. It should show "N of 3 sessions used this week" instead.

---

## 4. Per-teacher qualification tiers + badges (admin-maintained)

New admin-only catalog of tiers (e.g. `STANDARD` / `CERTIFIED` / `SENIOR` — these starter names are placeholders seeded in `apps/api/prisma/seed.ts`; final naming is still TBD with the Qaari sb/admin). A tier is assigned to a teacher by admin only — teachers never set their own tier (unlike their `qualifications`, which they can edit themselves — see #7).

Client: `teacherTiersApi` in the handoff file.

| Call                                | Method & path                       | Who                            |
| ----------------------------------- | ----------------------------------- | ------------------------------ |
| `list()`                            | `GET /teachers/teacher-tiers`       | ADMIN, SUPER_ADMIN, SUPERVISOR |
| `create(body)`                      | `POST /teachers/teacher-tiers`      | ADMIN, SUPER_ADMIN             |
| `update(id, body)`                  | `PATCH /teachers/teacher-tiers/:id` | ADMIN, SUPER_ADMIN             |
| `assign(profileId, tierId \| null)` | `PATCH /teachers/:profileId/tier`   | ADMIN, SUPER_ADMIN             |

A `TeacherTier` row: `{ id, code, name, badgeIcon, description, sortOrder, active, createdAt, updatedAt }`.

Both the public teacher-profile endpoint and a teacher's own profile endpoint now include their `tier` (code/name/badgeIcon) in the response — no extra call needed to show the badge once a teacher is fetched.

**UI still needed:** a tier picker added to the admin teacher tools (e.g. `TeacherProfileTools.tsx`), and a badge/tier chip shown wherever a teacher is displayed to parents (teacher cards, profile pages).

---

## 5. Public plans sell teacher tier, not price

Confirmed product decision: the public plans page shows **no price at all**, framed around the teacher tier a plan guarantees (e.g. "Premium → senior, highly-qualified teachers"). CTA-only — "Get Started" / "Contact us" — the real price is only shown once a signed-in family is proceeding to subscribe.

Client: `publicPlansApi` in the handoff file.

| Call                              | Method & path                            | Notes                                                                                                                                                           |
| --------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list()`                          | `GET /billing/plans` (public)            | **Shape changed** — see breaking-change note above. Returns `{ id, code, name, classesPerWeek, classMinutes, roomType, billingPeriod, tier }`, no price.        |
| `priceFor(planId, currency)`      | `GET /billing/plans/:id/price?currency=` | Authenticated. The real price, revealed only once a family is proceeding to subscribe — this is the new home for what `prices`/`amountMinor` used to be inline. |
| `setTier(planId, tierId \| null)` | `PATCH /billing/plans/:id/tier`          | ADMIN, SUPER_ADMIN — links a plan to a teacher tier.                                                                                                            |

**UI still needed:**

1. Fix `fetchPlans()`/`usePlans()` to call the new shape (see breaking-change note).
2. Rewrite `PricingSection.tsx` and `apps/web/src/app/pricing/page.tsx`: replace the "Simple plans, priced in US dollars" heading and `PlanPriceGrid` with tier-benefit cards (badge icon, tier name, 2–3 benefit bullets) and a CTA button — no dollar amount anywhere on this page.
3. Wire the real price into whatever screen comes right before checkout/subscribe, using `priceFor`.

---

## 6. Admin-evaluated payroll

No backend change — already correct. `PayrollConsole.tsx` already requires an explicit admin click to calculate a period and a separate explicit click (with a payout reference) to mark an entry paid; nothing auto-advances. No frontend action needed here.

---

## 7. Admin-verified certificates/associations

Already partially wired into the frontend (done before the "backend only" instruction landed) — flagging it here so the frontend team knows the current state rather than re-discovering it.

- `TeacherCredential` type now lives in `@hifzoon/shared` (`packages/shared/src/types/teacher-credential.ts`): `{ type: 'CERTIFICATE' | 'ASSOCIATION' | 'OTHER', title, issuer, documentUrl, verified, verifiedById?, verifiedAt? }`.
- A teacher's `qualifications` field is now a `TeacherCredential[]`, not a free-form blob. `ProfileForm.tsx` / `ProfileScreen.tsx` and `teacher.ts` / `teacher-me.ts` already build/consume this shape for the teacher-facing side.
- Submitting a credential update goes through the existing staged-change flow (`requestProfileChange` → admin `approveProfileChange`/`rejectProfileChange`). A teacher cannot self-certify `verified: true` — the backend strips that back to `false` on submission unless it exactly matches an already-verified entry. **The admin's approval of the staged change is itself the verification act** — every not-yet-verified entry gets stamped `verified: true` with the approving admin's id and timestamp at that point.
- The public/own-profile endpoints now only return _verified_ credential entries.

**UI still needed:** there is **no admin review UI** yet for staged credential changes — an admin currently has no screen to see a pending qualifications edit (with document links) before approving it. This is the one real gap left in #7; whoever builds it should reuse the Queue + Drawer + resolve-mutation pattern already used by `apps/web/src/components/admin/teacher-changes/TeacherChangesQueue.tsx` (that component itself handles a different, unrelated flow — family-requested teacher changes — don't confuse the two).

---

## 8. Admin-resolved overdue payments (invoice write-off)

Already fully wired into the frontend (done before the "backend only" instruction landed).

- `billingAdminApi.writeOffInvoice` in `billing-admin.ts`, surfaced as a "Write off" form next to the existing refund form in `BillingConsole.tsx` / `BillingForms.tsx`.
- Implementation detail: this reuses the existing `InvoiceStatus.VOID` state rather than adding a new one — `billing.service.ts` already treated `VOID` as "written off" everywhere else, so no new status was needed. No further frontend work required here.

---

## Quick reference — what has zero frontend work done

| #   | Feature                    | Frontend status                                                     |
| --- | -------------------------- | ------------------------------------------------------------------- |
| 1   | Monthly availability/leave | Nothing built — needs a tutor-facing calendar page                  |
| 2   | Geo leads by area          | Nothing built — needs form fields + an area view in CRM             |
| 3   | 3×30min trials             | Nothing built — `TrialsWorkspace.tsx` needs a "N of 3" indicator    |
| 4   | Teacher tiers/badges       | Nothing built — needs an admin tier picker + badge display          |
| 5   | Tier-based plans, no price | Nothing built — needs a pricing-page rewrite + a `fetchPlans()` fix |
| 6   | Admin payroll              | No change needed                                                    |
| 7   | Credential verification    | Teacher-side form done; **admin review UI still missing**           |
| 8   | Invoice write-off          | Fully done                                                          |
