# Hifzoon — Cross-role workflow audit

**Date:** 2026-10-19 · **Branch:** `feat-frontend-ui` (working tree, read-only audit) · **Scope:** every place where one role creates something another role must see or act on, or where an action has an outcome the originator should learn about.

**Method.** Workflows were taken from every mutating route in `apps/api/src/**/*.controller.ts` and from the Prisma models that have a `status` field. For each one, the web code was read to check four things: (a) the creator's screen, how it is reached, status and cancel; (b) the reviewer's queue, the details shown, the actions available, navigation and badges; (c) how the outcome reaches the originator, by status in the UI or by a notification (the `TEMPLATE.*` call sites in `apps/api/src`); (d) the API `@Roles` compared with which portal shows the step.

**Conventions.** Web paths are relative to `apps/web/src/`. API paths are relative to `apps/api/src/`. IDs such as **M54** refer to `apps/web/docs/backendrequirement.md` (v4.6.0+). The backend asks this audit raised were copied into that file as **M56–M68** and **B38** (§9 there).

**Notification facts used throughout** (`modules/notifications/notifications.service.ts:10-28`): of the 17 templates, `class.teacher-change`, `report-card.ready`, `class.missed` and `auth.account-locked` are **never sent**. The other in-app templates go only to a class's **primary** guardian (`guardiansForClass`, `notifications.service.ts:167-183`). **No template is ever sent to a teacher about a family action**, except an enrolment pause or cancel (`courses/courses.service.ts:360-372`). In-app notifications have **no read state**: there is no read route (`notifications.controller.ts:39-51`), and the `Notification` model has no `readAt` (`prisma/schema.prisma:2211-2227`).

---

## 1. Summary

Status: **complete** = works end to end in the UI · **web gap** = the API supports it and the web is missing or hides it · **backend gap** = the web can't finish it without an API change · **both** = needs both.
Priority: **P0** fix before or around today's demo, or a safety/trust problem for real users · **P1** real users will hit it soon · **P2** polish or internal ops.

| # | Workflow | Creator | Reviewer / recipient | Status | Priority |
| :-- | :-- | :-- | :-- | :-- | :-- |
| G1 | Report a concern / complaint (safeguarding) | Parent, teacher, student | Safeguarding lead | **backend gap** (+ web copy) | **P0** |
| G2 | Teacher public-profile change → approval | Teacher | Admin | **both** (M54) | **P0** |
| G3 | Teacher-change request | Parent | Admin → parent, old and new teacher | **both** | **P0** |
| G4 | Class cancelled / rescheduled → other side told | Parent, teacher, admin | Parent / teacher | **backend gap** (defect) | **P0** |
| G5 | Notifications lead nowhere (bell, staff inbox, read state) | System | Every role | **both** | **P0** |
| G6 | Parent enrols a child → academy assigns a teacher | Parent | Admin | **web gap** (backend nice-to-have) | **P0** |
| G7 | Trial booked → outcome recorded → family told | Parent / admin | Admin → parent | **both** (M22, M25) | **P1** |
| G8 | QA review → teacher reads and replies | Supervisor | Teacher → supervisor | **backend gap** (M23) + web | **P1** |
| G9 | Teacher application → applicant outcome / account | Public applicant | Supervisor/admin → applicant | **backend gap** (+ web dead link) | **P1** |
| G10 | Public FAQ question → moderation | Visitor | Admin | **backend gap** (M31) + web | **P1** |
| G11 | Supervisor reviews or edits a lesson card | Teacher | Supervisor | **web gap** (orphan screen) | **P1** |
| G12 | Family class rating → teacher / QA learn | Parent | Teacher, supervisor | **backend gap** | **P1** |
| G13 | Teacher ↔ family / family ↔ academy messaging | Teacher, parent | Family, admin | **backend gap** | **P1** |
| G14 | Make-up credit after a cancellation | System (on cancel) | Parent | **backend gap** | **P1** |
| G15 | Lesson cards due after class (48 h clock) | System | Teacher | **both** (M20) | **P2** |
| G16 | Co-guardian invitation | Parent | Invited guardian | **backend gap** | **P2** |
| G17 | Nothing in the sidebar says something is waiting | — | Admin, supervisor, safeguarding, teacher, parent | **web gap** | **P1** |
| G18 | Smaller outcome gaps (data-export title, case assignee, enrolment-pause wording, booking notice, payslips) | various | various | mixed | **P2** |
| — | Parent ↔ teacher messaging (parent starts) | Parent | Teacher | complete (unread dots both sides) | — |
| — | Lesson card → family | Teacher | Parent (`lesson-card.ready` + Lessons tab) | complete | — |
| — | Mistakes logged → confirmed/dismissed → family | Teacher | Parent (Mistakes tab) | complete (M50 open) | — |
| — | Consent grant / withdraw → classroom recording gate | Parent | Teacher (recording control) | complete (M47 for teacher view) | — |
| — | Data export / deletion request | Parent | Worker; parent sees status and download | complete (B30 affects the link; see G18) | — |
| — | Availability → bookable slots | Teacher | Parent booking, admin scheduling | complete (M14) | — |
| — | Hiring steps, safeguarding training (staff-internal) | Supervisor/admin | Supervisor/admin | complete (B31, M45 open) | — |
| — | Cases between staff (open, note, transition, assign) | Supervisor/safeguarding | Safeguarding lead (`case.safeguarding-alert`) | complete (M28 open; assignee not told, G18) | — |
| — | CRM leads/tasks | Admin | Admin | complete (M24, M25 deferred) | — |
| — | Payroll period → payslip | Super admin | Teacher | complete, paste-ID tooling (M22) | — |
| — | Billing (checkout, subscribe, refunds, dunning) | Parent/admin | — | hidden behind `NEXT_PUBLIC_BILLING_ENABLED` (M52) | — |

