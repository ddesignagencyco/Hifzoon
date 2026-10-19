# Hifzoon — API Coverage Report (Backend vs Web)

**Generated:** 2026-10-19 (snapshot; the generator script was removed).  
**Source of truth:** routes are read from `apps/api/src/**/*.controller.ts`; web usage from `apps/web/src/lib/api/**`.

## Summary

| | Count |
| :--- | ---: |
| Backend endpoints | 174 |
| Used by the web app | 170 (98%) |
| Not used by the web app | 4 |
| Web calls with no matching backend route | 0 |

### By module

| Module | Endpoints | Used | Coverage |
| :--- | ---: | ---: | ---: |
| admin | 6 | 6 | 100% |
| admissions | 13 | 13 | 100% |
| audit | 1 | 1 | 100% |
| auth | 14 | 14 | 100% |
| billing | 16 | 16 | 100% |
| classroom | 11 | 11 | 100% |
| consent | 8 | 8 | 100% |
| courses | 10 | 10 | 100% |
| crm | 7 | 7 | 100% |
| families | 9 | 9 | 100% |
| health | 2 | 2 | 100% |
| hifz | 3 | 3 | 100% |
| lessons | 13 | 13 | 100% |
| mushaf | 4 | 4 | 100% |
| notifications | 5 | 5 | 100% |
| parent-portal | 10 | 10 | 100% |
| qa | 13 | 13 | 100% |
| scheduling | 11 | 11 | 100% |
| settings | 2 | 2 | 100% |
| storage | 1 | 1 | 100% |
| teachers | 11 | 11 | 100% |
| webhooks | 4 | 0 | 0% |

Legend: ✅ called by the web API layer · ⬜ not called · ⚠️ known backend issue — the ID links to `backendrequirement.md` (security, broken or missing behaviour). "Access" is the `@Roles`/`@Public` declared on the route.

**7** of the 174 endpoints have a known backend issue that the UI works around or cannot fix.

## admin

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/admin/console/overview` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |
| ✅ | GET | `/api/v1/admin/console/search` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |
| ✅ | POST | `/api/v1/admin/console/teachers` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |
| ✅ | GET | `/api/v1/admin/console/teachers/:teacherId/readiness` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |
| ✅ | PATCH | `/api/v1/admin/console/users/:id/roles` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |
| ✅ | PATCH | `/api/v1/admin/console/users/:id/status` | SUPER_ADMIN | `modules/admin-console.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling` +5 |  |

## admissions

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/content` | Public | `modules/content-public.ts` | `/`, `/child-safety`, `/courses/[code]`, `/privacy` +4 |  |
| ✅ | GET | `/api/v1/content-admin` | ADMIN, SUPER_ADMIN | `modules/cms-admin.ts` | `/admin/content` |  |
| ✅ | POST | `/api/v1/content-admin` | ADMIN, SUPER_ADMIN | `modules/cms-admin.ts` | `/admin/content` |  |
| ✅ | DELETE | `/api/v1/content-admin/:id` | ADMIN, SUPER_ADMIN | `modules/cms-admin.ts` | `/admin/content` |  |
| ✅ | GET | `/api/v1/content/:slug` | Public | `modules/content-public.ts` | `/`, `/child-safety`, `/courses/[code]`, `/privacy` +4 |  |
| ✅ | GET | `/api/v1/faq` | Public | `client.ts`<br>`modules/cms-admin.ts`<br>`modules/content-public.ts` | `/`, `/admin/content`, `/child-safety`, `/courses/[code]` +5 |  |
| ✅ | POST | `/api/v1/faq` | Public | `modules/content-public.ts` | `/`, `/child-safety`, `/courses/[code]`, `/privacy` +4 |  |
| ✅ | POST | `/api/v1/faq-admin/:id/moderate` | ADMIN, SUPER_ADMIN | `modules/cms-admin.ts` | `/admin/content` |  |
| ✅ | GET | `/api/v1/teacher-changes` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/admissions-admin.ts`<br>`modules/admissions-guardian.ts` | `/admin`, `/admin/teacher-changes`, `/admin/trials`, `/parent` +1 |  |
| ✅ | POST | `/api/v1/teacher-changes` | GUARDIAN | `modules/admissions-guardian.ts` | `/parent`, `/parent/children/[studentId]` |  |
| ✅ | POST | `/api/v1/teacher-changes/:id/resolve` | ADMIN, SUPER_ADMIN | `modules/admissions-admin.ts` | `/admin`, `/admin/teacher-changes`, `/admin/trials` |  |
| ✅ | POST | `/api/v1/trials` | ADMIN, SUPER_ADMIN | `modules/admissions-admin.ts` | `/admin`, `/admin/teacher-changes`, `/admin/trials` |  |
| ✅ | POST | `/api/v1/trials/:classId/outcome` | ADMIN, SUPER_ADMIN | `modules/admissions-admin.ts` | `/admin`, `/admin/teacher-changes`, `/admin/trials` |  |

## audit

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/admin/audit` | SUPER_ADMIN | `modules/audit.ts` | `/admin/audit`, `/admin/billing`, `/admin/payroll` |  |

