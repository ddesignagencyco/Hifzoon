# Hifzoon Web — Open Backend Requirements

**Updated:** 2026-10-29 · **Replaces:** `backend_requirements.md` v4.9.0 (merged here, then removed)
**Scope:** Only what the web app still needs from the backend or product. Each item was re-checked against the backend code on `feat-frontend-ui` (on top of `dev` 968aac5). Completed work and endpoint wiring are in [`api-coverage.md`](./api-coverage.md).

Paths are relative to `apps/api/src/modules/`.

**Reply per ID with** `FIXED <commit>`, `WONTFIX <reason>`, `QUESTION <answer>` or `TIMELINE <date>`.

---

## 1. Before deploying

Run the four Oct 2026 migrations against every real database (`npx prisma migrate deploy`). They are applied in the local Docker database.

- `20261028000000_teacher_leave_and_availability_month`
- `20261028000100_lead_geolocation`
- `20261028000200_teacher_tiers_and_plan_tier`
- `20261028000300_trial_multi_session`

## 2. New asks from the Oct 2026 wiring (priority)

| ID | Problem | Evidence | Requested change | Web workaround today |
|:--|:--|:--|:--|:--|
| **R1** | Saving weekly hours deletes the month-by-month hours | `scheduling/scheduling.service.ts` `setAvailability` runs `availabilitySlot.deleteMany({ where: { teacherId } })`, which also removes rows written by `setAvailabilityForMonth`. `GET …/availability` returns both kinds mixed together. | Limit the weekly delete and read to rows that are not month-bounded. Confirm how open-slot search combines a month's hours with the weekly pattern. | The weekly editor hides month rows and warns the teacher before saving. |
| **R5** | Booking ignores the month a slot belongs to | `scheduling/scheduling.service.ts` `findOpenSlots` selects `availability: { weekday, startTime, endTime, timeZone }` without `effectiveFrom`/`effectiveTo` and never filters by date | Only offer a month-scoped slot on dates inside its month (and weekly rows inside their effective range) | None possible in the web; the teacher page is now monthly-only, so this is the main blocker for correct booking. |
| **R6** | Open-slot search returns the same teacher and start time more than once | `GET /scheduling/open-slots` (Hifz, 29 Oct–12 Nov, Europe/London) returned duplicate rows, e.g. teacher `01a18252-…` at `2026-10-30T16:00:00Z` twice. Cause: `findOpenSlots` builds slots from every `availability_slot` row, and this teacher has both a month row (Oct, Mon–Fri) and an open-ended weekly row (Mon–Fri) covering the same hours. React reported duplicate keys. | De-duplicate by teacher + start time in `findOpenSlots` (and fix R5 so overlapping rows don't both apply) | The booking picker merges identical teacher+time rows before showing them. |
| **R7** | Students and guardians can't read a class's mistakes | `lessons/lessons.controller.ts` `GET classes/:classId/mistakes` is `@Roles(TEACHER, SUPERVISOR, ADMIN)` | Let a class's own student and guardians read the mistakes for their child | The room shows mistakes as the teacher marks them (`mistake:marked`), but anyone who joins late misses the earlier ones. |
| **R8** | ~~Real audio/video can't connect: the browser never gets the LiveKit token~~ **Done in this branch, please review** | `classroom/classroom.service.ts` now returns `videoToken: providerToken.token`; `docker-compose.yml` LiveKit sets `rtc.node_ip: 127.0.0.1` for local use. Both edits were made by the web team on the product owner's request. | Review and keep. Production must use LiveKit Cloud or a public LiveKit (`LIVEKIT_URL`/`LIVEKIT_PUBLIC_URL` = `wss://…`). The compose `environment:` block overrides `apps/api/.env`, so set them in the root `.env` too. | Web is wired: video, audio, reconnect with a fresh token, audio unlock, device picker, quality bars. |
| **R9** | A guardian joined as their child shows under the guardian's name | `classroom.service.ts` sets a STUDENT participant's `displayName` from `user.name` (the guardian), and the snapshot participant has no `studentId` | Name the participant after the child (or add `studentId` to snapshot participants) | The web shows the class's student name, but only in one-to-one classes. In a circle it can't tell which child is which. |
| **R11** | A trial result can't be corrected | `admissions/admissions.service.ts` `recordTrialOutcome` returns the existing outcome (`alreadyRecorded`) and ignores the new level and plan. One outcome covers the whole trial package, so recording another class of the same package also returns the first. | `PATCH /trials/:classId/outcome` for level, plan and notes (admin, audited) | The page says plainly that a saved result can't change and shows what was saved. |
| **R12** | Parent never sees the trial result or recommended plan | Trial outcomes are admin-only, and `subscribeToken` has no family-facing route. `POST /billing/subscribe` takes `trialOutcomeId`, which the family can't read. | A guardian read of their child's trial outcome (level, recommended plan, teacher, `trialOutcomeId`), or a `GET /billing/offer/:subscribeToken` | The family picks any plan on Billing. The admin page hides the raw token under "Technical reference". |
| **R13** | Only staff can set the regular weekly classes | `POST /scheduling/schedules` is `@Roles(ADMIN, SUPER_ADMIN)` | Let a guardian with a paid subscription choose weekly times with the trial teacher (count = plan's classes per week), or save preferred times for staff to confirm | Staff create the schedule in Admin → Scheduling. |
| **R14** | Teacher matching still reads weekly availability | `scheduling/scheduling.service.ts` `matchTeachers` selects `availability: { weekday }` with no month filter; teachers now set hours by month | Use the current and next month's rows for `availableWeekdays` | None. |
| **R2** | Admin can't read a teacher's tier | `admin/admin-console.service.ts` `teacherReadiness` has no `tier`. Only `GET /teachers/public` carries it. | Add `tier` to readiness (or an admin teacher read). | Read from the public list, so the tier can't be shown for teachers who aren't public yet. |
| **R3** | Admin price list costs one call per plan per currency | `GET /billing/plans/:id/price?currency=` is the only price read. | An admin-only route that returns every price of every plan. | 15 calls for 3 plans. |
| **R4** | Spec says `/billing/plans` needs auth | The OpenAPI document marks it `security: bearer`, but the controller is `@Public()`. | Remove the bearer annotation from the spec. | None needed. |

## 3. Still open from earlier handoffs

Checked against the code. Each item has no endpoint in the live spec, or no matching logic in the module.

| ID | Need | Evidence | Requested change |
|:--|:--|:--|:--|
| M45 | Teacher's audition becomes their profile sample | `teachers/teachers.service.ts`: approval never copies `TeacherApplication.recitationAudioUrl` to `TeacherProfile.recitationSampleUrl` | Copy it on approval |
| M46 | Hifz page-state engine | Only `GET …/pages`, `GET …/pages/:n` and `POST …/initialize` exist | Update page state and revision intervals from lesson cards (or a PATCH route) |
| M58 | Teacher-change workflow | `admissions/admissions.controller.ts` `resolve` is ADMIN/SUPER_ADMIN only; there is no `resolutionNote` | Guardian can cancel their own request; resolution note; notify family, old teacher and new teacher |
| M59 | Notification read state | No `readAt` on notifications; no mark-read route | `readAt`, mark read, unread count |
| M60 | Family-requested teacher change on an enrolment | No `PATCH /courses/enrolments/:id/teacher` | Route plus notifications |
| M61 | Trial booking notifications | `admissions/admissions.service.ts` queues no notification | Notify admin, plan reminders, apply placement from the outcome |
| M62 | QA notifications | `qa/qa.service.ts` queues no notification | Notify the teacher on review, and the supervisor on reply |
| M63 | Applicant emails and provisioning | `teachers/teachers.service.ts` queues no notification | Status emails, and an account created on approval |
| M64 | Audit public FAQ submissions | `POST /faq` has no `@Audit` (moderation already does) | Audit submissions |
| M65 | Rating comments and low-rating alert | No alert logic found in `qa/` | Store comments, and alert on low ratings |
| M66 | Teacher- and academy-initiated threads | `/teacher/threads` has no create route | Teacher opens a thread; support threads |
| M67 | Make-up credits | Credits are earned on cancel; no list or redeem route | List and redeem |
| M68 | Lesson card state on timetables | Timetable rows carry no lesson card | Include card state (draft/submitted) |
| M19 | Generate the AI summary | Only `PATCH …/ai-draft` and `POST …/ai-draft/approve` exist | `POST /lesson-cards/:id/ai-summary` |
| M28 | Case severity and state machine | No `severity` on cases | Add severity; enforce forward-only states |
| M29 | Family payments and duplicate subscribe | No `GET /billing/family/payments`; no duplicate-subscription guard found | Payments list; refuse a second live subscription to the same plan |
| M32 | Messaging extras | Mark-read and unread badges exist; student name and pagination not confirmed | Student name on guardian threads; cursor pagination |

Not re-checked this pass (carried over as listed in v4.9): **M16** video token in classroom state (re-check now that LiveKit is merged), **M17** controls broadcast, **M20** teacher's unshared cards, **Q13** supervisor pre-lock edits logged, **Q15** deep validation of rubric, objectives and materials (validated client-side today).

## 4. Waiting on a product decision

| ID | Question |
|:--|:--|
| **Q9** | Pricing periods per currency: USD 4900 reads as monthly, PKR 1900000 reads as annual. Confirm the rule. |
| **M26** | Public trial intake: rate limit (e.g. 5/hour per IP and email), captcha, and whether to create a CRM lead without a family. |

## 5. Blocked on vendor or licence

| ID | Feature | Status now |
|:--|:--|:--|
| M36 | Real payments | Stripe adapter is merged (`PAYMENT_PROVIDER=stripe`). Needs production keys and webhook secret. |
| CLS-BE-03 | Real video | LiveKit adapter and service are merged (`VIDEO_PROVIDER=livekit`). Needs production credentials. |
| CLS-BE-01 | Licensed Quran text | Waiting on the Quran Foundation licence. |

## 6. Deferred to the second release

M2 (kids PIN login), M22–M25, M27, M30, M31, M35, M37–M39, M41, M44, Q1, Q2, Q4, Q5, Q8, Q12, Q14, Q20, Q22, Q23

## 7. Closed since v4.9.0 (for the record)

Built in the backend and wired in the web on 2026-10-29: **M9**, **M14**, **M47**, **M48**, **M49**, **M50** (`lessons/mistakes.service.ts` refuses mistakes before the start and before the student side joins), **M54**, **M55**, **M56**, **M57**, **M69**, and all of the Oct 2026 batch #1–#8. The shared-package build issue was fixed by rebuilding `packages/shared`.