---

## 2. Gaps in detail

### G1 — Report a concern / complaint · P0 · backend gap (+ web copy)

**Roles.** Creator: guardian, teacher, student. Reviewer: safeguarding lead.

**What exists**
- The API lets only staff open a case. `CasesController` is `@Roles(SAFEGUARDING_LEAD, SUPERVISOR, SUPER_ADMIN)` (`modules/qa/qa.controller.ts:153-170`). A guardian, teacher or student gets 403 on `POST /cases`.
- The published policy promises a feature that doesn't exist: *"A report button is available in every class, chat and profile (CR-08). A report opens a case with the named safeguarding lead…"* (`components/content/policy-drafts.ts:37-40`, again at `:112`, rendered at `/child-safety`).
- The parent privacy centre shows **"Open cases — Complaints or concerns you raised"** (`components/parent/PrivacyScreen.tsx:96`). The count is cases *opened by* a family member (`modules/consent/consent.service.ts:453-455`), which can only ever be 0.
- `CaseCreateForm` is mounted only inside the staff `CaseBoard` (`components/cases/CaseBoard.tsx:36`). No classroom, message or profile screen has a report action.
- A parent can message only a teacher. There is no channel to the academy at all (see G13).

**What's missing.** Every non-staff route for raising a concern, and the matching UI.

**Fix**
- **Backend (M56):** `POST /cases/report` for `GUARDIAN`, `TEACHER`, `STUDENT`, `CHILD_STUDENT`. Body: `{ type: COMPLAINT|SAFEGUARDING, description, classId?, threadId?, subjectUserId? }`. It creates the case, pages the leads (the existing `SAFEGUARDING_ALERT` path in `cases.service.ts:91`) and returns only `{ reference, receivedAt }` to the reporter. Optional: `GET /cases/mine` with status only, no notes.
- **Web, today:** the policy text claims a button that doesn't exist. Until M56 ships, either soften `policy-drafts.ts:39-40,112`, or add a "Report a concern" link (classroom toolbar, message thread header, teacher profile, parent and teacher portal footers) to a page that shows the safeguarding contact. Also relabel the `PrivacyScreen.tsx:96` tile or hide it while it can only be 0.
- **Web, after M56:** a `ReportConcernModal` reused in `ClassroomRoom`, `MessagesWorkspace` thread header, `/teachers/[userId]` and both portal shells.

### G2 — Teacher public-profile change → approval · P0 · both (backend M54)

**Roles.** Creator: teacher (`PATCH /teachers/me/profile`, TEACHER). Reviewer: `POST /teachers/profiles/:profileId/review` is `@Roles(ADMIN, SUPER_ADMIN)` (`modules/teachers/teachers.controller.ts:190-221`).

**What exists**
- *Creator:* `/teacher/profile` is in the nav (`lib/portal/nav.ts:71`). It shows the "Submitted for approval — awaiting review: …" banner from `GET /teachers/me` (`components/teacher/ProfileScreen.tsx:50,76,146-155`).
- *Reviewer:* "Approve staged changes / Reject staged changes" buttons with no content (`components/admin/teachers/TeacherProfileTools.tsx:130-185`). They are reachable in two places:
  - Admin → Teachers → an application → "Teacher profile", after **pasting a profile reference** (`components/admin/teachers/ApplicationDetailView.tsx:334-361`).
  - Admin → Teachers → "Teacher readiness & profile" tab (`components/admin/teachers/TeachersHub.tsx:63-82`). Its picker lists only teachers who already hold an enrolment (`components/admin/shared/Pickers.tsx:160-166`), so a newly hired teacher, who is exactly the one editing their profile, has to be pasted in.
- *API:* nothing returns `pendingProfileChanges` to staff, and nothing lists teachers who have some. Reject clears the staged JSON with no reason and no notification (`modules/teachers/teachers.service.ts:457-494`).

**What's missing**
- (b) A queue, the diff, a badge.
- (c) The teacher can't tell approved from rejected. In both cases the banner just disappears.
- A stale help text: `TeacherProfileTools.tsx:159` says approval applies "only bio, photo, intro video, recitation sample and qualifications". The API now applies `languages`, `subjects` and `ageGroups` too (`teachers.service.ts:664-674`, B2).
- The teacher can't withdraw a staged change.

**Fix**
- **Backend: M54** covers the queue and the diff (`GET /teachers/profile-changes` with `changes` and `current`). Add **M57**:
  - Store the review outcome: `profileChangeReviewedAt`, `profileChangeOutcome`, `profileChangeReason`, returned by `GET /teachers/me`.
  - Accept an optional `reason` on reject.
  - Notify the teacher on approve/reject, and notify admins on submit.
  - `DELETE /teachers/me/profile/pending` so the teacher can withdraw.
  - B33 still applies to clearing list fields.
