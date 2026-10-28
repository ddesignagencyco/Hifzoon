# Hifzoon — Module Flow Walkthrough (UI)

Step-by-step **manual test script for the web app**. Every step is something you do in the browser: click, type, look. No API calls, no Swagger, no curl.

Each module below lists the steps in the order to run them, and what you should see on screen.

---

## 0. Before you start (once)

### Start the app

| #   | Do this                                                    | Where           | You should see                                                    |
| --- | ---------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| 0.1 | Open a terminal in `D:\Hifzoon\Hifzoon`                    | —               | —                                                                 |
| 0.2 | Run `POSTGRES_PORT=5435 REDIS_PORT=6382 npm run docker:up` | terminal        | Containers start                                                  |
| 0.3 | Run `npm run db:seed`                                      | terminal        | Seed completes                                                    |
| 0.4 | Run `npm run dev:all`                                      | terminal        | Two windows of output; the web app says ready on `localhost:3000` |
| 0.5 | Run `cd apps/web` then `npm run demo:data`                 | second terminal | Ends with a summary of demo logins and URLs                       |
| 0.6 | Open `http://localhost:3000`                               | browser         | The Hifzoon home page                                             |

> Keep both terminals open for the whole session.
> The **Students** portal and a **live classroom** only exist while the demo class is running — if a step says "nothing here", re-run `npm run demo:data`.

### Test accounts

Password for all of them: **`Hifzoon!Dev2026`**

| Portal       | Email                       |
| ------------ | --------------------------- |
| Parent       | `parent@hifzoon.test`       |
| Teacher      | `teacher@hifzoon.test`      |
| Supervisor   | `supervisor@hifzoon.test`   |
| Admin        | `admin@hifzoon.test`        |
| Super admin  | `superadmin@hifzoon.test`   |
| Safeguarding | `safeguarding@hifzoon.test` |
| Examiner     | `examiner@hifzoon.test`     |

> Staff accounts ask for a 2FA code the first time. Run the automated suite once (`cd apps/web && npm run e2e --project=setup`) and it enrols them for you; otherwise set it up in **Account security** as part of §1.

### Signing in

1. Click **Log in** (top right).
2. Pick a role tab — **Parent**, **Student**, **Faculty**, **Staff**. (Cosmetic only; the account decides.)
3. Type the email and password.
4. Click **Sign In**.
5. You land on your portal home.

---

## 1. Authentication & account security

_Matches the automated suite's `auth.spec.ts`._

| #    | Do this                                                                  | Where                      | You should see                                                                     |
| ---- | ------------------------------------------------------------------------ | -------------------------- | ---------------------------------------------------------------------------------- |
| 1.1  | Open `/login`                                                            | browser                    | "Sign In to Hifzoon", four role tabs, email + password boxes                       |
| 1.2  | Click **Student**, then **Kids Mode**                                    | `/login`                   | Message: "Kids Mode sign-in is not available yet"                                  |
| 1.3  | Back to **Parent**. Type `not-an-email`, any password, click **Sign In** | `/login`                   | "Please enter a valid email address." You stay on the page                         |
| 1.4  | Type a wrong password, click **Sign In**                                 | `/login`                   | Red error toast. You stay on the page                                              |
| 1.5  | Type the right password, click the eye icon                              | `/login`                   | Password becomes visible; icon changes to "Hide password"                          |
| 1.6  | Sign in as `parent@hifzoon.test`                                         | `/login`                   | Redirects to **Family portal**                                                     |
| 1.7  | Look at the left sidebar                                                 | `/parent`                  | Overview, Children, Timetable, Messages, Billing, Privacy & consent, Notifications |
| 1.8  | Press **F5** to refresh                                                  | any portal                 | Page reloads and you are **still signed in** (no bounce to login)                  |
| 1.9  | Click **Sign out** at the bottom of the sidebar                          | any portal                 | Back at `/login` with nothing filled in                                            |
| 1.10 | In the address bar go to `/admin` **without** signing in                 | browser                    | Redirects to `/login?redirect=…`                                                   |
| 1.11 | Sign in as parent, then go to `/admin`                                   | `/admin`                   | 403 page: "You don't have access to this page" + **Go to my portal**               |
| 1.12 | Click **Go to my portal**                                                | 403 page                   | Back on `/parent`                                                                  |
| 1.13 | Sign out, open `/login?redirect=/parent/privacy`, sign in as parent      | browser                    | Lands on `/parent/privacy`                                                         |
| 1.14 | Sign out, open `/login?redirect=https://evil.example`, sign in as parent | browser                    | Lands on `/parent` — the external address is ignored                               |
| 1.15 | Go to `/this-page-does-not-exist`                                        | browser                    | 404: "We couldn't find that page"                                                  |
| 1.16 | Sign in as a staff account, open `/account/security`                     | sidebar → Account security | Sessions list, 2FA panel, **Sign out everywhere**                                  |
| 1.17 | Sign in as **parent**, open `/account/security`                          | —                          | "currently available for teacher and staff accounts only"                          |
| 1.18 | Open `/forgot-password`, enter the parent email, submit                  | browser                    | "Recovery Email Dispatched"                                                        |
| 1.19 | Open `/register`, type a 5-character password                            | browser                    | Counter shows "5/12 chars minimum"; password marked weak                           |

