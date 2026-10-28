import { http } from '../http';

/**
 * Typed client for the backend-only Oct 2026 feature batch (plan items #1–#8).
 *
 * These 8 endpoints/behaviours were implemented in the API with NO corresponding
 * frontend work — per instruction, this round of changes is backend-only. This file
 * is the single place a future frontend pass should start from: it has the request/
 * response shapes and thin `http` wrappers for every new or changed route, so no one
 * has to re-derive them from the NestJS controllers. Nothing in `apps/web` imports
 * this file yet; it exists purely as a reference/starting point for that later work.
 *
 * NOT covered here (already wired into the frontend before this file was written):
 *   - #7 credential verification — `TeacherCredential` type lives in `@hifzoon/shared`;
 *     `ProfileForm.tsx`/`ProfileScreen.tsx` and `teacher.ts`/`teacher-me.ts` already consume it.
 *   - #8 invoice write-off — `billing-admin.ts` already has `WriteOffInput` / `writeOffInvoice`.
 *   - #6 payroll — no backend change was needed (the admin-confirmation gate already existed).
 *
 * ── Breaking change to flag ─────────────────────────────────────────────────────────
 * `GET /billing/plans` (point 5) no longer returns `prices`/`amountMinor` — it now
 * returns each plan's `tier` instead, and never a price (confirmed product decision:
 * the public plans page sells teacher quality, not a number). The existing
 * `fetchPlans()` in `apps/web/src/lib/api/client.ts` (used by `usePlans()` →
 * `PricingSection.tsx` / `/pricing` / `TrialsWorkspace.tsx`) still expects the old
 * `prices` shape and was NOT updated — it will now always compute an empty
 * `pricesMinor`. Use `publicPlansApi.list()` below for the new shape, and
 * `publicPlansApi.priceFor(planId, currency)` for the real price once a signed-in
 * family is proceeding to subscribe (same two-step split the backend now enforces).
 */

// ── #1 — Monthly tutor availability + leave (SchedulingController) ──────────────────

export interface MonthlyAvailabilitySlotInput {
  weekday: number; // 0 (Sun) – 6 (Sat)
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
}

export interface MonthlyLeaveDayInput {
  date: string; // ISO date, must fall within the target month
  reason?: string;
}

export interface MonthlyAvailabilitySlot {
  weekday: number;
  startTime: string;
  endTime: string;
  timeZone: string;
}

export interface MonthlyLeaveDay {
  date: string | null;
  reason: string | null;
}

/** `GET/PUT .../availability-month/:month` and `PUT .../leave-month/:month` payload. */
export interface MonthlyAvailabilityAndLeave {
  teacherId: string;
  month: string; // 'YYYY-MM'
  submittedAt: string | null;
  slots: MonthlyAvailabilitySlot[];
  leaveDays: MonthlyLeaveDay[];
}

export const monthlyAvailabilityApi = {
  /**
   * `PUT /scheduling/teachers/:teacherId/availability-month/:month` — replaces the
   * teacher's hours for one calendar month in one call. No lock: calling this again
   * for the same month replaces it again, so individual days stay editable afterward.
   */
  setMonth: (teacherId: string, month: string, slots: MonthlyAvailabilitySlotInput[], timeZone?: string) =>
    http.put<MonthlyAvailabilityAndLeave>(
      `/scheduling/teachers/${encodeURIComponent(teacherId)}/availability-month/${encodeURIComponent(month)}`,
      { slots, timeZone },
    ),

  /** `GET /scheduling/teachers/:teacherId/availability-month/:month` */
  getMonth: (teacherId: string, month: string) =>
    http.get<MonthlyAvailabilityAndLeave>(
      `/scheduling/teachers/${encodeURIComponent(teacherId)}/availability-month/${encodeURIComponent(month)}`,
    ),

  /**
   * `PUT /scheduling/teachers/:teacherId/leave-month/:month` — replaces the teacher's
   * declared off-days for one month. Scheduling excludes these dates from open-slot
   * search, so a leave day is never offered for booking.
   */
  setLeaveMonth: (teacherId: string, month: string, days: MonthlyLeaveDayInput[]) =>
    http.put<MonthlyAvailabilityAndLeave>(
      `/scheduling/teachers/${encodeURIComponent(teacherId)}/leave-month/${encodeURIComponent(month)}`,
      { days },
    ),
};

// ── #2 — Marketing: geolocation leads by area (CrmController) ───────────────────────

/** Optional geo fields now accepted by the existing `POST /admin/crm/leads`. */
export interface LeadGeoFields {
  region?: string;
  city?: string;
  postcode?: string;
  lat?: number; // -90..90
  lng?: number; // -180..180
}

