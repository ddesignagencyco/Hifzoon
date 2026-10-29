# Hifzoon Web — Backend Requirements & Status

**Updated:** 2026-10-29  
**Document:** Consolidated frontend handoff from backend team  
**For:** Frontend team planning Q4 sprints

---

## 🔴 CRITICAL — Before Deployment

### Migrations Required
Four new Prisma migrations must be deployed against production before any Oct 2026 features go live:

```bash
npx prisma migrate deploy
```

Migrations:
- `20261028000000_teacher_leave_and_availability_month` (feature #1)
- `20261028000100_lead_geolocation` (feature #2)
- `20261028000200_teacher_tiers_and_plan_tier` (feature #4, #5)
- `20261028000300_trial_multi_session` (feature #3)

### Breaking Changes
- **`GET /billing/plans` endpoint:** No longer returns `prices`/`amountMinor`. Now returns `tier` instead.
  - Impact: `fetchPlans()` in `apps/web/src/lib/api/client.ts` will silently compute empty prices
  - Action required: Rewrite pricing page before deploying (see Feature #5 below)

---

## 📋 October 2026 Backend Features — What Frontend Needs to Build

### ✅ Feature #1: Monthly Tutor Availability + Leave

**Status:** Backend ✅ done | Frontend ❌ not started

**Endpoints:**
```
PUT /scheduling/teachers/:teacherId/availability-month/:month
GET /scheduling/teachers/:teacherId/availability-month/:month
PUT /scheduling/teachers/:teacherId/leave-month/:month
```

**Client functions ready:**
- `monthlyAvailabilityApi.setMonth(teacherId, month, slots, timeZone?)`
- `monthlyAvailabilityApi.getMonth(teacherId, month)`
- `monthlyAvailabilityApi.setLeaveMonth(teacherId, month, days)`

**Request format:**
```typescript
// setMonth: slots: [{ weekday: 0-6, startTime: 'HH:mm', endTime: 'HH:mm' }]
// setLeaveMonth: days: [{ date: ISO date, reason?: string }]
```

**Frontend work:**
- [ ] Teacher calendar page (month view with hours grid + mark off-days)
- [ ] Prefill from `getMonth()` 
- [ ] Reuse `ScheduleBuilder.tsx` patterns for the calendar widget

---

### ✅ Feature #2: Marketing — Geolocation Leads

**Status:** Backend ✅ done | Frontend ❌ not started

**New fields on `Lead`:** `region`, `city`, `postcode`, `lat`, `lng` (optional)

**New endpoint:**
```
GET /admin/crm/leads/by-area?country=
```

**Client function ready:**
- `leadsByAreaApi.list(country?)` — returns `[{ country, region, count }]` sorted by count desc

**Frontend work:**
- [ ] Add region/city/postcode fields to `CreateLeadForm.tsx`
- [ ] Add area breakdown view/filter in `CrmWorkspace.tsx` (table or chart)

**Note:** No IP-based auto-geolocation; staff enters location directly.

---

### ✅ Feature #3: Trials — 3×30-min Sessions Per Week

**Status:** Backend ✅ done | Frontend ❌ not started

**Changes:** No new endpoints. Server-side behavior:
- Family can book up to **3 trial sessions per week** per enrolment (was: exactly 1)
- 4th booking rejected with 400
- Outcome recording is now idempotent per enrolment, not per class

**Constants:**
```typescript
TRIAL_SESSIONS_PER_WEEK = 3  // Use this, don't hardcode
```

**Frontend work:**
- [ ] Update `TrialsWorkspace.tsx`: show "N of 3 sessions used this week" instead of binary state

---

### ✅ Feature #4: Per-Teacher Qualification Tiers + Badges

**Status:** Backend ✅ done | Frontend ❌ not started

**Endpoints:**
```
GET /teachers/teacher-tiers
POST /teachers/teacher-tiers
PATCH /teachers/teacher-tiers/:id
PATCH /teachers/:profileId/tier
```

**Client functions ready:**
- `teacherTiersApi.list()`
- `teacherTiersApi.create(body)`
- `teacherTiersApi.update(id, body)`
- `teacherTiersApi.assign(profileId, tierId | null)`

**TeacherTier shape:**
```typescript
{ id, code, name, badgeIcon, description, sortOrder, active, createdAt, updatedAt }
```

**Notes:**
- Admin-only assignment (teachers don't set their own tier)
- Tier is now included in teacher profile endpoints (no extra call needed)
- Tier codes are placeholders in seed: `STANDARD` / `CERTIFIED` / `SENIOR` (TBD with product)

**Frontend work:**
- [ ] Tier picker added to admin teacher tools (e.g., `TeacherProfileTools.tsx`)
- [ ] Badge/tier chip displayed wherever teachers shown to parents (cards, profiles)

---

### ✅ Feature #5: Public Plans Sell Teacher Tier, Not Price

**Status:** Backend ✅ done | Frontend ❌ not started

**Breaking change:** `GET /billing/plans` shape changed.

**Old shape:**
```typescript
{ id, code, name, classesPerWeek, classMinutes, roomType, billingPeriod, prices: [...] }
```

**New shape:**
```typescript
{ id, code, name, classesPerWeek, classMinutes, roomType, billingPeriod, tier: { code, name, badgeIcon } }
```

**Endpoints:**
```
GET /billing/plans (public) — returns new shape, no prices
GET /billing/plans/:id/price?currency= (authenticated) — returns actual price
PATCH /billing/plans/:id/tier (admin) — links plan to tier
```

**Client functions ready:**
- `publicPlansApi.list()` — new shape
- `publicPlansApi.priceFor(planId, currency)` — get price for subscribe flow
- `publicPlansApi.setTier(planId, tierId | null)` — admin only

**Frontend work (CRITICAL):**
- [ ] Fix `fetchPlans()` / `usePlans()` to call new shape
- [ ] Rewrite `PricingSection.tsx` & `apps/web/src/app/pricing/page.tsx`:
  - Remove "Simple plans, priced in US dollars" heading
  - Replace `PlanPriceGrid` with tier-benefit cards (badge, tier name, 2–3 benefits, CTA button)
  - **NO dollar amounts on public pricing page**
- [ ] Wire real price into checkout/subscribe screen using `priceFor()`

---

### ✅ Feature #6: Admin-Evaluated Payroll

**Status:** Backend ✅ already correct | Frontend ✅ no change needed

No action required. `PayrollConsole.tsx` already requires explicit admin clicks; works as-is.

---

### 🟡 Feature #7: Admin-Verified Certificates/Associations

**Status:** Backend ✅ done | Frontend 🟡 partially done

**Already wired (completed before "backend only" instruction):**
- `TeacherCredential` type in `@hifzoon/shared`
- `qualifications: TeacherCredential[]` (structured, not free-form)
- `ProfileForm.tsx` & `ProfileScreen.tsx` build/consume this shape
- Teacher-side staged-change flow wired (`requestProfileChange` → approve/reject)
- Public/own-profile endpoints return verified entries only

**Verification flow:**
- Teacher submits credential (unverified)
- Goes through staged-change approval
- **Admin approval stamps it verified** (with admin id + timestamp)
- Cannot be self-certified

**Frontend work STILL NEEDED:**
- [ ] Admin review UI for staged credential changes
  - Show pending qualifications edit (with document links)
  - Reuse Queue + Drawer pattern from `TeacherChangesQueue.tsx` (not the same flow, different drawer)
  - Approval action verifies the credential

---

### ✅ Feature #8: Admin-Resolved Overdue Payments (Invoice Write-Off)

**Status:** Backend ✅ done | Frontend ✅ fully done

No further action. Already wired:
- `billingAdminApi.writeOffInvoice` in `billing-admin.ts`
- "Write off" form next to refund form in `BillingConsole.tsx`
- Uses existing `InvoiceStatus.VOID` state

---

## 📊 Frontend Work Summary — Oct 2026 Features

| Feature | Backend | Frontend | Priority |
|:---|:---:|:---:|:---|
| #1 Monthly availability/leave | ✅ | ❌ Calendar page | Medium |
| #2 Geo leads | ✅ | ❌ Form + area view | Low |
| #3 3×trials per week | ✅ | ❌ "N of 3" indicator | High |
| #4 Teacher tiers/badges | ✅ | ❌ Tier picker + display | High |
| #5 Tier-based plans, no price | ✅ | ❌ **CRITICAL rewrite** | High |
| #6 Admin payroll | ✅ | ✅ No change | — |
| #7 Credential verification | ✅ | 🟡 Missing admin review UI | Medium |
| #8 Invoice write-off | ✅ | ✅ Done | — |

---

## 🔄 Carry-Forward Items — Still Open from v4.8.0

These requirements remain open from the previous backend handoff. They are **not part of the Oct 2026 batch** but still block frontend work:

### Critical for v1 (Must have before launch)

| ID | Requirement | Impact |
|:---|:---|:---|
| **M48** | Child joins classroom as student (not just GUARDIAN_VIEWER) | Classroom unusable for students |
| **M49** | Student can list their own upcoming classes | Student portal incomplete |
| **M54** | Admin sees pending teacher profile changes | Admin workflow incomplete |
| **M56** | Family/student can report concern via UI | Child-safety policy unfulfilled |

### High Priority (Should have v1)

| ID | Requirement | Impact |
|:---|:---|:---|
| **M50** | Prevent mistake logging before class starts / without student join | QA/audit gap |
| **M55** | Classroom state includes course name, recording status, student list | Teacher experience broken |
| **M69** | Signed-in password change | Account security incomplete |

### Pending Questions (Need product answer)

| ID | Question | Impact |
|:---|:---|:---|
| **Q9** | USD vs PKR pricing periods (monthly vs annual) | Billing display accuracy |
| **M26** | Public trial intake flow (rate limit, hCaptcha, lead creation) | Public booking path undefined |

### Deferred (Second release)

M2, M22–M27, M30, M31, M35–M39, M41, M44, Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23

---

## 📌 Client Helper File

All Oct 2026 endpoint clients are pre-built. Start from:

**File:** `apps/web/src/lib/api/modules/backend-updates-oct2026.ts`

Every function below already has a ready-to-import typed wrapper there:
- `monthlyAvailabilityApi.*`
- `leadsByAreaApi.*`
- `teacherTiersApi.*`
- `publicPlansApi.*`

---

## 🚀 Sprint Planning Guide

**Sprint 1 (Urgent):**
1. Fix `fetchPlans()` / `usePlans()` to new shape
2. Rewrite pricing page (Feature #5) — blocks public site
3. Add "N of 3 trials" to trials workspace (Feature #3)

**Sprint 2:**
4. Tier picker + badge display (Feature #4)
5. Teacher calendar page (Feature #1)

**Sprint 3:**
6. Admin credential review UI (Feature #7, the missing piece)
7. Geo leads form + area view (Feature #2)

**Parallel (Carry-forward, depends on backend):**
- M48, M49, M54, M56 (critical blockers for v1)
- M50, M55, M69 (account security + classroom UX)

---

## ✨ What's Already Merged

Nothing in this batch is committed yet — it's uncommitted on the `backend-stripe-livekit` branch awaiting:
1. Migrations run against real database
2. Frontend implementation
3. Testing across both teams

---

**Questions?** Check with backend team on `backend-stripe-livekit` branch status or reach out to product for Q9/M26 decisions.