---

## 2. Public website

_No sign-in needed. Matches `public.spec.ts`._

| #    | Do this                                                                      | Where               | You should see                                                                                         |
| ---- | ---------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| 2.1  | Load the home page                                                           | `/`                 | Hero, a live classroom animation, curriculum, faculty, memorization tracker, pricing, FAQ, closing CTA |
| 2.2  | Scroll top to bottom                                                         | `/`                 | Every section renders, nothing broken or blank                                                         |
| 2.3  | Click **Courses** in the header                                              | header              | "Academic Quranic Pathways" + course cards                                                             |
| 2.4  | Click the **Foundation**, then **Memorization** pills                        | `/courses`          | The card list filters each time; the count line updates                                                |
| 2.5  | Type "hifz" in "Search courses or levels…"                                   | `/courses`          | List narrows                                                                                           |
| 2.6  | Click **View syllabus** on any card                                          | `/courses/<CODE>`   | Course detail page with levels                                                                         |
| 2.7  | Click **Faculty** in the header                                              | header              | "Our Quran Teachers" + teacher cards                                                                   |
| 2.8  | Type "zzzz" in the teacher search box                                        | `/teachers`         | "No teachers match these filters."                                                                     |
| 2.9  | Clear the search, click a teacher card                                       | `/teachers/<id>`    | Photo, subjects, bio, family rating, **Request a trial class**                                         |
| 2.10 | Click **Request a trial class**                                              | teacher profile     | Opens the booking flow                                                                                 |
| 2.11 | Click **Pricing**                                                            | header              | "Transparent Tuition" + plan cards                                                                     |
| 2.12 | Change the currency in the top bar                                           | `/pricing`          | Prices change; the line under the plan list follows                                                    |
| 2.13 | Click **Resources**                                                          | header              | Tabs: Everything / Articles / Printables, plus an FAQ accordion                                        |
| 2.14 | Click **Articles**, then open an article                                     | `/resources/<slug>` | Article body, breadcrumb, sidebar CTAs                                                                 |
| 2.15 | Use the "ask a question" box and submit                                      | `/resources`        | Success toast (later appears in Admin → Content & FAQ)                                                 |
| 2.16 | Click the footer links **Privacy**, **Terms**, **Child safety**, **Refunds** | footer              | Each policy page renders                                                                               |
| 2.17 | Click any link in the footer                                                 | footer              | Every one lands on a real page (no 404)                                                                |

---

## 3. Trial booking

_Matches `public.spec.ts`. Works signed out (prompts to log in) or signed in._

| #   | Do this                                                       | Where         | You should see                                                  |
| --- | ------------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| 3.1 | Click **Book free trial** in the header                       | `/book-trial` | 3-step wizard                                                   |
| 3.2 | Step 1: pick a course                                         | `/book-trial` | Moves to step 2                                                 |
| 3.3 | Step 2: browse and pick a time slot; change the filters       | `/book-trial` | Slot list refreshes                                             |
| 3.4 | Step 3: enter learner details and submit **while signed out** | `/book-trial` | Prompts you to log in / register, then resumes at the same step |
| 3.5 | Repeat and book **while signed in as parent**                 | `/book-trial` | Confirmation; the class now appears on **Timetable**            |
| 3.6 | Open `/book-trial?course=HIFZ&gender=F` directly              | address bar   | Course and gender already selected                              |