- **Web, now:**
  1. Fix the stale copy at `TeacherProfileTools.tsx:159`.
  2. Make the teacher picker in `TeachersHub` also offer cleared teachers from `GET /teachers/public` (`useTeachers`), so most teachers can be chosen without pasting.
  3. Name the reject result clearly in the toast and the confirm dialog: "the teacher is not told".
- **Web, after M54:** a "Profile changes" queue. Either a tab on `/admin/teacher-changes`, renamed "Change requests", or a new `/admin/teachers?tab=profile-changes`. Show a before/after diff per field, with Approve and Reject (with a reason). Add an overview card in `AdminOverview.tsx` next to `TeacherChangesCard` (`:57`), and a nav badge (G17).

### G3 — Parent teacher-change request · P0 · both

**Roles.**
- `POST /teacher-changes`: GUARDIAN.
- `GET /teacher-changes`: GUARDIAN (own family only, M15), ADMIN, SUPER_ADMIN.
- `POST /teacher-changes/:id/resolve`: **ADMIN/SUPER_ADMIN only**, statuses APPROVED/DECLINED/CANCELLED (`modules/admissions/admissions.controller.ts:155-200`).

**What exists**
- *Creator:* the only entry is Children → child → **Courses** tab → "Request teacher change". It is shown only for ACTIVE/TRIAL enrolments with a teacher (`components/parent/ChildCourses.tsx:162-172`). The status line "Teacher change requested … [badge]" is on the same card (`:117-122`).
  - The parent Overview lists every course "with <teacher>" but has no change action and no request status (`components/parent/ParentOverview.tsx:199-233`).
  - The tab can be deep-linked (`?tab=courses`, `ChildDetail.tsx:35,56`), but nothing links to it for this purpose.
- *Reviewer:* `/admin/teacher-changes` is in the nav (`nav.ts:109`). The overview card shows open requests (`AdminOverview.tsx:166-200`). The drawer shows the reason, the enrolment and matching suggestions, with Approve (with successor), Decline and Cancel (`components/admin/teacher-changes/TeacherChangesQueue.tsx:94-246`). This side is solid.
- *Outcome:* the parent sees only a status badge on the Courses tab. `class.teacher-change` is defined but never sent (`notifications.service.ts:19`). The 4.2.0 reply to M40 said *"teacher change is still manual"*. `resolveTeacherChange` sends nothing to the parent, the old teacher or the new teacher (`modules/admissions/admissions.service.ts:408-479`; that file has no notifications import, `:1-8`). The resolve body has no note field (`admissions.controller.ts:78-85`), so a decline arrives with no explanation.

**What's missing**
- (a) A discoverable entry point, and a cancel for the parent. The API doesn't allow a guardian to cancel.
- (c) Any notification, and a reason for the decision.
- The new teacher isn't told they have a new student, and the old teacher isn't told the student left.

**Fix**
- **Web (now):**
  1. On each course row in `ParentOverview.tsx:212-229`, add a "Request a different teacher" link to `/parent/children/{id}?tab=courses&change={enrolmentId}`. Have `ChildCourses` open `TeacherChangeModal` when `change` is present.
  2. Show the open request's status badge on the Overview row (the data is already in `useMyTeacherChanges`).
  3. Add a "Requests" section, or a tab on `/parent/children`, listing all of the family's requests with their status.
  4. Rename the button to "Change teacher" so it can be found by scanning.
- **Backend (M58):**
  - Allow a GUARDIAN to cancel their own OPEN request: `POST /teacher-changes/:id/cancel`, or let `resolve` accept `CANCELLED` from a guardian of that family.
  - Add `resolutionNote` to resolve and return it in `GET /teacher-changes`.
  - Send `class.teacher-change` to the primary guardians on every resolution, and to the old and new teacher on APPROVED.
  - Notify admins on a new request.

### G4 — Class cancelled / rescheduled → the other side · P0 · backend gap (defect)

**Roles.** Cancel and reschedule: GUARDIAN, TEACHER, ADMIN, SUPER_ADMIN (`modules/scheduling/scheduling.controller.ts:197-243`).

**What exists**
- The web has cancel and reschedule for the parent (`components/parent/ClassModals.tsx`, timetable) and the teacher (`components/teacher/ClassDetailModal.tsx:118,192`).
- **Defect:** `cancel` deletes the class's `ClassStudent` rows (`scheduling.service.ts:632`) and **then** calls `notifyClassGuardians` (`:640`). That looks recipients up through `ClassStudent` (`notifications.service.ts:167-176`), so it finds none and **the `class.cancelled` notification is never queued for any class cancellation**. This is the same root cause as B29.
- The teacher's cancel dialog tells them *"The family is notified and receives a make-up credit"* (`ClassDetailModal.tsx:154`). Both halves are currently untrue in effect (for the credit, see G14).
- Teachers are never notified when a family cancels or reschedules: `notifyClassGuardians` is the only producer (`scheduling.service.ts:640,808`). The teacher's timetable also hides cancelled classes (B29), so the class just vanishes.

**Fix**
- **Backend (B38):**
  - Resolve the recipients before deleting the rows, or keep the rows (the B29 fix).
  - Notify the class teacher when the family or an admin cancels or reschedules.
  - Notify all guardians, not only the primary one.