## auth

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/auth/forgot-password` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/login` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/logout` | Any signed-in | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | GET | `/api/v1/auth/me` | Any signed-in | `client.ts`<br>`modules/student.ts` | `/student` |  |
| ✅ | POST | `/api/v1/auth/oauth/:provider/callback` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | GET | `/api/v1/auth/oauth/:provider/start` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | GET | `/api/v1/auth/oauth/providers` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/refresh` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/register` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/reset-password` | Public | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | GET | `/api/v1/auth/sessions` | Any signed-in | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/two-factor/confirm` | Any signed-in | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/two-factor/disable` | Any signed-in | `client.ts` | auth / site-wide (`client.ts`) |  |
| ✅ | POST | `/api/v1/auth/two-factor/setup` | Any signed-in | `client.ts` | auth / site-wide (`client.ts`) |  |

## billing

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/admin/billing/dunning/run` | SUPER_ADMIN | `modules/billing-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | POST | `/api/v1/admin/billing/invoices` | ADMIN, SUPER_ADMIN | `modules/billing-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | POST | `/api/v1/admin/billing/refunds` | ADMIN, SUPER_ADMIN | `modules/billing-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | POST | `/api/v1/billing/checkout` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | GET | `/api/v1/billing/family` | Any signed-in | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | GET | `/api/v1/billing/plans` | Public | `client.ts`<br>`modules/admissions-admin.ts`<br>`modules/billing-admin.ts`<br>`modules/billing-family.ts` | `/admin`, `/admin/billing`, `/admin/payroll`, `/admin/teacher-changes` +4 | ⚠️ Q9 |
| ✅ | POST | `/api/v1/billing/subscribe` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | POST | `/api/v1/billing/subscriptions/:id/cancel` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | POST | `/api/v1/billing/subscriptions/:id/pause` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | POST | `/api/v1/billing/subscriptions/:id/resume` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/billing-family.ts` | `/parent/billing`, `/parent/billing/checkout/cancelled`, `/parent/billing/checkout/success` |  |
| ✅ | POST | `/api/v1/payroll/entries/:id/paid` | SUPER_ADMIN | `modules/payroll-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | GET | `/api/v1/payroll/my-payslips` | TEACHER | `modules/payroll-teacher.ts` | `/teacher/payslips` |  |
| ✅ | POST | `/api/v1/payroll/periods` | SUPER_ADMIN | `modules/payroll-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | POST | `/api/v1/payroll/periods/:id/calculate` | SUPER_ADMIN | `modules/payroll-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | GET | `/api/v1/payroll/periods/:id/report` | ADMIN, SUPER_ADMIN | `modules/payroll-admin.ts` | `/admin/billing`, `/admin/payroll` |  |
| ✅ | GET | `/api/v1/payroll/rates` | ADMIN, SUPER_ADMIN | `modules/payroll-admin.ts` | `/admin/billing`, `/admin/payroll` |  |

