# Changes on `full-site-regression`

**Base:** `dev` · **Period:** 2026-10-29 to 2026-10-30 · **Written from:** `git log origin/dev..HEAD`, each commit's file list, and the working tree on 2026-10-30.

The branch holds 8 commits (the first 7 also live on `feat-frontend-ui`) plus uncommitted work from 2026-10-30 that is listed separately at the end. Open items are in [`REQUIREMENTS.md`](./REQUIREMENTS.md). The endpoint table is in [`api-coverage.md`](./api-coverage.md).

| Commit | Date | Summary | Files |
|:--|:--|:--|--:|
| `05c7287` | 10-29 | Oct 2026 backend features in the web: pricing rewrite, tier badges, trials UI, availability editor | 23 |
| `3795557` | 10-29 | Next.js 16.4.0 → 16.4.3 (security advisory) | 3 |
| `63d961d` | 10-29 | Wire the Oct 2026 backend batch and the open carry-forward endpoints | 81 |
| `3044af8` | 10-29 | Remove the currency picker from the site header | 4 |
| `c17f235` | 10-29 | Live classroom with LiveKit video, monthly availability and a booking calendar | 27 |
| `356ef75` | 10-29 | Simpler trial results page for admins | 2 |
| `12e9f0f` | 10-29 | Drop R10 from the requirements | 1 |
| `fc18138` | 10-30 | Stripe recurring billing, tier pricing, admin data tables and class time limits | 151 |
| *(uncommitted)* | 10-30 | UI review fixes, trial list API, CRM ↔ trial sync, data fixes | — |

---

## 1. Billing and payments (backend + web) — `fc18138`

### Stripe recurring billing
- **Card only after the trial.** Free trials take no card. When a family continues, `POST /billing/subscribe` opens Stripe Checkout in subscription mode. The subscription waits as `INCOMPLETE`, with a `setup` record holding the trial outcome, the chosen weekly times and the checkout session.
- **Billing periods.** Stripe charges each period: monthly, or a 3- or 6-month prepaid plan.
- **Activation by webhook only.** `checkout.session.completed` activates the subscription. The family's weekly classes are then created, one recurring schedule per chosen time.
- **Webhooks.** These events are mapped:
  - checkout completed;
  - `invoice.paid` and `invoice.payment_failed`;
  - `customer.subscription.updated` (the plan is read from the Stripe product);
  - `customer.subscription.deleted`.

  Stripe invoices are mirrored into `invoice`, with `provider_invoice_id` and `hosted_url`.
- **Idempotency.** Each event id is recorded in `processed_webhook_event` (unique per provider and event) only after it is applied. A repeated event is skipped.
- **Ordering.** `subscription.provider_synced_at` stops an older event from overwriting a newer state.
- **Recovery when a webhook is lost:**
  - `POST /billing/subscriptions/:id/sync` re-reads Stripe;
  - the checkout return page calls it;
  - an hourly worker job, `billing:reconcile-subscriptions`, re-reads every subscription.
- **Subscription lifecycle:**
  - Cancel keeps classes until the end of the period.
  - Only `customer.subscription.deleted` ends enrolments and future classes.
  - "Keep my plan" (`POST …/keep`) undoes a cancel.
- **Plan changes** (`POST …/change-plan`):
  - An upgrade applies now with a prorated invoice.
  - A downgrade applies at the period end through a subscription schedule.
- **Failed renewals.** A failed renewal sets `PAST_DUE`. Classes continue while Stripe retries, and dunning skips Stripe-billed invoices.
- **Card and receipts.** These go through the Stripe customer portal (`POST /billing/portal`). The stored customer id is recreated if it is not a real `cus_` id.
- **Guards.** Cancel and pause refuse an `INCOMPLETE` subscription.
- **Verified in Stripe test mode with a test clock:**
  - activation;
  - cancel, then keep;
  - upgrade with a prorated invoice;
  - downgrade at the period end;
  - failed renewal → `PAST_DUE` → card updated → `ACTIVE`;
  - final cancel.