- **Web:** no web fix is possible. Until B38 ships, change the `ClassDetailModal.tsx:154` copy to "The family will see this on their timetable."

### G5 — Notifications are not actionable · P0 · both

**What exists**
- The header bell lists the five newest items. They are plain `<li>`s with no link and no "see all" (`components/portal/NotificationBell.tsx:54-63`). The gold dot shows whenever `total > 0`, so once anyone has a single notification it never goes out (`:15,35`).
- `/parent/notifications`, `/teacher/notifications` and `/student/notifications` exist. **Admin, supervisor and safeguarding have no notifications page and no nav item** (`nav.ts:75-119`). A safeguarding lead's `case.safeguarding-alert` (payload has `caseId`, `cases.service.ts:91-99`; escalation `worker/processors/billing.processor.ts:283-292`) shows only as an unclickable line in the bell.
- The payloads already carry the ids a deep link needs:
  - `caseId` in safeguarding alerts.
  - `threadId` in `message.new` (`parent-portal/messaging.service.ts:257-261`).
  - `lessonCardId` in `lesson-card.ready` (`worker/processors/lesson-card.processor.ts:84-91`).
  - `joinUrl` in reminders.
- `consent.data-request` is titled "Data request received" (`lib/api/modules/notifications.ts:76`), but it is sent only when the export is **ready** (`worker/processors/data-request.processor.ts:163-181`).

**Fix**
- **Web (now):**
  1. Add `hrefForNotification(n, portal)`: `caseId` → `/safeguarding/cases/:id` (or `/supervisor/cases/:id`), `threadId` → `/{parent|teacher}/messages/:id`, `lessonCardId` → `/parent/children/:sid?tab=lessons&card=:id` (look up the student from the card), `joinUrl`/`classId` → `/classroom/:id`, data request → `/parent/privacy`.
  2. Make bell items and `NotificationsCenter` rows links.
  3. Add "See all" to the bell when the portal has a notifications page.
  4. Add a Notifications nav item and page for `admin`, `supervisor` and `safeguarding` (reuse `NotificationsCenter`).
  5. Retitle `consent.data-request` to "Your data export is ready".
  6. Until read state exists, base the dot on "newer than the last time the bell was opened" (localStorage timestamp).
- **Backend (M59):** `POST /notifications/:id/read`, `POST /notifications/read-all`, and `unread` in the `GET /notifications` meta (needs `readAt` on `Notification`).

### G6 — Parent enrols a child → the academy assigns a teacher · P0 · web gap

**Roles.** `POST /courses/enrolments`: GUARDIAN, ADMIN, SUPER_ADMIN (`modules/courses/courses.controller.ts:87-97`).

**What exists**
- *Creator:* Children → child → Courses → "Enrol in a course". It sends only `{ studentId, courseId }` (`components/parent/ChildCourses.tsx:367-382`) and toasts *"The academy will match a teacher."* The enrolment is created as `TRIAL` with `teacherId: null` (`courses/courses.service.ts:213-219`).
- The card then shows "Not assigned yet — the academy will match a teacher" with no Book and no Change action (`ChildCourses.tsx:97,131-133`).
- *Reviewer:* nothing tells an admin. Admin → Courses → Enrolments lists rows with "Unassigned" in the teacher column, but can't filter on it (`components/admin/courses/EnrolmentsPanel.tsx:45-80,153`). The overview has no card for it.
- The way to assign exists but is hidden: posting `POST /courses/enrolments` again **with `teacherId`** upgrades the TRIAL row in place (`courses.service.ts:186-199`). The admin form does this only from a **pasted teacher profile UUID** (`EnrolmentsPanel.tsx:403-455`).
- No notification goes to the admin on enrolment, or to the parent or teacher on assignment.

**Fix**
- **Web (now):**
  1. Add an "Awaiting a teacher" filter to `EnrolmentsPanel` (client-side `teacher == null` on status TRIAL/ACTIVE).
  2. Add an "Assign teacher" row action. It opens the matching suggestions (`useAdminMatching(studentId, courseId)`, already used in `TeacherChangesQueue.tsx:100`) and posts `POST /courses/enrolments { studentId, courseId, teacherId, status: 'TRIAL' }`.
  3. Add an "Enrolments awaiting a teacher" card to `AdminOverview.tsx` and a nav badge (G17).
- **Backend (M60, optional):** an explicit `PATCH /courses/enrolments/:id/teacher` (admin) that notifies the family and the teacher, and an admin notification when a family self-enrols.

### G7 — Trials: booked → outcome → family · P1 · both (M22, M25)

**Roles.**
- `POST /trials` and `POST /trials/:classId/outcome`: ADMIN/SUPER_ADMIN.
- Family self-booking via `POST /scheduling/book` (type TRIAL): GUARDIAN.