export interface LeadsByAreaRow {
  country: string | null;
  region: string | null;
  count: number;
}

export const leadsByAreaApi = {
  /** `GET /admin/crm/leads/by-area?country=` — lead counts grouped by country + region. */
  list: (country?: string) => http.get<LeadsByAreaRow[]>('/admin/crm/leads/by-area', { query: { country } }),
};

// ── #4 — Admin-maintained teacher qualification tiers / badges (TeachersController) ─

export interface TeacherTier {
  id: string;
  code: string;
  name: string;
  badgeIcon: string | null;
  description: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeacherTierInput {
  code: string;
  name: string;
  badgeIcon?: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateTeacherTierInput {
  name?: string;
  badgeIcon?: string | null;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface TeacherTierAssignment {
  id: string;
  tierId: string | null;
  tier: { code: string; name: string; badgeIcon: string | null } | null;
}

export const teacherTiersApi = {
  /** `GET /teachers/teacher-tiers` — admin-maintained catalogue (ADMIN/SUPER_ADMIN/SUPERVISOR). */
  list: () => http.get<TeacherTier[]>('/teachers/teacher-tiers'),

  /** `POST /teachers/teacher-tiers` (ADMIN/SUPER_ADMIN). */
  create: (body: CreateTeacherTierInput) => http.post<TeacherTier>('/teachers/teacher-tiers', body),

  /** `PATCH /teachers/teacher-tiers/:id` (ADMIN/SUPER_ADMIN). */
  update: (id: string, body: UpdateTeacherTierInput) =>
    http.patch<TeacherTier>(`/teachers/teacher-tiers/${encodeURIComponent(id)}`, body),

  /**
   * `PATCH /teachers/:profileId/tier` — assigns (`tierId`) or clears (`tierId: null`) a
   * teacher's tier. Admin-only; unlike `qualifications`, a teacher never sets this
   * themselves (point 4's confirmed decision: tiers/badges are admin-maintained).
   */
  assign: (profileId: string, tierId: string | null) =>
    http.patch<TeacherTierAssignment>(`/teachers/${encodeURIComponent(profileId)}/tier`, { tierId }),
};

// ── #5 — Public plans sell teacher tier, never a price (BillingController) ──────────

export interface PublicPlan {
  id: string;
  code: string;
  name: string;
  classesPerWeek: number;
  classMinutes: number;
  roomType: 'ONE_TO_ONE' | 'CIRCLE';
  billingPeriod: string;
  tier: { code: string; name: string; badgeIcon: string | null; description: string | null } | null;
}

export interface PlanPrice {
  id: string;
  planId: string;
  currency: string;
  amountMinor: number;
  createdAt: string;
  updatedAt: string;
}

export const publicPlansApi = {
  /**
   * `GET /billing/plans` (public) — the new shape: teacher tier, never a price. This is
   * the same route `fetchPlans()` in `apps/web/src/lib/api/client.ts` already calls, but
   * that function still expects the old `prices` field — see the module-level note above.
   */
  list: () => http.get<PublicPlan[]>('/billing/plans'),

  /**
   * `GET /billing/plans/:id/price?currency=` — the real price, revealed once a
   * signed-in family is proceeding to subscribe. Not on the public route.
   */
  priceFor: (planId: string, currency: string) =>
    http.get<PlanPrice>(`/billing/plans/${encodeURIComponent(planId)}/price`, { query: { currency } }),

  /** `PATCH /billing/plans/:id/tier` (ADMIN/SUPER_ADMIN) — assigns/clears a plan's tier. */
  setTier: (planId: string, tierId: string | null) =>
    http.patch<{ id: string; tierId: string | null; tier: { code: string; name: string } | null }>(
      `/billing/plans/${encodeURIComponent(planId)}/tier`,
      { tierId },
    ),
};

// ── #3 — Trials: 3×30-min sessions per week, not one single class ───────────────────

/**
 * `POST /trials` and `POST /trials/:classId/outcome` kept their existing request/
 * response shapes — only the server-side behaviour changed, so no new client call is
 * needed here. What changed: `bookTrial` now allows up to this many trial sessions per
 * enrolment within the current calendar week (a 4th in the same week is rejected), and
 * `completeTrialOutcome` is idempotent per *enrolment* rather than per class — recording
 * an outcome against any of the week's sessions resolves to the same outcome record.
 * A future "N of 3 used this week" UI (e.g. in `TrialsWorkspace.tsx`) should read this
 * constant rather than hardcoding `3`.
 */
export const TRIAL_SESSIONS_PER_WEEK = 3;