---

## 4. Teacher recruitment

| #   | Do this                                                                             | Where                               | You should see                                      |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- |
| 4.1 | Open `/apply-teacher` signed out                                                    | `/apply-teacher`                    | Recruitment page + long application form            |
| 4.2 | Fill name, email, phone, country, gender, experience, hafiz/sanad/qiraat            | same                                | Form validates                                      |
| 4.3 | Try **record in browser**, **upload a file**, and **paste a link** for the audition | same                                | All three options accepted                          |
| 4.4 | Submit                                                                              | same                                | Confirmation                                        |
| 4.5 | Sign in as supervisor → **Hiring pipeline**                                         | `/supervisor/applications`          | Your application is listed                          |
| 4.6 | Open it, add hiring steps one by one                                                | `/supervisor/applications/<id>`     | Step list grows; status moves toward ready-to-match |
| 4.7 | Sign in as super admin → **Teachers** → open the same application                   | `/admin/teachers/applications/<id>` | Record safeguarding training and a profile review   |
| 4.8 | Back on **Teachers**                                                                | `/admin/teachers`                   | Provisioned teacher and readiness state             |

---

## 5. Family portal

_Sign in as `parent@hifzoon.test`. Matches `parent.spec.ts`._

| #    | Do this                                         | Where                   | You should see                                    |
| ---- | ----------------------------------------------- | ----------------------- | ------------------------------------------------- |
| 5.1  | Sidebar → **Overview**                          | `/parent`               | A card per child, the next lesson, consent status |
| 5.2  | Sidebar → **Children**                          | `/parent/children`      | The roster with your children                     |
| 5.3  | Click **Add child** and complete the wizard     | `/parent/children`      | New child appears in the list                     |
| 5.4  | Click **Edit** on a child, change a field, save | same                    | Change survives a refresh                         |
| 5.5  | Click a child's name                            | `/parent/children/<id>` | Detail page with tabs                             |
| 5.6  | Click **Charts**                                | same                    | Progress charts render                            |
| 5.7  | Click **Report card**, change the month         | same                    | Report card redraws                               |
| 5.8  | Click **Courses**                               | same                    | Enrolments with status                            |
| 5.9  | Click **Lesson cards**                          | same                    | Cards the teacher shared                          |
| 5.10 | Click **Mistakes**                              | same                    | Mistakes logged in class                          |

---

## 6. Courses & enrolments

| #   | Do this                               | Where                 | You should see                        |
| --- | ------------------------------------- | --------------------- | ------------------------------------- |
| 6.1 | Sign in as **admin** → **Courses**    | `/admin/courses`      | Course list                           |
| 6.2 | Click a course                        | `/admin/courses/<id>` | Levels and lessons                    |
| 6.3 | **Add level**, name it, save          | same                  | New level appears                     |
| 6.4 | Open that level, **Add lesson**, save | same                  | Lesson appears under the level        |
| 6.5 | Look at the enrolments panel          | same                  | Enrolments listed                     |
| 6.6 | Create an enrolment for a student     | `/admin/courses`      | Appears on the parent's Courses tab   |
| 6.7 | Change an enrolment's status          | same                  | Parent sees the new status on refresh |

---

## 7. Scheduling & booking

| #   | Do this                                                         | Where                    | You should see                                        |
| --- | --------------------------------------------------------------- | ------------------------ | ----------------------------------------------------- |
| 7.1 | Admin → **Scheduling**                                          | `/admin/scheduling`      | Scheduling builder                                    |
| 7.2 | Pick a teacher and a slot, save the schedule                    | same                     | Saved; shows in the teacher's timetable               |
| 7.3 | Use the matching tool for a student                             | same                     | Suggested teachers returned                           |
| 7.4 | Open `/admin/scheduling?enrolmentId=…&teacherId=…&scheduleId=…` | address bar              | Builder pre-filled from the URL                       |
| 7.5 | Parent → **Timetable**                                          | `/parent/timetable`      | Weekly grid, a **Join** button per class              |
| 7.6 | Reschedule or cancel a class                                    | same                     | Timetable updates immediately                         |
| 7.7 | Rate a finished class                                           | child detail / timetable | Rating saved; visible on the teacher's public profile |
| 7.8 | Teacher → **Timetable**, open a class                           | `/teacher/timetable`     | Detail modal with cancel / reschedule                 |
| 7.9 | Teacher → **Availability**, edit the weekly grid, save          | `/teacher/availability`  | New slots appear in the booking search                |

