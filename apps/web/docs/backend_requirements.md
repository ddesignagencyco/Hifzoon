# Hifzoon — Backend Requirements from the Web Team

**Document Version:** 4.9.0  
**Updated:** 2026-10-28  
**Author:** Frontend Engineering Team  
**Verified against:** `feat-frontend-ui` branch at commit `8dc1c17` merged with `backend-regression` and `dev`  
**Scope:** Everything the web app (`apps/web`) needs changed or added outside `apps/web`. The web team does not modify `apps/api`, `packages/*` or `docker/*`.

Paths are relative to `apps/api/src/modules/` unless stated.

---

## 0. How to use this document (backend team)

- Every open item has an **ID**, the **evidence** (file:line or description), the **problem** and the **requested change**.
- **Status legend:**
  - ✅ **FIXED** — verified working in code
  - 🔴 **OPEN** — needs backend work
  - ❓ **QUESTION** — needs product decision
  - ⏸ **DEFERRED** — intentionally postponed (second release)
  - ⚠️ **BLOCKED** — blocked by external decision (provider, vendor, product)

---

## 1. Summary

| Group | Count | Status |
|:---|---:|:---|
| ✅ Verified working | 28 | Auth, OAuth, 2FA, errors, events all confirmed in source |
| 🔴 Open defects | 0 | All v4.8.0 defects fixed and verified |
| ❓ Questions | 2 | Q9 (pricing periods), M26 (public intake) need product answer |
| 🟡 New requests | 20+ | M48, M49, M50, M54–M69 (see §3, §5, §9) |
| ⏸ Deferred | 26 | Tracked separately; see §8 |
| ⚠️ Build issue | 1 | Shared package dist out of sync — see §2 |

---

## 2. ⚠️ Current Build Issue (Needs Immediate Fix)

**Problem:** TypeScript compilation errors in the API (`npm run dev:api` and `npm run dev:worker` fail).

**Root cause:** The `packages/shared` source files have the correct constants, but the `dist/` folder is outdated. TypeScript is picking up stale definitions:
- `ErrorCode.TWO_FACTOR_ENROLMENT_REQUIRED` ✅ exists in source (`packages/shared/src/constants/errors.ts:34`)
- `ErrorCode.REAUTH_REQUIRED` ✅ exists in source (`packages/shared/src/constants/errors.ts:31`)
- `ErrorCode.OAUTH_STATE_INVALID` ✅ exists in source (`packages/shared/src/constants/errors.ts:12`)
- `ErrorCode.OAUTH_ACCOUNT_LINKED` ✅ exists in source (`packages/shared/src/constants/errors.ts:44`)
- `ErrorCode.OAUTH_LINK_REQUIRED` ✅ exists in source (`packages/shared/src/constants/errors.ts:45`)
- `ClassroomEvents.MEDIA_STATE` ✅ exists in source (`packages/shared/src/types/classroom-events.ts:22`)

**Solution:** Rebuild the shared package:
```bash
npm run build  # builds shared first, then api
```

Or specifically:
```bash
cd packages/shared && npm run build
cd ../../apps/api && npm run build
```

---

## 3. ✅ Verified — Auth, OAuth, 2FA, Error Codes

All core authentication infrastructure is in place:

| Feature | Location | Status | Verified |
|:---|:---|:---|:---|
| Register (email + password) | `auth/auth.controller.ts:69` | ✅ | `@Post('register')` with `RegisterDto` |
| Login | `auth/auth.controller.ts:77` | ✅ | `@Post('login')` with rate limit |
| Google OAuth | `auth/oauth/oauth.controller.ts` | ✅ | `GET /oauth/:provider`, `POST /oauth/:provider/callback` |
| Apple OAuth | `auth/oauth/oauth.controller.ts` | ✅ | Same as Google |
| OAuth state validation | `auth/oauth/oauth.service.ts:163–185` | ✅ | Error codes `OAUTH_STATE_INVALID`, `OAUTH_EMAIL_UNVERIFIED` defined |
| 2FA setup (TOTP) | `auth/two-factor.service.ts` | ✅ | `GenerateTwoFactorSecretDto`, recovery codes |
| 2FA enforcement | `auth/two-factor-enrolment.interceptor.ts:56` | ✅ | `ErrorCode.TWO_FACTOR_ENROLMENT_REQUIRED` defined and used |
| Refresh token (httpOnly) | `auth/auth-cookie.ts` | ✅ | Cookie management functions present |
| Access token (15 min) | `auth/auth.service.ts` | ✅ | JWT generation and validation |
| Re-auth gate (Q16) | `auth/auth.service.ts:658` | ✅ | `ErrorCode.REAUTH_REQUIRED` defined (403) |
| All error codes | `packages/shared/src/constants/errors.ts` | ✅ | 26 codes defined, includes all OAuth variants |

