# Hifzoon — Backend Requirements & API Audit for Frontend Integration

**Document Version:** 1.0.0  
**Updated:** 2026-10-15  
**Author:** Frontend Engineering Team  
**Scope:** Integration between `apps/web` (Next.js) and `apps/api` (NestJS REST API `/api/v1`)

---

## 1. Executive Summary

This document specifies the current status of backend API integration with the frontend, audits existing working endpoints, and identifies missing or needed backend endpoints, schema enhancements, and edge cases discovered while connecting the live user interface.

The frontend is built with a **resilient hybrid data architecture**:
- Where backend endpoints exist and return data, the frontend displays live database records.
- Where endpoints are incomplete, unseeded, or return errors, the frontend gracefully falls back to structured mock data to prevent UI degradation.

---

## 2. Working Backend Endpoints (Verified Live)

The following endpoints are currently running, tested, and actively utilized by the web application:

| Endpoint | Method | Status | Seeded Records | Frontend Consumer |
| :--- | :---: | :---: | :---: | :--- |
| `/api/v1/courses` | `GET` | ✅ Working | 10 courses with levels & lessons | `/courses`, Curriculum Section, Book Trial |
| `/api/v1/courses/:codeOrId` | `GET` | ✅ Working | By ID / code | Course details & level viewer |
| `/api/v1/billing/plans` | `GET` | ✅ Working | 3 plans (Circle 3x, etc.) with 6 currencies | `/pricing`, Pricing Calculator |
| `/api/v1/faq` | `GET` | ✅ Working | 5 approved FAQs | FAQ Section across landing and pricing |
| `/api/v1/teachers/public` | `GET` | ✅ Working | 1 cleared teacher (Ustadh Bilal) | `/teachers`, Teacher directory |
| `/api/v1/teachers/public/:id` | `GET` | ✅ Working | Profile details | Teacher profile modals/drawers |
| `/api/v1/teachers/applications` | `POST` | ✅ Working | Accepts `SubmitApplicationDto` | `/apply-teacher` form submission |
| `/api/v1/auth/login` | `POST` | ✅ Working | JWT access token + refresh cookie | `/login` form |
| `/api/v1/auth/register` | `POST` | ✅ Working | Guardian & Student accounts | Register flow |
| `/api/v1/auth/me` | `GET` | ✅ Working | Authenticated user profile & roles | Navbar user badge & portal gate |
| `/api/v1/health/ready` | `GET` | ✅ Working | Checks PostgreSQL & Redis | Health monitoring |

---

## 3. High-Priority Backend Requirements & Gap Analysis

### 3.1. Public Trial Booking Endpoint (CRITICAL)
- **Current Situation**: The existing `POST /api/v1/trials` requires an existing `studentId`, `courseId`, and `startsAt`. It is designed as an internal/authenticated operation.
- **Problem**: On the public `/book-trial` page, prospective families are visitors who have **not yet registered** an account. Requiring a `studentId` blocks new parent acquisition.
- **Backend Requirement**: Create a public endpoint:
  ```http
  POST /api/v1/trials/public
  ```
  **Payload Schema**:
  ```json
  {
    "parentName": "Ayesha Khan",
    "parentEmail": "ayesha@example.com",
    "parentPhone": "+447700900123",
    "studentName": "Zaid Khan",
    "studentAge": 8,
    "genderPreference": "FEMALE",
    "courseType": "QAIDA",
    "preferredDays": ["SATURDAY", "SUNDAY"],
    "preferredTimeSlot": "MORNING",
    "timeZone": "Europe/London",
    "notes": "Beginner starting Arabic letters"
  }
  ```
  **Backend Behavior**:
  1. Creates or finds the CRM Lead (`LeadStatus.TRIAL_BOOKED`).
  2. Provisions a prospective family/student entity.
  3. Sends verification email / confirmation via `mailhog` / notification.
  4. Returns `{ data: { trialId, confirmationCode, scheduledAt } }`.

---

### 3.2. Public Lead / Contact Submission Endpoint
- **Current Situation**: `POST /api/v1/admin/crm/leads` is an admin-only route requiring `ADMIN` bearer token.
- **Problem**: Marketing landing pages have callback request forms, footer newsletters, and WhatsApp/assistant inquiry forms.
- **Backend Requirement**: Provide a public lead intake route:
  ```http
  POST /api/v1/leads
  ```
  Allowing visitors to submit inquiry details without authentication.

---

### 3.3. Teacher Profile Media & Seed Data Enhancement
- **Current Situation**: Only **1 teacher** (`Ustadh Bilal Rahman`) is seeded in `prisma/seed.ts` with cleared status (`cleared=true`).
- **Problems**:
  1. The `/teachers` directory looks sparse with only one card.
  2. Female parents specifically request female teachers (Ustadhas), but no cleared female teacher is currently seeded in the database.
  3. The `TeacherProfile` entity in Prisma has `photoUrl: String?`, but lacks explicit fields for `audioSampleUrl` (recitation audio sample) and `videoUrl`.
- **Backend Requirement**:
  1. Update `prisma/seed.ts` to seed at least **4 to 6 vetted teachers**:
     - 2 Senior Male Teachers (e.g. Hifz Specialist, Applied Tajweed)
     - 2 Female Teachers / Ustadhas (e.g. Early Years Qaida, Sister Tajweed)
     - 1 Arabic Language scholar
  2. Ensure `photoUrl` points to a reachable URL or local asset path.
  3. Include `audioSampleUrl` or expose it within qualifications/profile JSON.

---

### 3.4. Multi-Currency Plan Formatting & Course Mapping
- **Current Situation**: Plans returned by `/billing/plans` contain integer `amountMinor` (e.g. `6900` for `$69.00`).
- **Recommendation**:
  1. Ensure all 6 active currencies (`USD`, `GBP`, `CAD`, `AUD`, `AED`, `PKR`) have consistent price rows in the seed data.
  2. Consider adding a `recommendedPlanId` or `billingCode` to `Course` model to allow direct checkout links from course cards to specific subscription tiers.

---

### 3.5. Public Mushaf Preview Endpoints
- **Current Situation**: Mushaf endpoints (`/mushaf/pages/:layout/:page`) are implemented.
- **Frontend Need**: Ensure public read-only access to a sample of 3–5 pages (e.g. Surah Al-Fatihah, first page of Surah Al-Baqarah, Juz 30) for interactive demonstrations on the landing page without requiring a live WebRTC classroom token.

---

## 4. Summary Table of Action Items for Backend Team

| Priority | Feature / Route | Purpose | Target Milestone |
| :--- | :--- | :--- | :--- |
| 🔴 **P0** | `POST /api/v1/trials/public` | Public trial booking without prior authentication | Sprint 1 |
| 🔴 **P0** | Multi-teacher DB Seeding | Seed 4–6 teachers (Male & Female Ustadhas) with bios & ratings | Sprint 1 |
| 🟡 **P1** | `POST /api/v1/leads` | Public CRM lead submission from landing forms | Sprint 1 |
| 🟡 **P1** | Teacher Audio Sample Fields | Add recitation audio URL to teacher public profiles | Sprint 2 |
| 🟢 **P2** | Sample Mushaf Public Access | Allow unauthenticated preview of selected Mushaf pages | Sprint 2 |

---

*This document will be updated as the frontend and backend integration progresses.*