## classroom

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/classroom/bandwidth-advice` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/classroom/classes/:classId/attendance` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/attendance/close` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/highlight` | TEACHER | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/layout` | TEACHER | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/page` | TEACHER | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/classroom/classes/:classId/recording/consent` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/recording/start` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/classroom/classes/:classId/state` | Any signed-in | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/tajweed` | TEACHER | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classroom/classes/:classId/token` | Any signed-in | `modules/classroom.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/teacher/classroom/[classId]` +2 |  |

## consent

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/consent/families/:familyId/data-requests` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | POST | `/api/v1/consent/families/:familyId/data-requests` | GUARDIAN | `modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | GET | `/api/v1/consent/families/:familyId/privacy-summary` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | POST | `/api/v1/consent/families/:familyId/verify/confirm` | GUARDIAN | `client.ts`<br>`modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | POST | `/api/v1/consent/families/:familyId/verify/start` | GUARDIAN | `client.ts`<br>`modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | GET | `/api/v1/consent/students/:studentId` | GUARDIAN, TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/consent.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/children`, `/parent/children/[studentId]` +4 |  |
| ✅ | POST | `/api/v1/consent/students/:studentId/grant` | GUARDIAN | `client.ts`<br>`modules/consent.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/children`, `/parent/children/[studentId]` +4 |  |
| ✅ | POST | `/api/v1/consent/students/:studentId/withdraw` | GUARDIAN | `modules/consent.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |

## courses

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/courses` | Public | `client.ts`<br>`modules/content-public.ts`<br>`modules/courses-admin.ts`<br>`modules/enrolments.ts`<br>`modules/scheduling-admin.ts` | `/`, `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]` +16 |  |
| ✅ | POST | `/api/v1/courses` | ADMIN, SUPER_ADMIN | `modules/courses-admin.ts` | `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payroll` |  |
| ✅ | GET | `/api/v1/courses/:codeOrId` | Public | `modules/content-public.ts`<br>`modules/courses-admin.ts` | `/`, `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]` +8 |  |
| ✅ | POST | `/api/v1/courses/:courseId/levels` | ADMIN, SUPER_ADMIN | `modules/courses-admin.ts` | `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payroll` |  |
| ✅ | POST | `/api/v1/courses/enrolments` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/courses-admin.ts`<br>`modules/enrolments.ts` | `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payroll` +4 |  |
| ✅ | PATCH | `/api/v1/courses/enrolments/:enrolmentId/lesson-position` | TEACHER, ADMIN, SUPER_ADMIN | `modules/courses-admin.ts`<br>`modules/enrolments-teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +34 |  |
| ✅ | GET | `/api/v1/courses/enrolments/:enrolmentId/next-lesson` | GUARDIAN, TEACHER, STUDENT, ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/enrolments-teacher.ts`<br>`modules/enrolments.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +38 |  |
| ✅ | PATCH | `/api/v1/courses/enrolments/:enrolmentId/status` | GUARDIAN, ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/courses-admin.ts`<br>`modules/enrolments.ts` | `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payroll` +4 |  |
| ✅ | GET | `/api/v1/courses/enrolments/list` | GUARDIAN, TEACHER, STUDENT, ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/courses-admin.ts`<br>`modules/enrolments-teacher.ts`<br>`modules/enrolments.ts`<br>`modules/messaging.ts`<br>`modules/scheduling-admin.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +46 |  |
| ✅ | POST | `/api/v1/courses/levels/:levelId/lessons` | ADMIN, SUPER_ADMIN | `modules/courses-admin.ts` | `/admin/content`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/payroll` |  |