**Verdict:** OAuth implementation (M48–M49 in progress) is correctly defined. Error codes and event types have been added to the shared package — just need rebuild.

---

## 4. 🔴 OPEN: Critical for Web UI to Work (Next Steps)

### M48 🚨 — Child Can't Join as Student

**Problem:** A child enrolled in a class cannot join as `STUDENT` participant because:
1. Guardians create children without a user account (`student.userId` is null)
2. No endpoint exists to create or link a user account to a child
3. Kids PIN (M2) is deferred
4. Guardians can only join as `GUARDIAN_VIEWER` (read-only)
5. Result: **No student ever attends; teacher has nobody to teach**

**Evidence:** `classroom/classroom.service.ts:181–203` (role resolution logic)

**Requested change:** Pick one or both:
- **(a) Guardian joins as the child** — `POST /classroom/token-request { asStudentId }` returns a `STUDENT` participant token for that child, counted in attendance
- **(b) Link child to user account** — `POST /families/:familyId/students/:studentId/invite-login` sends an invite email, or `POST /families/:familyId/students/:studentId/create-login` auto-creates with temporary password

**Status:** ⏳ Needs design decision (guidance: option (a) unblocks web immediately)

---

### M49 — Student Can't List Own Upcoming Classes

**Problem:** Student portal can list courses (M7) but not their own classes; join links come only from notifications.

**Evidence:** `scheduling/scheduling.controller.ts:289,308` (family and teacher timetables exist; student timetable missing)

**Requested change:** `GET /scheduling/students/me/timetable?from=ISO&to=ISO&tz=Europe/London` for `STUDENT` / `CHILD_STUDENT`, same row shape as family timetable.

**Status:** 🔴 Not yet implemented

---

### M50 — Mistakes Logged Before Class Starts

**Problem:** `POST /classes/:id/mistakes` accepts mistakes before `startsAt` and when no student has joined.

**Evidence:** `lessons/mistakes.service.ts:42–58` (checks only that student is enrolled; no time/attendance check)

**Requested change:** Refuse mistakes before class starts and when the student (or guardian for M48) hasn't joined. Keep staff overrides, audited.

**Status:** 🔴 Not yet implemented

---

### M54 🚨 — Admin Can't See Pending Teacher Profile Changes

**Problem:** Teachers can submit profile changes for approval, but admins have no list view or notification. The only admin control is an approval dialog with no "before/after" view.

**Evidence:**
- Teacher submits via `PATCH /teachers/me/profile` → written to `teacher.pendingProfileChanges` (`teachers/teachers.service.ts:445–492`)
- No read route returns pending changes
- No admin list shows teachers with staged changes
- Reported by product owner 2026-10-19

**Requested change:**
- `GET /teachers/profile-changes` (ADMIN, SUPER_ADMIN): returns `[{ profileId, teacherName, submittedAt, changes, current }]` (before/after view)
- Include `pendingProfileChanges` in `GET /teachers/:id` detail (admin view)
- Notify admins on submission; notify teacher on approve/reject

**Status:** 🔴 Not yet implemented; **critical for admin workflow**

---

### M55 — Classroom State Lacks Meeting Metadata