### Tier pricing and the price editor
- **Tier prices.** A new `plan_tier_price` table sets a price per plan, teacher tier and currency, falling back to `plan_price`.
- **Which price a family pays.** The family is charged the price for their teacher's tier: the chosen weekly teacher, else the trial teacher. `subscription.tier_id` remembers that tier.
- **Teacher changes.** When an approved teacher change moves the family to a different tier, the price changes from the next period. The weekly schedule also moves to the new teacher.
- **Admin endpoints:**
  - `GET/PUT /admin/billing/prices`;
  - `POST /admin/billing/plans` and `PATCH /admin/billing/plans/:id` (super admin).
- **Admin → Billing → Plans & prices:**
  - currency tabs;
  - Standard and per-tier price columns;
  - a tier choice for the public page;
  - a plan create/edit dialog.
- **Seed.** PKR prices for the "2 classes/week" and "Circle" plans corrected.

### After the trial
- `GET /billing/offers` lists won trials waiting for the family.
- `/parent/continue/:trialOutcomeId` lets the family continue with their trial teacher: they choose a plan and weekly times, then pay.
- `POST /billing/subscriptions/:id/weekly-times` moves a child's classes to new times with the same teacher. If the new times can't be booked, the old schedule is restored.
- When a plan change alters the number of classes a week, the subscription is flagged and the family is asked to choose new times.

### Notifications (en and ur)
Families are told when:
- the plan starts (with the weekly times);
- a renewal fails (once per invoice);
- the plan changes;
- the plan is set to end;
- the plan ends;
- new weekly times are needed.

### Migrations
- `20261030000000_hosted_subscription_checkout`
- `20261030000100_subscription_lifecycle`
- `20261030000200_tier_pricing`

---

## 2. Classroom, recording and trials (backend + web)

- **LiveKit classroom (`c17f235`):**
  - joins on entry;
  - page, highlight and mistake sync over the socket, with a REST fallback;
  - LiveKit video and audio, with reconnect and token refresh;
  - audio unlock on phones;
  - camera and mic picker;
  - quality bars and mic/camera state on each tile;
  - one connection status and icon-only controls.

  The room-token response now carries the LiveKit `videoToken`. Local LiveKit advertises `127.0.0.1` (`docker-compose.yml`).
- **Class time limit (`fc18138`):** the worker ends the video room at the booked end time (`VideoProvider.endRoom`, LiveKit `deleteRoom`). `close-classes` now runs every minute instead of every 5. The meeting header shows the minutes left and highlights the last 5.
- **Recording (`fc18138`):**
  - `POST /classroom/classes/:id/recording/stop`;
  - `GET /classroom/classes/:id/recording`: a short-lived signed link plus the ayah and mistake markers, refused once recording consent is withdrawn;
  - a player on the lesson card;
  - `RECORDING_STORAGE_ENDPOINT` for the egress upload.

  The UI is hidden behind `NEXT_PUBLIC_RECORDING_ENABLED`. Storage that LiveKit Cloud can reach is still open (R15).
- **Trial results (`fc18138`):**
  - `GET` and `PATCH /trials/:classId/outcome` read and correct a saved result;
  - the trial's own teacher may now record the result (FR-ADM-05);
  - a shared `TrialResultForm` is used in the teacher class detail and in admin.
- **Trial-teacher availability (`fc18138`):** the trial-teacher filter counts only availability that is still in effect.
- **Availability and slots:**
  - Month availability replaces the weekly pattern for that month.
  - Slots respect month bounds and leave.
  - Duplicate slots are removed.
  - The booking guard and matching use the same rules.

  These are fixed in `scheduling.service.ts` (R1, R5, R6, R14).