## crm

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/admin/crm/leads` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | POST | `/api/v1/admin/crm/leads` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | PATCH | `/api/v1/admin/crm/leads/:id/status` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | GET | `/api/v1/admin/crm/pipeline` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | GET | `/api/v1/admin/crm/tasks` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | POST | `/api/v1/admin/crm/tasks` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |
| ✅ | POST | `/api/v1/admin/crm/tasks/:id/complete` | ADMIN, SUPER_ADMIN | `modules/crm.ts` | `/admin`, `/admin/courses`, `/admin/courses/[courseId]`, `/admin/crm` +5 |  |

## families

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/families` | GUARDIAN | `client.ts`<br>`modules/billing-family.ts`<br>`modules/families.ts`<br>`modules/messaging.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/billing`, `/parent/billing/checkout/cancelled` +11 |  |
| ✅ | POST | `/api/v1/families` | GUARDIAN | `client.ts`<br>`modules/families.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/children`, `/parent/children/[studentId]` +4 |  |
| ✅ | GET | `/api/v1/families/:familyId` | Any signed-in | `modules/families.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | PATCH | `/api/v1/families/:familyId` | GUARDIAN | `modules/families.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | GET | `/api/v1/families/:familyId/guardians` | GUARDIAN | `modules/families.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | POST | `/api/v1/families/:familyId/guardians` | GUARDIAN | `modules/families.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |
| ✅ | GET | `/api/v1/families/:familyId/students` | GUARDIAN | `modules/families.ts`<br>`modules/messaging.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/children`, `/parent/children/[studentId]` +8 |  |
| ✅ | POST | `/api/v1/families/:familyId/students` | GUARDIAN | `client.ts`<br>`modules/families.ts`<br>`modules/public-booking.ts` | `/book-trial`, `/parent`, `/parent/children`, `/parent/children/[studentId]` +4 |  |
| ✅ | PATCH | `/api/v1/families/students/:studentId` | GUARDIAN | `modules/families.ts` | `/parent`, `/parent/children`, `/parent/children/[studentId]`, `/parent/privacy` +1 |  |

## health

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/health/live` | Public | `modules/health.ts` | `/admin` |  |
| ✅ | GET | `/api/v1/health/ready` | Public | `modules/health.ts` | `/admin` |  |

## hifz

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/hifz/students/:studentId/pages` | Any signed-in | `modules/hifz.ts` | `/parent/children/[studentId]`, `/student`, `/teacher/students/[studentId]` |  |
| ✅ | GET | `/api/v1/hifz/students/:studentId/pages/:pageNumber` | Any signed-in | `modules/hifz.ts` | `/parent/children/[studentId]`, `/student`, `/teacher/students/[studentId]` |  |
| ✅ | POST | `/api/v1/hifz/students/:studentId/pages/initialize` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/hifz.ts` | `/parent/children/[studentId]`, `/student`, `/teacher/students/[studentId]` |  |

## lessons

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/classes/:classId/lesson-card` | TEACHER | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/classes/:classId/lesson-card/prefill` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/classes/:classId/mistakes` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/classes/:classId/mistakes` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/lesson-cards/:lessonCardId` | TEACHER | `modules/enrolments-teacher.ts`<br>`modules/lessons-read.ts`<br>`modules/lessons.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +40 |  |
| ✅ | PATCH | `/api/v1/lesson-cards/:lessonCardId` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | PATCH | `/api/v1/lesson-cards/:lessonCardId/ai-draft` | TEACHER | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/lesson-cards/:lessonCardId/ai-draft/approve` | TEACHER | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/lesson-cards/:lessonCardId/edit-log` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/mistakes/:mistakeId/confirm` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | POST | `/api/v1/mistakes/:mistakeId/dismiss` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons.ts` | `/parent/classroom/[classId]`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]`, `/teacher/classroom/[classId]` +2 |  |
| ✅ | GET | `/api/v1/students/:studentId/lesson-cards` | Any signed-in | `modules/enrolments-teacher.ts`<br>`modules/lessons-read.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +36 |  |
| ✅ | GET | `/api/v1/students/:studentId/mistakes` | TEACHER, SUPERVISOR, ADMIN | `modules/lessons-read.ts`<br>`modules/lessons.ts` | `/parent`, `/parent/children/[studentId]`, `/parent/classroom/[classId]`, `/student/classroom/[classId]` +5 |  |

## mushaf

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/mushaf/ayah-words` | Any signed-in | `modules/mushaf.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]` +5 |  |
| ✅ | DELETE | `/api/v1/mushaf/cache` | SUPER_ADMIN | `modules/settings.ts` | `/admin/settings` | ⚠️ Q2 |
| ✅ | GET | `/api/v1/mushaf/layouts` | Public | `modules/mushaf.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]` +5 |  |
| ✅ | GET | `/api/v1/mushaf/pages/:layout/:page` | Any signed-in | `modules/mushaf.ts` | `/parent/classroom/[classId]`, `/parent/timetable`, `/student/classroom/[classId]`, `/supervisor/lesson-cards/[lessonCardId]` +5 |  |

