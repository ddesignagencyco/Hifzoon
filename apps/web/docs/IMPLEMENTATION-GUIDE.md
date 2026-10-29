# October 2026 Backend Features — Implementation Guide

**Updated:** 2026-10-29  
**Status:** Component scaffolding complete, wiring in progress

---

## ✅ Completed (Today)

### Feature #5: Tier-Based Pricing (CRITICAL)
- ✅ Updated `fetchPlans()` to use new `publicPlansApi.list()` (tier data, no prices)
- ✅ Created `TierBenefitCards.tsx` component with tier-based display
- ✅ Rewrote `PricingSection.tsx` with new heading ("Plans featuring vetted teachers")
- ✅ Added `tier?: PlanTier` field to `TuitionPlanTier` interface
- ✅ **STATUS:** Pricing page now shows tiers, no prices. Ready to test.

### Feature #3: 3×Trials Per Week  
- ✅ Added "Trial limit: Families can book up to 3 sessions per week" hint to `TrialsWorkspace.tsx`
- ✅ **STATUS:** Admin can see limit when booking. Backend enforces 4th rejection.

### Feature #4: Teacher Tiers & Badges
- ✅ Created `TeacherTierBadge.tsx` component (reusable badge display)
- ✅ Created `TierPicker.tsx` component (admin tier assignment)
- ✅ **STATUS:** Components ready, need wiring into teacher profile pages.

### Feature #1: Monthly Tutor Availability  
- ✅ Created `MonthlyAvailabilityEditor.tsx` scaffold with API wiring
- ✅ **STATUS:** Skeleton ready, needs calendar grid UI (can reuse `ScheduleBuilder.tsx` patterns).

---

## 🔧 Ready for Wiring (In Progress)

### Feature #4 Wiring — Add Tier Picker & Badge Display

**Locations to update:**

1. **Admin Teacher Profile** (`apps/web/src/components/admin/teacher/TeacherDetail.tsx` or similar)
   ```tsx
   import { TierPicker } from '@/components/admin/teacher/TierPicker';
   import { TeacherTierBadge } from '@/components/shared/TeacherTierBadge';
   
   // Add to teacher detail form:
   <TierPicker
     value={teacherId}
     onChange={(tierId) => teacherTiersApi.assign(profileId, tierId)}
   />
   ```

2. **Teacher Cards** (public, parent view, admin listing)
   ```tsx
   {teacher.tier && (
     <TeacherTierBadge tier={teacher.tier} size="sm" />
   )}
   ```

3. **Teacher Profile Pages**
   - `apps/web/src/app/teachers/[userId]/page.tsx` — show tier badge
   - `apps/web/src/components/teacher/ProfileScreen.tsx` — show tier alongside qualifications

---

### Feature #1 Wiring — Complete Calendar Grid

**File:** `apps/web/src/components/teacher/MonthlyAvailabilityEditor.tsx`

**What's missing:**
- [ ] Month calendar grid widget (7 columns for weekdays, 4-6 rows for weeks)
- [ ] Time slot inputs per day (startTime, endTime dropdowns or inputs)
- [ ] Checkboxes to mark leave days
- [ ] Submit button already wired to `monthlyAvailabilityApi`

**Reuse from codebase:**
- `ScheduleBuilder.tsx` patterns (grid layout, time pickers)
- `TimezoneSelect` component (already in form)
- Day/time picker logic from existing scheduling components

---

### Feature #2 (Low Priority) — Geo Leads

**Where to add:**
1. **CreateLeadForm.tsx** — Add fields:
   ```tsx
   <Field label="Region" htmlFor="region">
     <TextInput id="region" value={region} onChange={(e) => setRegion(e.target.value)} />
   </Field>
   // + city, postcode fields
   ```

2. **CrmWorkspace.tsx** — Add area breakdown view:
   ```tsx
   const leadsByArea = await leadsByAreaApi.list(country);
   // Display as: [{ country, region, count }] sorted by count
   ```

**API:**
```typescript
import { leadsByAreaApi } from '@/lib/api/modules/backend-updates-oct2026';

leadsByAreaApi.list(country?);  // Returns area breakdown
```