**What exists**
- *Parent self-booked trial* (`/book-trial`, `components/booking/BookingFlow.tsx`): this creates a TRIAL enrolment and a class, and sends `trial.booked` to the guardian (`scheduling.service.ts:404-412`). That notice goes out for **every** booking type, with empty `studentName` and `teacherName`. No CRM lead is created (M25), and the admin isn't told.
- *Admin* "Record outcome" finds trials only through CRM leads that carry a `trialClassId`, or a pasted class reference (`components/admin/trials/TrialsWorkspace.tsx:481-498`). There is no trial-class list (M22). **A family's self-booked trial is therefore invisible to admin, and its outcome can never practically be recorded**, so the enrolment stays TRIAL.
- *Admin-booked trial* (`admissions.service.ts:54-196`): no notification to the family or the teacher, and no reminders. The service has no notifications or reminders dependency (`:1-8`).
- *Outcome:* the enrolment flips to ACTIVE or CANCELLED (`admissions.service.ts:314-318`), but `placementLevelId` isn't applied to the enrolment's `currentLevelId`. The parent gets no notification and no view of the outcome, placement or notes.
- The `subscribeToken` the admin is told to "send to the family" (`TrialsWorkspace.tsx:589-601`) is consumed by no API route (`grep subscribeToken apps/api/src` → only `admissions.service.ts`). This is hidden while billing is off.

**Fix**
- **Backend:** M22 (trial list) and M25 (auto-create leads, which would make self-booked trials appear in CRM), plus **M61**:
  - Notify the family and the teacher when an admin books a trial, and plan reminders.
  - On outcome, set `enrolment.currentLevelId = placementLevelId`, send a "trial result" notification, and expose the outcome (won/lost, level, family-safe notes) on the guardian's enrolment.
  - Send `trial.booked` only for TRIAL, with names filled.
- **Web (now):** in the admin Scheduling or Trials workspace, show trial classes from the teacher timetables the admin can already read (`GET /scheduling/teachers/:id/timetable`, rows with `type: 'TRIAL'`) as a "Trials awaiting an outcome" list feeding `RecordOutcome`. Today the admin has to know which teacher to look at, so this is a stopgap until M22.

### G8 — QA review → teacher reads and replies · P1 · backend gap (M23) + web

**Roles.** `POST /qa/classes/:classId/review`: SUPERVISOR/SUPER_ADMIN. `POST /qa/reviews/:id/reply`: TEACHER (`qa.controller.ts:90-121`).

**What exists**
- The supervisor submits reviews (`/supervisor/reviews`).
- The teacher has **no screen**: `useReplyToQaReview` is defined but used nowhere (`hooks/useTeacher.ts:124-130`). It is the only workflow hook in `hooks/` with no caller. No API lets a teacher list their own reviews (M23), and no notification is sent.
- The supervisor overview flags teachers with "N awaiting reply" (`app/supervisor/page.tsx:48,111-125`, from `scorecard.awaitingReply`, `qa.service.ts:391`). Teachers can't reply, so these flags never clear.