## notifications

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/notifications` | Any signed-in | `modules/notifications.ts`<br>`modules/student.ts` | `/admin/users`, `/parent/notifications`, `/student`, `/student/notifications` +1 |  |
| ✅ | POST | `/api/v1/notifications/devices` | Any signed-in | `modules/notifications.ts` | `/admin/users`, `/parent/notifications`, `/student/notifications`, `/teacher/notifications` |  |
| ✅ | GET | `/api/v1/notifications/preferences` | Any signed-in | `modules/notifications.ts` | `/admin/users`, `/parent/notifications`, `/student/notifications`, `/teacher/notifications` |  |
| ✅ | PATCH | `/api/v1/notifications/preferences` | Any signed-in | `modules/notifications.ts` | `/admin/users`, `/parent/notifications`, `/student/notifications`, `/teacher/notifications` |  |
| ✅ | GET | `/api/v1/notifications/preferences/:userId` | ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/notifications.ts` | `/admin/users`, `/parent/notifications`, `/student/notifications`, `/teacher/notifications` |  |

## parent-portal

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/parent/students/:studentId/charts` | GUARDIAN | `modules/parent-progress.ts` | `/parent`, `/parent/children/[studentId]`, `/teacher/students/[studentId]` |  |
| ✅ | GET | `/api/v1/parent/students/:studentId/dashboard` | GUARDIAN | `modules/parent-progress.ts` | `/parent`, `/parent/children/[studentId]`, `/teacher/students/[studentId]` |  |
| ✅ | GET | `/api/v1/parent/students/:studentId/report-card` | GUARDIAN | `modules/parent-progress.ts` | `/parent`, `/parent/children/[studentId]`, `/teacher/students/[studentId]` |  |
| ✅ | GET | `/api/v1/parent/threads` | GUARDIAN | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | POST | `/api/v1/parent/threads` | GUARDIAN | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | GET | `/api/v1/parent/threads/:id` | GUARDIAN | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | POST | `/api/v1/parent/threads/:id/messages` | GUARDIAN | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | GET | `/api/v1/teacher/threads` | TEACHER | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | GET | `/api/v1/teacher/threads/:id` | TEACHER | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |
| ✅ | POST | `/api/v1/teacher/threads/:id/messages` | TEACHER | `modules/messaging.ts` | `/parent/messages`, `/parent/messages/[threadId]`, `/teacher/messages`, `/teacher/messages/[threadId]` |  |

## qa

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/cases` | SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | POST | `/api/v1/cases` | SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | GET | `/api/v1/cases/:id` | SAFEGUARDING_LEAD, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | POST | `/api/v1/cases/:id/assign` | SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | POST | `/api/v1/cases/:id/notes` | SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | POST | `/api/v1/cases/:id/transition` | SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | GET | `/api/v1/cases/sla` | SAFEGUARDING_LEAD, SUPER_ADMIN | `modules/cases.ts` | `/safeguarding`, `/safeguarding/cases/[id]`, `/safeguarding/sla`, `/supervisor` +2 |  |
| ✅ | POST | `/api/v1/qa/classes/:classId/review` | SUPERVISOR, SUPER_ADMIN | `modules/qa.ts` | `/safeguarding/cases/[id]`, `/supervisor`, `/supervisor/cases/[id]`, `/supervisor/reviews` +3 |  |
| ✅ | POST | `/api/v1/qa/reviews/:id/reply` | TEACHER | `modules/teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +34 |  |
| ✅ | POST | `/api/v1/qa/teachers/:teacherId/sample` | SUPER_ADMIN | `modules/qa.ts` | `/safeguarding/cases/[id]`, `/supervisor`, `/supervisor/cases/[id]`, `/supervisor/reviews` +3 |  |
| ✅ | GET | `/api/v1/qa/teachers/:teacherId/scorecard` | SUPERVISOR, SUPER_ADMIN | `modules/qa.ts` | `/safeguarding/cases/[id]`, `/supervisor`, `/supervisor/cases/[id]`, `/supervisor/reviews` +3 |  |
| ✅ | POST | `/api/v1/quality/classes/:classId/rating` | GUARDIAN | `modules/quality-rating.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +29 |  |
| ✅ | GET | `/api/v1/quality/teachers/:teacherId/rating` | Public | `modules/qa.ts`<br>`modules/quality-rating.ts`<br>`modules/teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +43 |  |

## scheduling

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/scheduling/book` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/public-booking.ts`<br>`modules/scheduling-family.ts` | `/book-trial`, `/parent/children/[studentId]`, `/parent/timetable`, `/supervisor/reviews` +1 | ⚠️ Q25 |
| ✅ | POST | `/api/v1/scheduling/classes/:classId/cancel` | GUARDIAN, TEACHER, ADMIN, SUPER_ADMIN | `modules/scheduling-family.ts`<br>`modules/teacher-schedule.ts` | `/parent/children/[studentId]`, `/parent/timetable`, `/teacher`, `/teacher/availability` +3 |  |
| ✅ | POST | `/api/v1/scheduling/classes/:classId/reschedule` | GUARDIAN, TEACHER, ADMIN, SUPER_ADMIN | `modules/scheduling-family.ts`<br>`modules/teacher-schedule.ts` | `/parent/children/[studentId]`, `/parent/timetable`, `/teacher`, `/teacher/availability` +3 |  |
| ✅ | GET | `/api/v1/scheduling/families/:familyId/timetable` | GUARDIAN, ADMIN, SUPER_ADMIN | `modules/scheduling-family.ts` | `/parent/children/[studentId]`, `/parent/timetable` | ⚠️ B29 |
| ✅ | GET | `/api/v1/scheduling/matching/:studentId` | ADMIN, SUPER_ADMIN, SUPERVISOR, TEACHER | `modules/scheduling-admin.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +2 |  |
| ✅ | GET | `/api/v1/scheduling/open-slots` | Public | `modules/public-booking.ts`<br>`modules/scheduling-admin.ts`<br>`modules/scheduling-family.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +7 |  |
| ✅ | POST | `/api/v1/scheduling/schedules` | ADMIN, SUPER_ADMIN | `modules/scheduling-admin.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +2 |  |
| ✅ | GET | `/api/v1/scheduling/schedules/:scheduleId` | GUARDIAN, TEACHER, ADMIN, SUPER_ADMIN | `modules/scheduling-admin.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +2 |  |
| ✅ | GET | `/api/v1/scheduling/teachers/:teacherId/availability` | TEACHER, ADMIN, SUPER_ADMIN | `modules/scheduling-admin.ts`<br>`modules/teacher-schedule.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +7 |  |
| ✅ | PUT | `/api/v1/scheduling/teachers/:teacherId/availability` | TEACHER, ADMIN, SUPER_ADMIN | `modules/teacher-schedule.ts` | `/teacher`, `/teacher/availability`, `/teacher/classes/[classId]/brief`, `/teacher/students` +1 |  |
| ✅ | GET | `/api/v1/scheduling/teachers/:teacherId/timetable` | TEACHER, SUPERVISOR, ADMIN, SUPER_ADMIN | `modules/qa.ts`<br>`modules/scheduling-admin.ts`<br>`modules/teacher-schedule.ts` | `/admin/courses`, `/admin/courses/[courseId]`, `/admin/scheduling`, `/admin/teacher-changes` +14 |  |