- **Mistakes:**
  - Guardians and students can read their own child's mistakes.
  - A guardian joined as their child shows the child's name.
  - Mistakes are refused before the start and before the student side joins (R7, R9, M50).

---

## 3. Web app

### Oct 2026 batch (`05c7287`, `63d961d`, `3044af8`)
- Plans sell teacher tiers, not prices. The home and `/pricing` pages show tier cards, and prices are read per plan in the family currency. This fixed the three screens that broke when `/billing/plans` stopped returning prices.
- **Teacher tiers:**
  - an admin catalogue;
  - a per-teacher tier picker;
  - badges on the public cards and profiles.
- Profile-change review, with before/after and credential verification on approval.
- Teacher **monthly availability and leave**.
- **Account and family:**
  - change password;
  - live consent-policy version;
  - student timetable;
  - the teacher's view of a student;
  - Report a concern;
  - a guardian joining a class as their child.
- CRM areas (leads by country and region).
- The currency picker was removed from the site header.
- Docs consolidated into `REQUIREMENTS.md`, `PROGRESS.md` and `api-coverage.md`.

### Booking (`c17f235`)
- Teacher availability is month-only, with "apply to whole month".
- Booking uses a month calendar with time chips grouped by part of the day, a teacher dropdown and de-duplicated slots.

### Admin UX (`356ef75`, `fc18138`)
- **Data tables everywhere** (TanStack Table `DataTable`: sorting, search, pagination):
  - teachers, hiring, users search, CRM leads and tasks, enrolments, invoices;
  - profile changes, notifications, recent trials;
  - teacher Students and Payslips.
- **Dropdowns instead of pasted ids:**
  - Shared `Select` and `FilterSelect` in shadcn style, with the "All" option first and selected by default.
  - Student picker searches as you type and shows the family name as a second line.
  - Pickers for refunds, write-offs, issuing invoices, scheduling, payroll periods and the audit log ("Done by", "Record type").
  - The teacher application loads the applicant's profile directly.
- **New pages:**
  - separate **Enrolments** and **Invoices & refunds** pages in the sidebar, moved out of Courses and Billing;
  - a Settings catalogue of the 7 settings the platform uses, with readable labels.
- **CRM lead form:**
  - country → region → city lists from `country-state-city`, with free typing when a place isn't listed;
  - postcode;
  - an offered-course dropdown and a source dropdown.
- **Searching and content:**
  - Users search runs as you type (debounced) with no button.
  - Content posts get a language dropdown (en/ur/ar) and a rich body editor (toolbar and preview).
- **Teacher application:** the profile on the application now loads by itself (the API resolves it).

### Parent (`fc18138`)
- **Billing:**
  - offers banner;
  - checkout return sync;
  - card portal;
  - change plan, "Keep my plan" and weekly times;
  - tier-aware prices;
  - an invoice table with a status filter.
- Family dashboard on the overview.
- Timetable filters.
- A 5xx response without JSON shows "The server is not responding right now".

---

## 4. Uncommitted work on 2026-10-30 (after `fc18138`)

From the UI review in the browser (admin and parent signed in):

**Backend**
- `GET /trials`: trial classes from 30 days back to 30 days ahead, with each one's saved result and CRM lead.
  - It replaces the browser reading every teacher's timetable.
  - That approach missed teachers outside the public directory and any trial booked after the page loaded.
  - It also marked a trial "Saved" when its class was merely COMPLETED.
- CRM and trials are now kept in step by `crm/trial-lead.ts`:

  | Event | Lead change |
  |:--|:--|
  | Trial booked (family or admin) | **Trial booked**. A family booking on the website gets a new lead (source "website") with a welcome-call task. |
  | Result saved, continuing | **Trial done** |
  | Result saved, not continuing | **Lost**, with the reason; open tasks are cancelled |
  | Subscription activated | **Enrolled**; open tasks are done |

  CRM errors are logged and never fail a booking, result or payment.