---

## 8. Classroom

_The demo seeds one class whose room is open right now. If nothing appears, re-run `npm run demo:data`._

| #    | Do this                                                  | Where                         | You should see                                  |
| ---- | -------------------------------------------------------- | ----------------------------- | ----------------------------------------------- |
| 8.1  | Teacher → **Today**                                      | `/teacher`                    | Today's classes, family rating, identity status |
| 8.2  | Click the live class → **Brief**                         | `/teacher/classes/<id>/brief` | Pre-class brief                                 |
| 8.3  | Enter the room                                           | `/teacher/classroom/<id>`     | Classroom loads; Mushaf visible                 |
| 8.4  | Change the **page** and the **layout**                   | same                          | Mushaf updates                                  |
| 8.5  | Tap a line to **highlight**, toggle **tajweed**          | same                          | Highlight/rules appear                          |
| 8.6  | Draw on the whiteboard, then clear                       | same                          | Strokes appear and clear                        |
| 8.7  | **Log a mistake** against a student                      | same                          | Appears on that child's Mistakes tab            |
| 8.8  | Mark **attendance**, then **close attendance**           | same                          | Locked for editing                              |
| 8.9  | Check **recording consent**, then start recording        | same                          | Only starts when consent exists                 |
| 8.10 | Open the **bandwidth advice**                            | same                          | Advice from the connection check                |
| 8.11 | In a second browser, open the same room as the **child** | `/student/classroom/<id>`     | The Mushaf syncs with the teacher's             |
| 8.12 | In a third window, open the same room as the **parent**  | `/parent/classroom/<id>`      | Watch-only: you can see but not drive           |

---

## 9. Lesson cards

| #   | Do this                                                | Where                                  | You should see             |
| --- | ------------------------------------------------------ | -------------------------------------- | -------------------------- |
| 9.1 | Teacher, in the classroom → **Lesson card**            | `/teacher/classroom/<id>/lesson-card`  | Prefilled content          |
| 9.2 | Save an AI draft                                       | same                                   | Draft appears              |
| 9.3 | **Approve** the draft                                  | same                                   | Card becomes final         |
| 9.4 | Open the card and check the **edit log**               | `/teacher/lesson-cards/<id>`           | Card + a log of every edit |
| 9.5 | Supervisor opens the same card and edits with a reason | `/supervisor/lesson-cards/<id>`        | Edit applied and logged    |
| 9.6 | Parent views it                                        | `/parent/children/<id>` → Lesson cards | Card appears               |

---

## 10. Progress & reports

_Parent portal._

| #    | Do this                               | Where                   | You should see          |
| ---- | ------------------------------------- | ----------------------- | ----------------------- |
| 10.1 | Child → **Charts**                    | `/parent/children/<id>` | Charts                  |
| 10.2 | Child → **Report card**, pick a month | same                    | Monthly report          |
| 10.3 | Child → **Courses**                   | same                    | Enrolment + next lesson |

---

## 11. Messaging

_The demo seeds a conversation with three messages each way._

| #    | Do this                                      | Where                    | You should see                        |
| ---- | -------------------------------------------- | ------------------------ | ------------------------------------- |
| 11.1 | Parent → **Messages**                        | `/parent/messages`       | Thread list                           |
| 11.2 | Open the thread                              | `/parent/messages/<id>`  | The conversation                      |
| 11.3 | Type a message and click **Send message**    | same                     | It appears in the log                 |
| 11.4 | Open `/parent/messages/<id>` directly        | address bar              | Same thread, single view              |
| 11.5 | Teacher → **Messages** → same thread → reply | `/teacher/messages/<id>` | Parent's message visible; reply sends |
| 11.6 | Click the bell in the top bar                | any portal               | Latest notifications, unread dot      |