## settings

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | GET | `/api/v1/admin/settings` | ADMIN, SUPER_ADMIN | `modules/settings.ts` | `/admin/settings` |  |
| ✅ | PATCH | `/api/v1/admin/settings` | SUPER_ADMIN | `modules/settings.ts` | `/admin/settings` |  |

## storage

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/uploads/presign` | Public | `modules/uploads.ts` | `/apply-teacher` | ⚠️ B30 |

## teachers

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ✅ | POST | `/api/v1/teachers/applications` | Public | `client.ts` | auth / site-wide (`client.ts`) | ⚠️ B32 |
| ✅ | GET | `/api/v1/teachers/applications/:id` | ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/teacher-hiring.ts` | `/admin`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/supervisor/applications` +1 | ⚠️ B31 |
| ✅ | POST | `/api/v1/teachers/applications/:id/steps` | ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/teacher-hiring.ts` | `/admin`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/supervisor/applications` +1 |  |
| ✅ | GET | `/api/v1/teachers/applications/list` | ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/teacher-hiring.ts` | `/admin`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/supervisor/applications` +1 |  |
| ✅ | GET | `/api/v1/teachers/me` | TEACHER | `modules/teacher-me.ts` | `/teacher`, `/teacher/availability`, `/teacher/classes/[classId]/brief`, `/teacher/payslips` +4 |  |
| ✅ | GET | `/api/v1/teachers/me/classes/:classId/brief` | TEACHER, SUPERVISOR, ADMIN | `modules/teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +34 |  |
| ✅ | PATCH | `/api/v1/teachers/me/profile` | TEACHER | `modules/teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +34 |  |
| ✅ | POST | `/api/v1/teachers/profiles/:profileId/review` | ADMIN, SUPER_ADMIN | `modules/teacher-hiring.ts` | `/admin`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/supervisor/applications` +1 |  |
| ✅ | POST | `/api/v1/teachers/profiles/:profileId/safeguarding-training` | ADMIN, SUPER_ADMIN, SUPERVISOR | `modules/teacher-hiring.ts` | `/admin`, `/admin/teachers`, `/admin/teachers/applications/[id]`, `/supervisor/applications` +1 |  |
| ✅ | GET | `/api/v1/teachers/public` | Public | `client.ts`<br>`modules/public-booking.ts`<br>`modules/qa.ts` | `/book-trial`, `/safeguarding/cases/[id]`, `/supervisor`, `/supervisor/cases/[id]` +4 |  |
| ✅ | GET | `/api/v1/teachers/public/:userId` | Public | `modules/teacher.ts` | `/`, `/account/security`, `/admin/audit`, `/admin/billing` +34 |  |

## webhooks

| | Method | Endpoint | Access | Web client | Screens using this module | Backend issue |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| ⬜ | POST | `/api/v1/webhooks/payments` | Public | — | — |  |
| ⬜ | POST | `/api/v1/webhooks/video` | Public | — | — |  |
| ⬜ | GET | `/api/v1/webhooks/whatsapp` | Public | — | — |  |
| ⬜ | POST | `/api/v1/webhooks/whatsapp` | Public | — | — |  |

## Not used by the web app

| Method | Endpoint | Access | Why |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/webhooks/payments` | Public | Payment provider callback (signed), server-to-server |
| POST | `/api/v1/webhooks/video` | Public | Video provider callback (signed), server-to-server |
| POST | `/api/v1/webhooks/whatsapp` | Public | WhatsApp Cloud delivery receipts (signed), server-to-server |
| GET | `/api/v1/webhooks/whatsapp` | Public | WhatsApp Cloud delivery receipts (signed), server-to-server |

## Web calls with no matching backend route

None — every web call maps to a real backend route.