- `GET /admin/audit/facets`: actors and record types for the audit filters.
- `GET /admin/billing/lookups` changes:
  - invoices carry due/paid dates, hosted link and source (card or manual);
  - payments carry the refunded and still-refundable amounts.
- `GET /billing/family`: each subscription carries this period's class usage (taught, still to come, missed by the student, missed by the teacher).
- **Bug fix:** class reminders are queued with a fixed job id, so planning a class twice no longer sends two "Class in 15 minutes" messages.
- Notification template grammar fixed ("1 class a week").
- **Data fixes:**
  - Migration `20261030000300_task_type_fix`: first-contact and trial-booked follow-ups were filed as "missed trial" tasks. They are now ordinary follow-ups, and new ones use `OTHER`.
  - Migration `20261030000400_real_teacher_ratings`: the seed gave every approved teacher an invented 4.8 rating from 12 reviews. Ratings are now recomputed from real reviews only, and the seed no longer invents them.

**Web**
- **CRM redesign:**
  - KPI cards and a "Where leads are now" bar;
  - board columns with plain stage names (New enquiry, Trial booked, Trial done, Enrolled, Lost) and hints;
  - lead cards with call/email links, location and next follow-up (overdue in red);
  - an "All leads" table with a next-follow-up column and an owner filter;
  - Follow-up tasks with To do / Overdue / Done tabs and counts.

  Stage names are shared with the admin overview.
- **Trial results:**
  - one list with "Show: All / Needs a result / Result saved / Upcoming";
  - CRM lead column;
  - the result form opens only after a trial is picked;
  - "What happens next" appears only after saving and matches the real flow.
- **Invoices & refunds:**
  - an invoice table (status and card/manual filters, link to the Stripe invoice);
  - the refund form shows how much can still be refunded and has "Full amount";
  - the "refundable balance" and "display-only currency" fields were removed.
- **Parent billing:**
  - ended plans are folded under "Ended plans";
  - class usage bar;
  - "£X to pay" on the dashboard.
- **Teachers:**
  - subjects shown by name;
  - language checkboxes when provisioning a teacher (no typed codes);
  - "All genders" filter.
- **Readable labels:** enrolments ("Not placed yet · Lesson 1", "Change status", "Set lesson"), audit actions, Mushaf ("Madani (15-line)"), child language ("English").
- **Form and toolbar layout:**
  - Country, currency and timezone selects match portal forms;
  - only currencies the API accepts are offered;
  - `DataTable` has a `toolbar` slot so filters and search sit on one aligned row.
- **Error and inbox text:**
  - network errors read "Could not reach the server…" or "The server took too long…" instead of browser messages;
  - notification bodies drop raw URLs.

---

## 5. Backend asks closed on 2026-10-30 (uncommitted)