> The composer warns if you paste a phone number or email — remove it and send. That's the child-safety filter working.

---

## 12. Privacy, consent & data rights

_Parent portal._

| #    | Do this                                                | Where             | You should see                        |
| ---- | ------------------------------------------------------ | ----------------- | ------------------------------------- |
| 12.1 | **Privacy & consent**                                  | `/parent/privacy` | Consent matrix                        |
| 12.2 | **Grant** a consent for a child                        | same              | Status flips to granted               |
| 12.3 | **Withdraw** it, give a reason                         | same              | Status flips back                     |
| 12.4 | Add a co-guardian, then start and confirm verification | same              | Family marked verified                |
| 12.5 | Request a **data export**                              | same              | Accepted; processed in the background |
| 12.6 | Request a **deletion**                                 | same              | Accepted                              |
| 12.7 | View the **privacy summary**                           | same              | Summary renders                       |

---

## 13. Billing

| #    | Do this                                                  | Where                        | You should see                               |
| ---- | -------------------------------------------------------- | ---------------------------- | -------------------------------------------- |
| 13.1 | Parent → **Billing**                                     | `/parent/billing`            | Plans, current subscription, invoice history |
| 13.2 | Subscribe to a plan                                      | same                         | Subscription becomes active                  |
| 13.3 | **Pause**, then **Resume**                               | same                         | Status changes each time                     |
| 13.4 | **Cancel**                                               | same                         | Confirmation, subscription cancelled         |
| 13.5 | Find the invoice with an open balance, click **Pay now** | same                         | Checkout flow runs                           |
| 13.6 | Complete or cancel checkout                              | `/parent/billing/checkout/…` | Success or cancelled page, list refreshes    |
| 13.7 | Admin → **Billing** → issue an invoice                   | `/admin/billing`             | Appears in the family's history              |
| 13.8 | Super admin → **Billing** → **Refund**                   | `/admin/billing`             | Refund recorded                              |
| 13.9 | Admin → **Billing** → run **dunning**                    | `/admin/billing`             | Run completes                                |

> Payments use a fake provider — checkout completes without a real charge. That is expected.

---

## 14. Payroll

| #    | Do this                       | Where               | You should see     |
| ---- | ----------------------------- | ------------------- | ------------------ |
| 14.1 | Super admin → **Payroll**     | `/admin/payroll`    | Rates and periods  |
| 14.2 | Set a pay rate                | same                | Saved              |
| 14.3 | Open a period → **Calculate** | same                | Entries generated  |
| 14.4 | Open the **report**           | same                | Report renders     |
| 14.5 | Mark an entry **Paid**        | same                | Entry becomes paid |
| 14.6 | Teacher → **Payslips**        | `/teacher/payslips` | History listed     |

---

## 15. Quality & supervision

_Sign in as `supervisor@hifzoon.test`._

| #    | Do this                                                               | Where                       | You should see                                                  |
| ---- | --------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------- |
| 15.1 | Sidebar → **Overview**                                                | `/supervisor`               | Stat tiles, teacher QA table, "Needs attention"                 |
| 15.2 | **Teachers & scorecards**                                             | `/supervisor/teachers`      | Directory with search / subject / window filters                |
| 15.3 | Open a teacher                                                        | `/supervisor/teachers/<id>` | Scorecard, ratings, recent classes                              |
| 15.4 | As **super admin**, **Draw this month's sample**                      | same                        | A class is sampled                                              |
| 15.5 | **Class reviews** → pick teacher → pick a class from the last 45 days | `/supervisor/reviews`       | Rubric form                                                     |
| 15.6 | Fill the rubric and submit                                            | same                        | Review recorded                                                 |
| 15.7 | Teacher replies to the review                                         | `/teacher`                  | Reply stored                                                    |
| 15.8 | Open `/supervisor/reviews?teacherId=…&classId=…&source=RANDOM_SAMPLE` | address bar                 | Pre-selected from the URL                                       |
| 15.9 | Sign in as **examiner**                                               | `/supervisor`               | Only "Overview"; other pages show "No assessments assigned yet" |

---

## 16. Safeguarding cases

_Sign in as `safeguarding@hifzoon.test`._

