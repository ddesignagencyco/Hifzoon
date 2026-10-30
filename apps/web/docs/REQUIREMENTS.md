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
- `20261030000000_hosted_subscription_checkout`
- `20261030000100_subscription_lifecycle`
- `20261030000200_tier_pricing`

Stripe: set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and add a webhook endpoint `https://<api-host>/api/v1/webhooks/payments` with the events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`. Turn on the customer portal (Settings → Billing → Customer portal) and Smart Retries. Web: `NEXT_PUBLIC_BILLING_ENABLED=true`.

## 2. Open asks (priority)

Billing, the post-trial flow and the availability fixes were built on `full-site-regression` (see section 7). What remains:

| ID | Problem | Evidence | Requested change | Web workaround today |
|:--|:--|:--|:--|:--|
| **R15** | Class recordings need storage LiveKit Cloud can reach | The egress uploads to `RECORDING_STORAGE_ENDPOINT` (new; defaults to `STORAGE_ENDPOINT`, the local MinIO, which LiveKit Cloud cannot reach). Recordings also need LiveKit's webhook (`https://<api-host>/api/v1/webhooks/video`) to be marked READY. | Production: a Cloudflare R2 / Backblaze B2 / AWS S3 bucket in `STORAGE_*` (Cloudinary can't be used: egress writes S3, GCS or Azure only). Development: a tunnel to MinIO in `RECORDING_STORAGE_ENDPOINT` and `STORAGE_PUBLIC_ENDPOINT`. | Stop button, consent check and the parent player are built; they work once storage is reachable. |
| **R2** | Admin can't read a teacher's tier | `admin/admin-console.service.ts` `teacherReadiness` has no `tier`. Only `GET /teachers/public` carries it. | Add `tier` to readiness (or an admin teacher read). | Read from the public list, so the tier can't be shown for teachers who aren't public yet. |
| **R4** | Spec says `/billing/plans` needs auth | The OpenAPI document marks it `security: bearer`, but the controller is `@Public()`. | Remove the bearer annotation from the spec. | None needed. |

**Decision to confirm (availability):** when a teacher submits a month with no hours, that month is treated as "not available" and weekly hours do not fill in. Change `findOpenSlots` if that is wrong.

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
| **Q9** | ~~Pricing periods per currency~~ Prices are per billing period of the plan (monthly, 3 or 6 months); set them in Admin → Billing → Plans & prices. |
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

Built on `full-site-regression` (2026-10-30), backend and web:

- **Billing (was R10):** Stripe Checkout in subscription mode — the family enters a card once after the trial; Stripe charges every period (monthly, or 3/6-month prepaid plans). Webhooks mirror Stripe invoices; each event id is applied once and an older event never overwrites a newer state; an hourly reconcile job and the checkout success page re-read Stripe so a lost webhook is recovered. Cancel keeps classes to the period end and only `customer.subscription.deleted` ends enrolments and future classes; a failed renewal sets PAST_DUE and classes continue while Stripe retries. Upgrades apply now with proration, downgrades at period end (subscription schedule). "Keep my plan" undoes a cancel. Card and receipts through the Stripe customer portal.
- **R12, R13:** `GET /billing/offers` gives the family their trial result; `/parent/continue/:id` lets them pick plan + weekly times with the trial teacher, and the weekly classes are created when the first payment lands.
- **R11:** `GET`/`PATCH /trials/:classId/outcome`; the trial's own teacher can now record the result (FR-ADM-05).
- **R1, R5, R6, R14:** month availability replaces weekly for that month, slots respect month bounds and leave, duplicates removed, booking guard and matching use the same rules.
- **R7, R9:** guardians/students read their own child's mistakes; a guardian joined as their child shows the child's name.
- **R16:** `POST …/recording/stop`; `GET …/recording` gives the class's family a short-lived signed link and the ayah/mistake markers, refused once recording consent is withdrawn. Player on the lesson card; Stop in the classroom.
- **R17:** families are notified (en/ur) when the plan starts (with the weekly times), a renewal fails (once per invoice), the plan changes, is set to end, or ends.
- **Tier pricing and price editor (R3, FR-OPS-05, FR-TCH-10):** a plan has a standard price and optional prices per teacher tier in each currency (`plan_tier_price`). A family is charged the price for their teacher's tier (chosen weekly teacher, else the trial teacher) and the subscription remembers that tier; a teacher change to another tier reprices from the next period (and now also moves the weekly schedule to the new teacher). `GET/PUT /admin/billing/prices`, `POST/PATCH /admin/billing/plans` (super admin) back the "Plans & prices" editor in Admin → Billing. Seed PKR prices for 2/week and Circle corrected.
- **R18:** `POST /billing/subscriptions/:id/weekly-times` moves a child's classes to new weekly times with the same teacher (old schedule restored if the new one can't be booked). A plan change with a different number of classes a week flags the subscription and asks the family to choose times.

Built in the backend and wired in the web on 2026-10-29: **M9**, **M14**, **M47**, **M48**, **M49**, **M50** (`lessons/mistakes.service.ts` refuses mistakes before the start and before the student side joins), **M54**, **M55**, **M56**, **M57**, **M69**, and all of the Oct 2026 batch #1–#8. The shared-package build issue was fixed by rebuilding `packages/shared`.