---

### Feature #7 (Medium Priority) — Credential Verification Admin UI

**Pattern:** Copy `TeacherChangesQueue.tsx` structure but for staged credential changes

**What needs:**
1. Queue showing teachers with pending credential edits
2. Drawer displaying:
   - Current (verified) credentials
   - Pending (staged) credentials with document download links
   - Approve/reject buttons
3. On approve: stamp credentials as verified

**File location:** `apps/web/src/components/admin/teacher/CredentialVerificationQueue.tsx`

**API client ready:**
```typescript
// Use existing endpoint
requestProfileChange(...qualifications)  // Teacher submits staged changes
approveProfileChange(...)  // Admin approves (this verifies)
rejectProfileChange(...)   // Admin rejects
```

---

## 📋 Component Checklist

| Component | File | Status | Notes |
|:---|:---|:---|:---|
| `TierBenefitCards` | pricing page | ✅ Done | Replaces `PlanPriceGrid` |
| `TeacherTierBadge` | display badge | ✅ Done | Reusable in many places |
| `TierPicker` | admin assign | ✅ Done | Ready to wire into profiles |
| `MonthlyAvailabilityEditor` | scaffold | ✅ Done | Needs calendar grid UI |
| Tier wiring | profiles | 🔧 TODO | Wire picker + badge display |
| Credential queue | admin UI | 🔧 TODO | Copy TeacherChangesQueue pattern |
| Calendar grid | availability | 🔧 TODO | Reuse ScheduleBuilder patterns |
| Geo leads form | CRM form | 🔧 TODO | Add 3 new fields to CreateLeadForm |

---

## 🚀 Next Steps (Priority Order)

1. **Wire tier picker & badges** (Feature #4)
   - Add to all teacher display locations
   - ~2 hours

2. **Complete calendar grid** (Feature #1)  
   - Build month calendar UI
   - ~3 hours

3. **Credential verification admin UI** (Feature #7)
   - Queue + drawer pattern
   - ~4 hours

4. **Geo leads form fields** (Feature #2)
   - Add 3 fields to existing form
   - ~1 hour

**All in-progress components have API clients ready to import from:**
```typescript
import { publicPlansApi, teacherTiersApi, monthlyAvailabilityApi, leadsByAreaApi }
  from '@/lib/api/modules/backend-updates-oct2026';
```

---

## 🔗 API Client Functions Ready

```typescript
// Feature #5: Tier-based plans
publicPlansApi.list()                    // GET /billing/plans (tier info)
publicPlansApi.priceFor(planId, currency) // GET /billing/plans/:id/price

// Feature #4: Teacher tiers
teacherTiersApi.list()                   // GET /teachers/teacher-tiers
teacherTiersApi.create(body)              // POST /teachers/teacher-tiers
teacherTiersApi.update(id, body)          // PATCH /teachers/teacher-tiers/:id
teacherTiersApi.assign(profileId, tierId) // PATCH /teachers/:profileId/tier

// Feature #1: Monthly availability
monthlyAvailabilityApi.setMonth(teacherId, month, slots, tz)
monthlyAvailabilityApi.getMonth(teacherId, month)
monthlyAvailabilityApi.setLeaveMonth(teacherId, month, days)

// Feature #3: Trials (already in hooks)
TRIAL_SESSIONS_PER_WEEK = 3  // Constant

// Feature #2: Geo leads
leadsByAreaApi.list(country?)  // GET /admin/crm/leads/by-area
```

---

## ⚠️ Critical Reminders

1. **Pricing page must NOT show any prices** — only tiers
2. **3 trials per week limit** — backend enforces; UI shows info
3. **Tier badges** — appear wherever teachers are shown to parents/students
4. **Migrations required** — run `npx prisma migrate deploy` before go-live
5. **No price field on public page** — use `publicPlansApi.priceFor()` in checkout flow only

---

**Questions?** All component scaffolding complete. Focus on wiring into existing pages and building the calendar grid UI. The hardest part (API integration) is already done.