| #    | Do this                                  | Where                      | You should see            |
| ---- | ---------------------------------------- | -------------------------- | ------------------------- |
| 16.1 | Case board                               | `/safeguarding`            | The seeded case           |
| 16.2 | Open it                                  | `/safeguarding/cases/<id>` | Full detail               |
| 16.3 | Add a **note**                           | same                       | Note appears              |
| 16.4 | **Transition** it (OPEN → INVESTIGATING) | same                       | Status changes            |
| 16.5 | **Assign** it                            | same                       | Assignee set              |
| 16.6 | **SLA monitor**                          | `/safeguarding/sla`        | Overdue cases highlighted |
| 16.7 | Supervisor opens **Cases**               | `/supervisor/cases`        | Supervisor-scoped list    |

---

## 17. Admin console & users

| #    | Do this                                           | Where          | You should see                                              |
| ---- | ------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| 17.1 | Admin → **Overview**                              | `/admin`       | Metrics, CRM pipeline, teacher changes, hiring applications |
| 17.2 | **Users & search** → search `parent@hifzoon.test` | `/admin/users` | The user appears                                            |
| 17.3 | Change a **status** (activate/suspend)            | same           | Persists                                                    |
| 17.4 | Change **roles**                                  | same           | Role badges update                                          |
| 17.5 | Set **notification channels**                     | same           | Saved                                                       |
| 17.6 | Super admin → **Audit log**                       | `/admin/audit` | Paginated log of every admin action                         |
| 17.7 | As plain **admin**, open `/admin/audit`           | `/admin/audit` | No audit rows (super admin only)                            |

---

## 18. CRM

| #    | Do this                        | Where        | You should see                             |
| ---- | ------------------------------ | ------------ | ------------------------------------------ |
| 18.1 | **CRM**                        | `/admin/crm` | Pipeline, seeded leads and tasks           |
| 18.2 | **New lead** → fill → save     | same         | Lead appears                               |
| 18.3 | Move the lead to another stage | same         | Stage changes                              |
| 18.4 | **New task**                   | same         | Task added (an overdue one already exists) |
| 18.5 | **Complete** a task            | same         | Marked done                                |

---

## 19. Trials & placement (admin)

| #    | Do this                        | Where           | You should see |
| ---- | ------------------------------ | --------------- | -------------- |
| 19.1 | **Trials & placement**         | `/admin/trials` | Workspace      |
| 19.2 | Book a trial                   | same            | Created        |
| 19.3 | Browse open slots for matching | same            | Slot list      |
| 19.4 | Record the outcome             | same            | Saved          |
| 19.5 | Link it to a CRM lead          | same            | Lead linked    |

---

## 20. Teacher change requests

| #    | Do this                                          | Where                    | You should see          |
| ---- | ------------------------------------------------ | ------------------------ | ----------------------- |
| 20.1 | Parent, on a child → request a different teacher | `/parent/children/<id>`  | Request raised          |
| 20.2 | Admin → **Teacher changes**                      | `/admin/teacher-changes` | The seeded open request |
| 20.3 | Resolve it with a matched teacher                | same                     | Status resolved         |

---

## 21. Teacher profile

| #    | Do this                                          | Where              | You should see                                  |
| ---- | ------------------------------------------------ | ------------------ | ----------------------------------------------- |
| 21.1 | Teacher → **Today**                              | `/teacher`         | Identity status, family rating, today's classes |
| 21.2 | **Profile** → edit → submit a change request     | `/teacher/profile` | Profile saved, request raised                   |
| 21.3 | Super admin → **Teachers** → provision a teacher | `/admin/teachers`  | Teacher created                                 |
| 21.4 | Check readiness                                  | `/admin/teachers`  | Readiness state shown                           |

---

## 22. Content & FAQ

| #    | Do this                                 | Where            | You should see                  |
| ---- | --------------------------------------- | ---------------- | ------------------------------- |
| 22.1 | **Content & FAQ**                       | `/admin/content` | Posts and pending FAQ entries   |
| 22.2 | Create or edit a post                   | same             | Saved                           |
| 22.3 | Moderate the question you sent in §2.15 | same             | Approved / rejected             |
| 22.4 | Open **Resources**                      | `/resources`     | The approved question is listed |

---

## 23. Settings