**Fix**
- **Backend:** M23 (teacher's own reviews list), plus **M62**: notify the teacher when a review is submitted, and the supervisor when the teacher replies.
- **Web (now):** remove "awaiting reply" from the "Needs attention" rule (`app/supervisor/page.tsx:48`), or label it "teachers can't reply yet".
- **Web (after M23):** a "Feedback" item in the teacher nav, with a review list and a reply form using the existing hook.

### G9 — Teacher application → applicant · P1 · backend gap (+ web dead link)

**Roles.** `POST /teachers/applications` is `@Public()`. Steps: ADMIN/SUPER_ADMIN/SUPERVISOR (`teachers.controller.ts:73-176`).

**What exists**
- The success screen promises *"Qualified candidates receive an invitation for Stage 2 within 48 to 72 business hours"* and links to **`/faculty`, which doesn't exist** (`app/apply-teacher/page.tsx:494-501`; also `:397` and `app/resources/[slug]/page.tsx:252`).
- The applicant gets no confirmation, no status page and no outcome. No template exists for these.
- A **public** application has `userId = null`. Approving it only flips `hiringStatus` when a `userId` exists (`teachers.service.ts:298-310`), so **an approved public applicant never gets an account**. The admin view says "No teacher account is linked… A super admin can provision one" (`ApplicationDetailView.tsx:334-338`).
- Provisioning creates a **second, separate application** for the same person (`modules/admin/admin-console.service.ts:305-316`), so the reviewed application and the teacher's account are never joined. This is related to M27 (deferred).

**Fix**
- **Web (now):** change the three `/faculty` links to `/teachers`. Soften the "48 to 72 business hours" promise, or keep it only if ops commits to emailing manually.
- **Backend (M63):**
  - Send an application-received email.
  - Email the applicant when a step fails (REJECTED) or the application is APPROVED.
  - On approval of an application without `userId`, create the TEACHER account and its profile, link `userId`, and send a set-password invite. Provisioning should reuse an open application for the same email instead of creating one.
  - Covers M45 too (audition → sample).

### G10 — Public FAQ question → moderation · P1 · backend gap (M31) + web

**What exists**
- An "Ask a question" form is on the home page and `/resources` (`components/home/FAQSection.tsx:108`, `app/resources/page.tsx:140`). It calls the public `POST /faq`, which stores `approved: false` (`modules/admissions/cms.service.ts:195-201`) with **no audit row** (no `@Audit` at `admissions.controller.ts:228`).
- Admin "FAQ moderation" can only approve or reject a **pasted** id. The hint says to find it "on the suggestion's entry in the audit log" (`components/admin/content/ContentConsole.tsx:357`), but there is no such entry, and the audit log is SUPER_ADMIN-only (`nav.ts:117`). There is no answer field (M31). **Submitted questions can't be found by anyone.**

**Fix**
- **Web (now):** hide `FaqAskForm` in both places until M31, or replace it with a link to a contact address. Fix the misleading hint at `ContentConsole.tsx:357`.
- **Backend:** M31 (pending queue + `answer`). Optionally M64: audit `POST /faq`.

### G11 — Supervisor lesson-card review is an orphan screen · P1 · web gap

**What exists**
- `/supervisor/lesson-cards/[lessonCardId]` renders `LessonCardDetail` for "edit locked lesson cards with an audited reason (FR-REC-08)" (`app/supervisor/lesson-cards/[lessonCardId]/page.tsx`). **Nothing links to it.** A grep for `/supervisor/lesson-cards` in `components/` and `app/` finds no link.
- The supervisor can see classes (`app/supervisor/teachers/[teacherId]/page.tsx:138-170`) and review them (`/supervisor/reviews`), but never the lesson card for that class.
- The API allows it: `GET /students/:id/lesson-cards` admits staff, including SUPERVISOR (`lessons/lesson-cards.service.ts:567`; `common/services/policy.service.ts:7`).

**Fix (web only).** On `/supervisor/reviews` (step 2) and on the teacher detail "Classes" card:
- For each class row, load `GET /students/:studentId/lesson-cards` for its student(s).
- Link the card whose `classId` matches to `/supervisor/lesson-cards/:id` ("Lesson card"), or show "No card yet".
- Reviewing a lesson is much stronger with the card next to the rubric.

### G12 — Family class rating → teacher / QA · P1 · backend gap

**What exists**
- Parents rate completed classes from the timetable (`components/parent/TimetableScreen.tsx:166-171`, `ClassModals.tsx:340-390`), with stars and an optional comment of up to 2000 characters (`qa.controller.ts:12-17`).
- The teacher (`ProfileScreen.tsx:125-137`), the supervisor (`supervisor/teachers/[teacherId]/page.tsx:114`) and the public see only the average and the distribution (`qa.service.ts:144-166`).
- **The comment is returned only to the family's own report card** (`parent-portal/parent-portal.service.ts:380-383`). There is no low-rating alert.
- B37 lets families rate classes that never happened.

**Fix**
- **Backend (M65):** `GET /quality/teachers/:teacherId/ratings` (SUPERVISOR/SUPER_ADMIN; TEACHER for their own, anonymised) with comments. Notify the supervisor on ratings of 2 stars or fewer.
- **Web after:** a "Recent family feedback" list on the supervisor teacher page and the teacher profile.

### G13 — Teacher → family and family → academy messaging · P1 · backend gap

**What exists**
- Only a guardian can open a thread (`POST /parent/threads`, `parent-portal.controller.ts:86-95`). The teacher controller has no POST thread route (`parent-portal/teacher-messaging.controller.ts:24-60`). The web hides compose on the teacher side accordingly (`components/messaging/MessagesWorkspace.tsx:35`).
- A teacher's student page can link to a conversation only if the family has already started one (`components/teacher/StudentDetailScreen.tsx:353-405`).
- There is no thread type for "the academy" or admin. A parent with a billing, scheduling or complaint question has no in-app channel (ties into G1).

**Fix.** **Backend (M66):**
- `POST /teacher/threads { studentId }`: the teacher's own students only (M47 scope).
- An academy/support thread type that admins can read and answer, plus an admin inbox.

The web side is small: enable compose for `side="teacher"` and add a "Message family" button on `StudentDetailScreen`.

### G14 — Make-up credits are created but unusable · P1 · backend gap

**What exists**
- A teacher/admin cancellation, or an early family cancellation, creates `MakeupCredit` rows (`scheduling.service.ts:617,696-705`). The web reports "N make-up credit(s)" in the cancel results (`ClassModals.tsx:152-153`, `ClassDetailModal.tsx:140-141`). Pricing promises *"keep a make-up credit"* (`app/pricing/page.tsx:60`, `components/home/PricingSection.tsx:53`).
- No route lists, shows or redeems credits. The only `makeupCredit` use in `apps/api/src/modules` is `createMany`. Booking `type: 'MAKEUP'` doesn't consume one.

**Fix.** **Backend (M67):** `GET /families/:id/makeup-credits`, and make `POST /scheduling/book { type: 'MAKEUP' }` consume an AVAILABLE credit. The web then shows the balance on Timetable/Billing and offers "Book a make-up class".

### G15 — Lesson cards due after class · P2 · both (M20)

**What exists.** The teacher's Today screen lists today's and the coming week's classes (`components/teacher/TodayScreen.tsx:93-120`). Timetable rows carry no lesson-card state (`scheduling.service.ts:1100-1160`), so a teacher can't see which finished classes still need a card before the 48-hour lock.

**Fix**
- **Web (now):** a "Recent classes" card on Today: past 3 days from `useTeacherTimetable`, each with a "Write lesson card" link to `/teacher/classroom/:id/lesson-card`.
- **Backend:** M20 (own unshared cards), or add `lessonCard: { id, sharedAt } | null` to the teacher timetable rows (M68) so the card can say "done" or "due".

### G16 — Co-guardian invitation · P2 · backend gap

**What exists.** `POST /families/:id/guardians` creates a passwordless account and sends nothing (`modules/families/families.service.ts:186-215`). The web tells the inviter to have them use "Forgot password" (`components/parent/GuardianPanels.tsx:176-178`). Secondary guardians also never receive class notifications, because recipients are primary-only (`notifications.service.ts:172`).

**Fix.** Backend: send an invite email with a set-password link (fold into B38/M66 or a new item). Web: nothing until then.

### G17 — Nothing tells a reviewer that something is waiting · P1 · web gap

**What exists.** `PortalNavItem` has no badge field (`lib/portal/nav.ts:7-16`). `PortalShell` renders labels only (`components/portal/PortalShell.tsx:94`). Counts exist only as overview cards (admin: teacher changes and applications, `AdminOverview.tsx:57-58`; supervisor: open cases), and only if the user opens the overview.

**Fix (web only).** Add `badgeQuery?: () => number | undefined` (or a `badge` key resolved in `PortalShell`). Show:
- Admin → Teacher changes: OPEN count (`useTeacherChanges('OPEN')`).
- Admin → Teachers: applications in progress, plus profile changes after M54.
- Admin → Courses: enrolments awaiting a teacher (G6).
- Supervisor/Safeguarding → Cases / Case board: open or overdue (`useCases`).
- Parent and teacher → Messages: unread threads (the thread list already drives unread dots, `docs/audit.md:161`).

### G18 — Smaller outcome gaps · P2

| Item | Evidence | Fix |
| :-- | :-- | :-- |
| Data-export notice titled "received" | `lib/api/modules/notifications.ts:76`; sent on completion, `data-request.processor.ts:163-181` | Web: retitle (G5). B30 still breaks the download link. |
| Case owner not told when assigned | `qa.controller.ts:220-232` → `cases.assign`, no notification | Backend: notify `ownerId` (add to M28). |
| Enrolment pause/cancel tells the teacher "cancelled by the academy" even when the family did it | `courses/courses.service.ts:360-372` (reuses `class.cancelled`, `cancelledBy: 'the academy'`) | Backend: a dedicated template with the real actor. |
| Every booking notice says "Trial class booked", with empty names | `scheduling.service.ts:404-412` | Backend (M61). |
| Teacher not told a payslip is ready | `billing.controller.ts:241-262`, no template | Backend (low). Web: none. |
| Examiner portal is a dead end | `nav.ts:79-87` (EXAMINER sees only Overview); M41 deferred | Web: the overview already says "No assessments assigned yet". Acceptable for the demo. |
| `report-card.ready`, `class.missed` never sent | `notifications.service.ts:17-18` | Backend: a monthly report-card producer, and `class.missed` once B37 sets `NO_SHOW_*`. |

---

## 3. Screens, links and API capabilities with no way in

**Screens not linked from any navigation or page**
- `/supervisor/lesson-cards/[lessonCardId]`: no inbound link (G11).
- Admin profile-change review is reachable only after pasting a profile UUID for most new teachers (G2).

**Dead links**
- `/faculty` (404) at `app/apply-teacher/page.tsx:397,501` and `app/resources/[slug]/page.tsx:252`. Should be `/teachers`.

**Portal nav items.** Every `href` in `lib/portal/nav.ts` has a page. No nav item 404s. Functional dead ends behind a nav item:
- Supervisor → Overview for EXAMINER (M41).
- Admin → Content & FAQ → FAQ moderation, which can't find pending items (G10).
- Admin → Billing / Payroll tools, which take pasted ids (M22). Billing is hidden by flag.

**API capabilities with no usable UI.** `api-coverage.md` counts these as "called", but they aren't discoverable:
- `POST /qa/reviews/:id/reply`: hook only (G8).
- `POST /faq-admin/:id/moderate`: needs an id nobody can see (G10).
- `POST /teachers/profiles/:id/review`: blind and paste-gated (G2).
- `POST /courses/enrolments` with `teacherId` as "assign teacher": works, but only with a pasted UUID (G6).
- `POST /trials/:classId/outcome` for self-booked trials: no way to find the class (G7).

**Schema with no routes.** `SubstituteOffer`, `TrainingAssignment` (read only by the approval check), `DailyPlan`, `Goal`, `PracticeAssignment`, `Sponsorship` and `TeacherResponseStatus` have no write or read routes, so no UI is expected. `MakeupCredit` is written but never readable (G14).

---

## 4. New backend asks (now in `backendrequirement.md` §9)

| Temp ID | Ask | Gap |
| :-- | :-- | :-- |
| M56 | Non-staff `POST /cases/report` (+ optional `GET /cases/mine`) | G1 |
| M57 | Profile-change outcome stored + notified; reject reason; teacher withdraw | G2 (with M54) |
| M58 | Guardian cancel of own OPEN teacher-change; `resolutionNote`; send `class.teacher-change` to family, old and new teacher; notify admins on new request | G3 |
| B38 | **Defect:** cancel notification queued after `ClassStudent` rows are deleted, so nobody is notified. Also notify the teacher on family/admin cancel and reschedule, and notify all guardians | G4, G16 |
| M59 | Notification read state (`readAt`, mark read, unread count) | G5 |
| M60 | `PATCH /courses/enrolments/:id/teacher` + notifications; admin notice on family self-enrolment | G6 |
| M61 | Admin trial booking notifies and plans reminders; outcome applies placement, notifies, and is visible to the guardian; `trial.booked` only for TRIAL with names | G7 |
| M62 | Notify the teacher on a QA review and the supervisor on a reply | G8 |
| M63 | Applicant emails; approval of a public application creates and invites the teacher account; provisioning reuses the open application | G9 |
| M64 | Audit `POST /faq` | G10 |
| M65 | Rating comments for supervisor/teacher; low-rating alert | G12 |
| M66 | Teacher-initiated threads; family ↔ academy support threads | G13 |
| M67 | List and redeem make-up credits | G14 |
| M68 | Lesson-card state on teacher timetable rows | G15 |

---

## 5. Web-only fixes, in suggested order

Ordered by demo impact divided by effort. None of these needs an API change.

- [x] **1. Dead `/faculty` links → `/teachers`** (`app/apply-teacher/page.tsx:397,501`, `app/resources/[slug]/page.tsx:252`). Minutes.
- [x] **2. Remove false promises in copy:** *Done 2026-10-19; the `TeacherProfileTools.tsx` field list was already fixed, so it was skipped.*
  - "report button in every class, chat and profile" (`components/content/policy-drafts.ts:39-40,112`). Replace with the safeguarding contact.
  - "The family is notified…" (`components/teacher/ClassDetailModal.tsx:154`).
  - Stale approval field list (`components/admin/teachers/TeacherProfileTools.tsx:159`).
  - FAQ hint pointing at the audit log (`components/admin/content/ContentConsole.tsx:357`).
  - "Open cases you raised" tile (`components/parent/PrivacyScreen.tsx:96`).
  - "Data request received" title (`lib/api/modules/notifications.ts:76`).
- [x] **3. Hide the public "Ask a question" form** (`components/home/FAQSection.tsx:108`, `app/resources/page.tsx:140`) until M31. Questions go nowhere today. *Done: gated by `FAQ_ASK_ENABLED` in `lib/features.ts`.*
- [x] **4. Teacher change visible from the parent Overview:** on each course row in `components/parent/ParentOverview.tsx:212-229`, show the request status badge and a "Change teacher" link to `?tab=courses&change=<enrolmentId>`. Make `ChildCourses` auto-open `TeacherChangeModal` from that param.
- [x] **5. Clickable notifications:** `hrefForNotification()` for `caseId`, `threadId`, `lessonCardId`, `joinUrl`/`classId` and data requests. Use it in `NotificationBell.tsx:54-63` and `NotificationsCenter`. Add "See all", and base the dot on "newer than last opened". *Done: `lib/portal/notification-links.ts`. Lesson cards go via `/parent/lesson-cards/:id` (the payload has no student id); class cancel/reschedule payloads have no class id, so they open the timetable.*
- [x] **6. Notifications page + nav item for admin, supervisor and safeguarding** (reuse `NotificationsCenter`; add to `lib/portal/nav.ts`). Safeguarding alerts get a home.
- [x] **7. "Awaiting a teacher" enrolments:**
  - A filter and an "Assign teacher" action (matching suggestions → `POST /courses/enrolments` with `teacherId`, `status: 'TRIAL'`) in `components/admin/courses/EnrolmentsPanel.tsx`.
  - An overview card in `components/admin/overview/AdminOverview.tsx`.
- [x] **8. Nav badges** (`PortalNavItem.badge` resolved in `PortalShell.tsx:94`): teacher changes OPEN, applications in progress, enrolments awaiting a teacher, open/overdue cases, unread message threads. *Done: all five, from list endpoints the portals already call; no new endpoints needed. Desktop sidebar can also collapse to an icon rail (badges become dots).*
- [x] **9. Supervisor → lesson card links** from `/supervisor/reviews` and `app/supervisor/teachers/[teacherId]/page.tsx` class rows, via `GET /students/:id/lesson-cards` matched on `classId`. *Done, but `GET /students/:id/lesson-cards` does not return `classId`, so the link uses `GET /classes/:id/lesson-card/prefill` (its 409 carries the submitted card id). SUPER_ADMIN gets 403 there, so the link is hidden for them.*
- [x] **10. Teacher picker without pasting:** merge cleared teachers from `GET /teachers/public` into `TeacherPicker` (`components/admin/shared/Pickers.tsx:160-166`), so profile tools and enrolment assignment can find new teachers.
- [x] **11. Supervisor "awaiting reply" flag:** drop it from the "Needs attention" rule (`app/supervisor/page.tsx:48`) until teachers can reply (M23).
- [x] **12. Teacher "Recent classes → write lesson card" card** on `components/teacher/TodayScreen.tsx`.
- [x] **13. Trials awaiting an outcome (stopgap for M22):** list `type: 'TRIAL'` classes from teacher timetables in `components/admin/trials/TrialsWorkspace.tsx`, feeding `RecordOutcome`. *Done as "Recent trial classes" (past 21 days, all cleared teachers). The timetable cannot say whether an outcome was already recorded; re-recording returns the original.*
- [x] **14. A family "Requests" view** listing every teacher-change request with its status (data from `useMyTeacherChanges`). Add cancel once M58 ships. *Done as a card on `/parent/children`, shown once the family has a request. No cancel until M58.*

Backend items to raise first, for real users: **B38** (cancellations notify nobody), **M56** (no way to report a concern), **M54 + M57**, **M58**, **M63**.