| ID | What was built | Where it shows |
|:--|:--|:--|
| R2 | Teacher readiness returns the teacher's tier | Admin → Teachers → readiness tier panel (also for teachers not yet public) |
| R4 | `@Public()` routes no longer carry `security: bearer` in the OpenAPI spec | Spec |
| M19 | `POST /lesson-cards/:id/ai-summary` drafts the family summary from the card's own facts (portions, grades, mistakes, homework, note). No external model is called. | Lesson card → "Draft from this card" |
| M28 | Case `severity` (LOW–CRITICAL; safeguarding starts HIGH); `POST /cases/:id/severity`; cases only move forward | Case board column, open form, case page |
| M29 | `GET /billing/family/payments`; subscribing refuses a second live plan for the same enrolment | Parent → Billing → Payments |
| M45 | On approval the applicant's audition recording becomes the profile sample | Teacher profile |
| M46 | Hifz page engine: lesson-card portions with page numbers move page states (rule config, interval ladder, mistakes) | Lesson card page fields; Hifz page map |
| M58 | Guardian withdraws an open request (`POST /teacher-changes/:id/cancel`); resolution note; family and both teachers notified | Parent requests list; admin resolve dialog |
| M59 | `notification.read_at`, `GET /notifications/unread-count`, `POST /notifications/read` | Bell count; inbox "Mark all as read" |
| M60 | `PATCH /courses/enrolments/:id/teacher` moves the enrolment, weekly times and future classes | Admin → Enrolments → "Change teacher" |
| M61 | Admin-booked trials notify the family and plan reminders | — |
| M62 | `GET /qa/reviews/mine`; teacher told of a review, supervisor told of a reply | New Teacher → Quality reviews page |
| M63 | Applicants e-mailed at each hiring step; approval creates the account and e-mails a set-password link | — |
| M64 | Public FAQ submissions audited | Audit log |
| M65 | 1–2 star family ratings alert supervisors | Notifications |
| M66 | `POST /teacher/threads` — a teacher starts the conversation with a student's family | Teacher → Student → "Message the family" |
| M67 | `GET /scheduling/makeup-credits`, `POST …/:id/redeem` books a MAKEUP class in the teacher's open times | Parent → Timetable → Make-up credits |
| M68 | Timetable rows carry the lesson card state | Teacher timetable badges; parent "Lesson card" link |

Re-checked and closed the same day:

| ID | Finding | Fix |
|:--|:--|:--|
| M16 | Already done: the room token carries the LiveKit `videoToken`, and the classroom connects with it | — |
| M17 | The Mushaf layout switch (REST only) and the REST fallback for page, highlight and Tajweed did not reach the other participants | The REST routes now publish the same socket events as the socket path (`ClassroomGateway.publish`) |
| M20 | A teacher's own submitted but not-yet-shared cards were missing from the student's card history | The history shows a teacher their own cards as well as the shared ones; families still see shared cards only |
| Q13 | A supervisor's edit to someone else's card was logged only after the card locked | Any edit by someone other than the card's teacher is logged, before or after the lock |
| Q15 | Level rubrics and lesson objectives/materials were checked only by the web form | The API applies the same rules: weights are whole numbers 0–100 adding up to 100; objectives are up to 30 lines; materials are up to 30 label/value pairs |

Also on 2026-10-30:
- **Duplicate enrolments fixed.** A trial for a child already enrolled in the course created a second enrolment, so the same course showed two or three times. It is now refused, and a partial unique index allows one live enrolment per child and course.
- **Hiring steps:** failing or reopening a step resets every later step, including approval.
- **CSS:** headings marked `font-sans` were forced into the serif heading font; they now render as asked.
- **Parent times:** dashboard times use the guardian's zone, the same zone as the Timetable, instead of the device zone.

### Development seed (`apps/api/prisma/seed-academy.ts`)

A working academy for every page, consistent across tables:
- **Teachers:** 6 teachers, 5 of them cleared, with tiers, bios and availability.
- **Applicants:** 3 still in the hiring pipeline (one rejected).
- **Families:** 7 families in GB, AE, US and PK, with GBP, AED, USD and PKR billing.
- **Classes:** eight weeks of classes behind and three ahead, including no-shows and family and teacher cancellations.
- **Records from those classes:** attendance, lesson cards and mistakes, and Hifz page states built by the M46 engine.
- **Billing:** subscriptions in each state (active, paused, past due, ending), with monthly invoices, payments and a refund.
- **Admissions:** trials with results, a trial still waiting for its result, and an upcoming trial.
- **Make-up credits:** one available and one used.
- **CRM:** leads in every stage, with follow-up tasks (overdue, due today, done).
- **Quality and safeguarding:** QA reviews (one with a teacher reply), family ratings (one low), and safeguarding and complaint cases.
- **Other records:**
  - last month's payroll, paid;
  - message threads;
  - notifications;
  - a pending profile change and teacher-change requests.

Names are real-sounding. All e-mail addresses stay on `hifzoon.test`. Ratings come from seeded reviews only.