**Problem:** `GET /classroom/classes/:id/state` snapshot is missing:
- Course name (classroom says "Live classroom")
- Student list (can't title the class)
- Recording status and start time (appears only in teacher's session)
- Per-participant mic/camera state (tiles show initials instead of names)

**Evidence:** `classroom/classroom.service.ts` (classroom state retrieval)

**Requested change:** Add to snapshot:
```json
{
  "course": { "name": "Quran 101" },
  "students": [{ "id": "...", "displayName": "Yusuf" }],
  "recording": { "status": "RECORDING", "startedAt": "2026-10-28T14:30:00Z" },
  "participants": [
    { "userId": "...", "micOn": true, "camOn": false, ... }
  ]
}
```

**Status:** 🔴 Not yet implemented

---

### M69 — Signed-In Password Change

**Problem:** Account security has no way to change a password while signed in. Only `forgot-password` + email reset.

**Evidence:** `auth/auth.controller.ts:214,227` (only password reset routes exist)

**Requested change:** `POST /auth/change-password { currentPassword, newPassword }` 
- Requires re-auth (re-prove identity)
- Revokes other sessions
- Sends confirmation email

**Status:** 🔴 Not yet implemented

---

## 5. 🟡 OPEN: Requested (Lower Priority for v1, But Tracked)

| ID | Need | Evidence | Requested Change |
|:---|:---|:---|:---|
| M45 | Copy audition to profile | `teachers.service.ts:74` | On approval, copy `TeacherApplication.recitationAudioUrl` → `TeacherProfile.recitationSampleUrl` |
| M46 | Hifz page state engine | `hifz/hifz.controller.ts` (GET only) | PATCH route or rules engine updating page state, mistakes, intervals from lesson cards |
| M47 | Teacher view of student | `teachers/*` | `GET /teachers/me/students/:studentId` (family name, guardian names, timezone, consent flags) |
| M56 | Report a concern | `qa/cases.service.ts` | `POST /cases/report` (non-staff), `GET /cases/mine` (view own reports) |
| M57 | Profile-change outcome | `teachers.service.ts` | Store approve/reject reason; notify teacher; allow withdraw |
| M58 | Teacher-change workflow | `teachers.service.ts` | Guardian cancel, `resolutionNote`, family/teacher notifications |
| M59 | Notification read state | `notifications/notifications.service.ts` | Add `readAt`, mark read, unread count |
| M60 | Family self-enrol teacher change | `courses.service.ts` | `PATCH /enrolments/:id/teacher` + notifications |
| M61 | Trial booking notifications | `admissions.service.ts` | Notify admin, plan reminders, outcome applies placement |
| M62 | QA notifications | `qa.service.ts` | Notify teacher on review, supervisor on reply |
| M63 | Applicant emails + provisioning | `teachers.service.ts` | Email templates, account creation on approval |
| M64 | Audit FAQ changes | `settings.controller.ts` | `POST /faq` auditing |
| M65 | Rating comments | `lesson-cards.service.ts` | Comments on ratings, low-rating alert |
| M66 | Family ↔ academy messaging | `messaging.service.ts` | Teacher-initiated threads, support threads |
| M67 | Make-up credits | `scheduling.service.ts` | List and redeem |
| M68 | Lesson card state on timetable | `lesson-cards.service.ts` | Show state (DRAFT/SUBMITTED/etc) on parent/teacher timetable |
| M9 | Consent policy version | (hardcoded in web) | `GET /consent/policy/current` → `{ version, content, updatedAt }` |
| M14 | Availability in chosen timezone | `scheduling/scheduling.controller.ts` | Add `tz` param to `PUT /teachers/me/availability` |
| M16 | Video provider token | `classroom.service.ts` | Include media token in classroom state for real video provider |
| M17 | REST attendance, controls broadcast, layout event | `classroom.gateway.ts` | Extend REST API for attendance and controls |
| M19 | AI summary generation | `lessons.controller.ts` | `POST /lessons/:id/ai-summary` (not just approve) |
| M20 | Teacher unshared cards, supervisor edits logged | `lesson-cards.service.ts` | Show teacher's draft cards; log pre-lock edits |
| M28 | Case severity and state machine | `qa/cases.service.ts` | Add severity field; enforce forward-only states |
| M29 | Billing: payments + currency, idempotent subscribe | `billing.service.ts` | `GET /billing/family/payments`, block duplicate subscriptions |
| M32 | Messaging: student name, unread, cursor | `messaging.service.ts` | Include student name on guardian threads; unread counts; pagination |
| Q13 | Supervisor pre-lock edits logged | `lesson-cards.service.ts` | Add to audit trail |
| Q15 | Deep field validation | (client-side in web) | Validate `rubric`, `objectives`, `materials` structure |

---

## 6. ❓ Questions Needing Product Decision

| ID | Question | Impact |
|:---|:---|:---|
| Q9 | **Price periods:** USD 4900 reads monthly; PKR 1900000 reads annual. Confirm pricing rules per currency. | Billing display accuracy |
| M26 | **Public trial intake:** Rate limit (5/hour/IP + email)? hCaptcha token? Auto-create lead (CRM) but not family? | Public booking flow |

---

## 7. ⚠️ Blocked — Vendor/Product Decision Needed

| ID | Feature | Blocker | Status |
|:---|:---|:---|:---|
| M36 | Real payments | Stripe or other provider selected | Use fake adapter until decided |
| CLS-BE-03 | Real video (LiveKit) | Provider contract + credentials | Use fake video adapter |
| CLS-BE-01 | Licensed Quran text | Quran Foundation licence | Fallback to Quran.com API for Madani 15-line |
| M2 | Kids PIN login | New auth surface design | Deferred second release |

---

## 8. ⏸ Deferred — Intentionally Postponed (Second Release)

Tracked in this document for context; not open for this release:

| ID | Feature | Reason | Web interim |
|:---|:---|:---|:---|
| M22–M25, M31, M39, M41, Q1–Q2 | Admin lists, staff directory, FAQ moderation, unlink OAuth, examiner workspace, idempotent decorator | Second release scope | Tools take pasted IDs; examined pages show "coming soon" |
| M27 | User roles in admin search | Second release | Search works; role filter not shown |
| M35, M37, M38 | Hifz engine, AI coach, engagement, OAuth 2FA | Feature areas | Read-only Hifz map; coaches/certificates/engagement not shown |

---

## 9. 🧭 Workflow Audit Findings (2026-10-19, Updated)

Every "submit → review → outcome" flow traced through API and web. Full evidence in [`workflow-audit.md`](./workflow-audit.md).

High-priority gaps (must have for v1):

| ID | Workflow | Gap |
|:---|:---|:---|
| **M56** | Family reports concern (child safety) | `POST /cases/report` missing; child-safety policy promises report button |
| **M54 + M57** | Teacher profile approval | Admin list missing; approval flow incomplete |
| **M58** | Teacher change request | Guardian cancel, notifications to family/old/new teacher missing |
| **M63** | Applicant to teacher | Applicant emails, account creation on approval missing |
| **M61** | Trial booking | Admin notification, placement outcome, reminders missing |

All others in workflow-audit.md §G1–G16.

---

## 10. 📋 API Endpoints — Coverage Map

The web calls **170 of 174** API routes:

- ✅ **170 in use:** Auth, OAuth, 2FA, courses, timetables, classroom, lesson cards, messaging, notifications, etc.
- ⏸ **4 not called:** Provider webhooks (server-to-server: payments, video, WhatsApp)

Full endpoint map: [`api-coverage.md`](./api-coverage.md)

---

## 11. 🚀 Priority Order for Next Sprint

### Tier 1 — Critical for Web v1 (users can't progress without these)
1. ✅ **Fix build:** Rebuild shared package
2. **M48** — Child joins as student (unblocks classroom)
3. **M54** — Admin sees pending profile changes (unblocks teacher approval)
4. **M56** — Report concern endpoint (unblocks child-safety policy promise)

### Tier 2 — High value (complete core workflows)
5. **M49** — Student timetable
6. **M50** — Prevent early mistake logging
7. **M69** — Change password signed in
8. **M55** — Classroom metadata (course name, recording status)

### Tier 3 — Nice to have (second sprint)
- M45–M47, M57–M68 (see §5)

---

## 12. ✅ Verified — Local Setup (2026-10-28)

Test env fully functional:
- PostgreSQL on 5432 ✅
- Redis on 6379 ✅
- MinIO on 9000/9001 ✅
- MailHog on 8025 ✅
- API on 4000 ✅
- Web on 3000 ✅

All seeded accounts working. See [`backendrequirement.md` §7](./backendrequirement.md#7-local-development-environment-checked-2026-10-19) for details.

---

## 13. Key Contacts & History

- **Product:** [name] — pricing (Q9), trial intake (M26), video provider, payment provider, child safety flow
- **Backend lead:** [name]
- **Document history:**
  - v4.8.0 (2026-10-19): 14 defects fixed, verified
  - v4.9.0 (2026-10-28): Build issue identified, requirements reorganized, priority tier added

---

## Next: Review & Reply

Please reply per ID with:
- `FIXED <commit>` — what branch/PR this lands on
- `WONTFIX <reason>` — if intentionally deferred
- `QUESTION <answer>` — if product/product decision needed
- `TIMELINE <date>` — if you need a date
- Comment on the priority tier above if it doesn't match your plan

---

**Generated from:** `apps/web/docs/backend_requirements.md`  
**For:** Backend team, Product  
**Read first:** `progress-report.md` (web status), `api-coverage.md` (endpoint map), `workflow-audit.md` (workflow gaps)