| #    | Do this                                      | Where             | You should see                                  |
| ---- | -------------------------------------------- | ----------------- | ----------------------------------------------- |
| 23.1 | Super admin → **Settings**                   | `/admin/settings` | Current settings                                |
| 23.2 | Change a setting, save                       | same              | Persists after reload                           |
| 23.3 | **Clear cache** / **Purge expired** (Mushaf) | same              | Confirmation with the number of entries removed |

---

## 24. Notifications

| #    | Do this                                             | Where                                             | You should see                 |
| ---- | --------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| 24.1 | Any portal → **Notifications**                      | `/parent/notifications`, `/teacher/notifications` | List                           |
| 24.2 | Toggle email / push / WhatsApp                      | same                                              | Saved                          |
| 24.3 | Set **quiet hours**                                 | same                                              | Saved (demo seeds 21:00–07:00) |
| 24.4 | Admin → **Users** → view another user's preferences | `/admin/users`                                    | Their preferences shown        |

---

## 25. Student portal

_Sign in as `student@hifzoon.test`. If it doesn't exist, this step can't be run — see the note at the end._

| #    | Do this                                 | Where                     | You should see                 |
| ---- | --------------------------------------- | ------------------------- | ------------------------------ |
| 25.1 | Overview                                | `/student`                | Profile + inbox summary        |
| 25.2 | **Notifications**                       | `/student/notifications`  | List                           |
| 25.3 | Enter a live class                      | `/student/classroom/<id>` | Mushaf                         |
| 25.4 | Use the sidebar footer to switch portal | any portal                | Links to your other portals    |
| 25.5 | Click **Account security**              | sidebar footer            | Opens inside the student shell |

---

## 26. Cross-cutting checks

| #    | Do this                                        | Where          | You should see                                          |
| ---- | ---------------------------------------------- | -------------- | ------------------------------------------------------- |
| 26.1 | Refresh any portal page (F5)                   | any portal     | Still signed in                                         |
| 26.2 | Type a bad portal URL                          | `/parent/nope` | 404 page                                                |
| 26.3 | Sign in as teacher, try `/admin` and `/parent` | browser        | 403 on both                                             |
| 26.4 | Narrow the window to phone width, reload `/`   | browser        | Hamburger appears; content fits with no sideways scroll |
| 26.5 | Sign in on a phone-width window                | browser        | Portal sidebar is hard to reach — see Known issues      |
| 26.6 | Visit `/dashboard` as each role                | browser        | Redirects to that role's portal                         |

---

## Known issues & expected gaps

Things that look broken but are known. Confirm them, don't chase them.

| What you see                                             | Why                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| "Kids Mode sign-in is not available yet"                 | Not built yet                                                   |
| Parents/students can't enrol 2FA                         | Staff only                                                      |
| Staff are forced into a 2FA code on first sign-in        | Security requirement — enrol once, then it's cached             |
| Examiner portal is empty ("No assessments assigned yet") | No examiner endpoints yet                                       |
| No Google/Apple buttons on the login page                | Not configured locally                                          |
| Checkout completes with no real charge                   | Payments use a fake provider                                    |
| No emails arriving                                       | Mail provider is file-based in dev                              |
| Classroom updates lag by a second or two                 | Realtime socket falls back to polling                           |
| `/faculty` link shows 404                                | Dead link, should be `/teachers`                                |
| Student portal can't be signed into                      | That account is never created — no API links a child to a login |
| Portal sidebar hard to open on a phone                   | Below the large breakpoint the sidebar toggle is hard to hit    |

---

## Fastest full pass (about 10 minutes)

If you only want to see every module working once, do this:

1. **Signed out** — `/`, `/courses`, `/teachers`, `/resources`, `/pricing`, `/book-trial`
2. **Parent** — Overview, Children, Timetable, Messages, Billing, Privacy & consent, Notifications
3. **Teacher** — Today, Timetable, Availability, Students, Payslips, Profile
4. **Supervisor** — Overview, Teachers & scorecards, Class reviews, Hiring pipeline, Cases
5. **Safeguarding** — Case board, open a case, SLA monitor
6. **Admin** — Overview, Users, CRM, Trials, Teacher changes, Teachers, Scheduling, Courses, Billing, Payroll, Content & FAQ, Settings
7. **Super admin** — Audit log
