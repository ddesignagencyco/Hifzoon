# API Coverage — Web vs Backend

**Checked:** 2026-10-30 on `full-site-regression` · **Spec source:** live `GET http://localhost:4000/api/docs-json` (212 operations) · **Web source:** `apps/web/src`

## How this was checked

1. **Spec.** Every operation (method + path) was read from the running API's OpenAPI document: 212 operations.
2. **Web calls.** A script pulled every `http.get/post/put/patch/delete(...)` and `apiRequest(...)` call from `apps/web/src`, normalised path parameters and matched them to the spec. Calls built through a path helper (for example `` `${base(id)}/state` ``) were matched by their path suffix, and the few left over (`/notifications`, `/parent/threads`, `/teacher/threads`, `/hifz/students/:id/pages`, `PATCH /lesson-cards/:id`) were checked by hand: each has a client function.
3. **Result.** 208 of 212 operations have a web client function. The other 4 are webhooks that Stripe, LiveKit and Meta call; the browser never does.
4. **Screens.** For the 19 operations added on this branch, the page that uses each one is listed below; each was opened in the browser on 2026-10-30 except where noted. The per-endpoint "Used by" columns for older operations are from the 2026-10-29 pass and were not re-traced.
5. **Build and tests.** `tsc --noEmit` is clean in web and API. Web: 598 Vitest tests in 95 files pass. API: 482 Jest tests pass. ESLint: 0 errors (34 warnings) in web.

## Summary

| Status | Count | Meaning |
|:--|--:|:--|
| ✅ Wired | 207 | Client function exists and a page uses it |
| 🟡 Client only | 1 | `POST /notifications/devices`: push registration for a mobile app that does not exist yet |
| ➖ Server-to-server | 4 | Webhooks called by Stripe, LiveKit and Meta, never by the browser |
| ❌ Broken / ⛔ Missing | 0 | |
| **Total** | **212** | |

---

## What changed on `full-site-regression` (19 new operations)

| Area | Endpoints | Web client | Where in the UI |
|:--|:--|:--|:--|
| Recurring billing | `POST /billing/subscriptions/{id}/sync`, `…/change-plan`, `…/keep`, `…/weekly-times` | `billingFamilyApi.sync`, `.changePlan`, `.keep`, `.weeklyTimes` | Parent → Billing: checkout return sync, Change plan, Keep my plan, Change weekly times |
| Card and receipts | `POST /billing/portal` | `billingFamilyApi.portal` | Parent → Billing → "Card and receipts" (Stripe customer portal) |
| Post-trial offer | `GET /billing/offers` | `billingFamilyApi.offers` | Parent → Billing banner and `/parent/continue/{trialOutcomeId}` |
| Price editor | `GET/PUT /admin/billing/prices`, `POST /admin/billing/plans`, `PATCH /admin/billing/plans/{id}` | `billingAdminApi.prices`, `.setPrice`, `.createPlan`, `.updatePlan` | Admin → Billing → Plans & prices |
| Pickers instead of pasted ids | `GET /admin/billing/lookups` | `billingAdminApi.lookups` | Admin → Invoices & refunds: invoice table, refund (with refundable balance), write-off and issue-invoice pickers |
| Trials | `GET /trials` | `admissionsAdminApi.listTrials` | Admin → Trials & placement → Trial results (not opened in the browser yet: needs a 2FA admin login) |
| Trial result edit | `GET/PATCH /trials/{classId}/outcome` | `admissionsAdminApi.getTrialOutcome`, `.editTrialOutcome` | Trial results "View / edit", teacher class detail "Trial result" |
| Recording | `POST /classroom/classes/{classId}/recording/stop`, `GET …/recording` | `classroomApi.stopRecording`, `.recording` | Classroom Stop button and lesson-card player; hidden until `NEXT_PUBLIC_RECORDING_ENABLED=true` |
| Audit filters | `GET /admin/audit/facets` | `auditApi.facets` | Admin → Audit log: "Done by" and "Record type" dropdowns |
| Schedules | `GET /scheduling/schedules` | `schedulingAdminApi.listSchedules` | Admin → Scheduling → View a schedule (dropdown) |
| Payroll periods | `GET /payroll/periods` | `payrollAdminApi.periods` | Admin → Payroll → period chooser |

Response shapes that changed (existing operations):

- `GET /billing/family`: each subscription now has `usage` (classes taught, still to come, missed by the student, missed by the teacher in the current period).
- `GET /admin/billing/lookups`: invoices carry `dueAt`, `paidAt`, `hostedUrl`, `source` (`CARD`/`MANUAL`); payments carry `refundedMinor` and `refundableMinor`.
- `GET /billing/plans/{id}/price` accepts `teacherId` or `tierId` and returns the tier price when one is set.

## Backend asks

All backend asks (R1–R4 and the M- and Q-items) are closed on this branch; see [`CHANGES.md`](./CHANGES.md). The operations added for them after this table was generated (for example `GET /qa/reviews/mine`, `GET /billing/family/payments`, `GET /scheduling/makeup-credits`, `POST /teacher/threads`) are listed in `CHANGES.md` §5.

---

## Full endpoint table

### uploads (1)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/uploads/presign` | `presign` | `admin/teachers/ApplicationDetailView.tsx` |

### health (2)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/health/live` | `healthApi.live` | `hooks/useHealth.ts` |
| ✅ Wired | `GET` | `/health/ready` | `healthApi.ready` | `hooks/useHealth.ts` |

### auth (15)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/auth/register` | `registerUser` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/login` | `loginUser` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/refresh` | `refreshTokens` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/logout` | `logoutUser` | `hooks/useAuth.ts` |
| ✅ Wired | `GET` | `/auth/me` | `fetchCurrentUser`, `studentApi.me` | `hooks/useAuth.ts`, `hooks/useStudent.ts` |
| ✅ Wired | `GET` | `/auth/sessions` | `fetchActiveSessions` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/two-factor/setup` | `setupTwoFactor` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/two-factor/confirm` | `confirmTwoFactor` | `auth/TwoFactorEnrolment.tsx` |
| ✅ Wired | `POST` | `/auth/two-factor/disable` | `disableTwoFactor` | `hooks/useAuth.ts` |
| ✅ Wired | `POST` | `/auth/forgot-password` | `requestPasswordReset` | `app/account/security/page.tsx` |
| ✅ Wired | `POST` | `/auth/change-password` | `changePassword` | `app/account/security/page.tsx` |
| ✅ Wired | `POST` | `/auth/reset-password` | `completePasswordReset` | `hooks/useAuth.ts` |
| ✅ Wired | `GET` | `/auth/oauth/providers` | `fetchOAuthProviders` | `auth/OAuthButtons.tsx` |
| ✅ Wired | `GET` | `/auth/oauth/{provider}/start` | `startOAuth` | `auth/OAuthButtons.tsx` |
| ✅ Wired | `POST` | `/auth/oauth/{provider}/callback` | `completeOAuth` | `app/auth/complete/page.tsx` |

### admin/audit (2)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/admin/audit` | `auditApi.list` | `hooks/useAudit.ts`, `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/admin/audit/facets` | `auditApi.facets` | `hooks/useAudit.ts` |

### consent (9)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/consent/policy-version` | `consentApi.policyVersion` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `GET` | `/consent/students/{studentId}` | `consentApi.forStudent`, `bookingApi.consent` | `hooks/useFamilyConsent.ts`, `hooks/useBooking.ts` |
| ✅ Wired | `POST` | `/consent/students/{studentId}/grant` | `grantStudentConsent`, `consentApi.grant`, `bookingApi.grantDataCollection` | `hooks/useFamilyConsent.ts`, `hooks/useBooking.ts` |
| ✅ Wired | `POST` | `/consent/students/{studentId}/withdraw` | `consentApi.withdraw` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `POST` | `/consent/families/{familyId}/verify/start` | `startGuardianVerification`, `consentApi.startVerification` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `POST` | `/consent/families/{familyId}/verify/confirm` | `confirmGuardianVerification`, `consentApi.confirmVerification` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `POST` | `/consent/families/{familyId}/data-requests` | `consentApi.createDataRequest` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `GET` | `/consent/families/{familyId}/data-requests` | `consentApi.listDataRequests` | `hooks/useFamilyConsent.ts` |
| ✅ Wired | `GET` | `/consent/families/{familyId}/privacy-summary` | `consentApi.privacySummary` | `hooks/useFamilyConsent.ts` |

### admin/settings (2)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/admin/settings` | `settingsApi.list` | `hooks/useSettings.ts` |
| ✅ Wired | `PATCH` | `/admin/settings` | `settingsApi.update` | `hooks/useSettings.ts` |

### families (9)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/families` | `createFamily`, `familiesApi.create`, `bookingApi.createFamily` | `hooks/useBooking.ts`, `hooks/useFamily.ts` +1 |
| ✅ Wired | `GET` | `/families` | `fetchMyFamilies`, `billingFamilyApi.families`, `familiesApi.list`, `messagingApi.families`, `bookingApi.myFamilies` | `hooks/useBilling.ts`, `hooks/useFamily.ts` +2 |
| ✅ Wired | `GET` | `/families/{familyId}` | `familiesApi.get` | `hooks/useFamily.ts` |
| ✅ Wired | `PATCH` | `/families/{familyId}` | `familiesApi.update` | `hooks/useFamily.ts` |
| ✅ Wired | `POST` | `/families/{familyId}/guardians` | `familiesApi.addGuardian` | `hooks/useFamily.ts` |
| ✅ Wired | `GET` | `/families/{familyId}/guardians` | `familiesApi.listGuardians` | `hooks/useFamily.ts` |
| ✅ Wired | `POST` | `/families/{familyId}/students` | `addChildStudent`, `familiesApi.addStudent`, `bookingApi.addChild` | `hooks/useFamily.ts`, `hooks/useBooking.ts` |
| ✅ Wired | `GET` | `/families/{familyId}/students` | `familiesApi.listStudents`, `messagingApi.familyStudents`, `bookingApi.students` | `hooks/useFamily.ts`, `hooks/useMessaging.ts` +1 |
| ✅ Wired | `PATCH` | `/families/students/{studentId}` | `familiesApi.updateStudent` | `hooks/useFamily.ts` |

### notifications (5)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/notifications` | `notificationsApi.list`, `studentApi.notifications` | `hooks/useNotifications.ts`, `hooks/useStudent.ts` |
| ✅ Wired | `GET` | `/notifications/preferences` | `notificationsApi.preferences` | `hooks/useNotifications.ts` |
| ✅ Wired | `PATCH` | `/notifications/preferences` | `notificationsApi.updatePreferences` | `hooks/useNotifications.ts` |
| 🟡 Client only | `POST` | `/notifications/devices` | `notificationsApi.registerDevice` | — |
| ✅ Wired | `GET` | `/notifications/preferences/{userId}` | `notificationsApi.preferencesForUser` | `hooks/useNotifications.ts` |

### scheduling (16)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `PUT` | `/scheduling/teachers/{teacherId}/availability` | `teacherScheduleApi.setAvailability` | `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `GET` | `/scheduling/teachers/{teacherId}/availability` | `schedulingAdminApi.availability`, `teacherScheduleApi.availability` | `hooks/useAdminScheduling.ts`, `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `PUT` | `/scheduling/teachers/{teacherId}/availability-month/{month}` | `monthlyAvailabilityApi.setMonth` | `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `GET` | `/scheduling/teachers/{teacherId}/availability-month/{month}` | `monthlyAvailabilityApi.getMonth` | `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `PUT` | `/scheduling/teachers/{teacherId}/leave-month/{month}` | `monthlyAvailabilityApi.setLeaveMonth` | `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `GET` | `/scheduling/open-slots` | `bookingApi.openSlots`, `schedulingAdminApi.openSlots`, `familySchedulingApi.openSlots` | `hooks/useBooking.ts`, `hooks/useAdminScheduling.ts` +1 |
| ✅ Wired | `POST` | `/scheduling/book` | `bookingApi.book`, `familySchedulingApi.book` | `hooks/useBooking.ts`, `hooks/useParentSchedule.ts` |
| ✅ Wired | `POST` | `/scheduling/classes/{classId}/cancel` | `familySchedulingApi.cancel`, `teacherScheduleApi.cancelClass` | `hooks/useParentSchedule.ts`, `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `POST` | `/scheduling/classes/{classId}/reschedule` | `familySchedulingApi.reschedule`, `teacherScheduleApi.reschedule` | `hooks/useParentSchedule.ts`, `hooks/useTeacherSchedule.ts` |
| ✅ Wired | `POST` | `/scheduling/schedules` | `schedulingAdminApi.createSchedule` | `hooks/useAdminScheduling.ts` |
| ✅ Wired | `GET` | `/scheduling/schedules/{scheduleId}` | `schedulingAdminApi.getSchedule` | `hooks/useAdminScheduling.ts` |
| ✅ Wired | `GET` | `/scheduling/matching/{studentId}` | `schedulingAdminApi.matching` | `hooks/useAdminScheduling.ts` |
| ✅ Wired | `GET` | `/scheduling/teachers/{teacherId}/timetable` | `qaApi.teacherTimetable`, `schedulingAdminApi.teacherTimetable`, `teacherScheduleApi.timetable` | `hooks/useQa.ts`, `hooks/useAdminScheduling.ts` +1 |
| ✅ Wired | `GET` | `/scheduling/students/me/timetable` | `studentApi.timetable` | `hooks/useStudent.ts` |
| ✅ Wired | `GET` | `/scheduling/families/{familyId}/timetable` | `familySchedulingApi.timetable` | `hooks/useParentSchedule.ts` |
| ✅ Wired | `GET` | `/scheduling/schedules` | `schedulingAdminApi.listSchedules` | `hooks/useAdminScheduling.ts` |

### courses (10)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/courses` | `fetchCourses`, `contentApi.catalogue`, `coursesAdminApi.list`, `enrolmentsApi.catalogue`, `schedulingAdminApi.listCourses` | `hooks/useCourses.ts`, `hooks/useCoursesAdmin.ts` +2 |
| ✅ Wired | `POST` | `/courses` | `coursesAdminApi.create` | `hooks/useCoursesAdmin.ts` |
| ✅ Wired | `GET` | `/courses/{codeOrId}` | `contentApi.courseById`, `coursesAdminApi.get` | `hooks/useCoursesAdmin.ts` |
| ✅ Wired | `POST` | `/courses/enrolments` | `coursesAdminApi.createEnrolment`, `enrolmentsApi.create` | `hooks/useCoursesAdmin.ts`, `hooks/useParentEnrolments.ts` |
| ✅ Wired | `GET` | `/courses/enrolments/list` | `coursesAdminApi.listEnrolments`, `teacherEnrolmentsApi.list`, `enrolmentsApi.list`, `messagingApi.studentEnrolments`, `schedulingAdminApi.listEnrolments` | `hooks/useCoursesAdmin.ts`, `hooks/useTeacher.ts` +4 |
| ✅ Wired | `GET` | `/courses/enrolments/{enrolmentId}/next-lesson` | `teacherEnrolmentsApi.nextLesson`, `enrolmentsApi.nextLesson` | `hooks/useTeacherStudents.ts`, `hooks/useParentEnrolments.ts` |
| ✅ Wired | `PATCH` | `/courses/enrolments/{enrolmentId}/lesson-position` | `coursesAdminApi.setLessonPosition`, `teacherEnrolmentsApi.setLessonPosition` | `hooks/useCoursesAdmin.ts`, `hooks/useTeacherStudents.ts` |
| ✅ Wired | `PATCH` | `/courses/enrolments/{enrolmentId}/status` | `coursesAdminApi.updateEnrolmentStatus`, `enrolmentsApi.updateStatus` | `hooks/useCoursesAdmin.ts`, `hooks/useParentEnrolments.ts` |
| ✅ Wired | `POST` | `/courses/{courseId}/levels` | `coursesAdminApi.createLevel` | `hooks/useCoursesAdmin.ts` |
| ✅ Wired | `POST` | `/courses/levels/{levelId}/lessons` | `coursesAdminApi.createLesson` | `hooks/useCoursesAdmin.ts` |

### teachers (18)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/teachers/applications` | `submitTeacherApplication` | `app/apply-teacher/page.tsx` |
| ✅ Wired | `GET` | `/teachers/public` | `queryFn`, `fetchTeachers`, `bookingApi.teachers`, `qaApi.teachers` | `auth/OAuthButtons.tsx` |
| ✅ Wired | `GET` | `/teachers/me` | `teacherMeApi.me` | `hooks/useTeacher.ts` |
| ✅ Wired | `GET` | `/teachers/public/{userId}` | `teacherApi.publicProfile` | `hooks/useTeacher.ts`, `hooks/useTeachers.ts` |
| ✅ Wired | `GET` | `/teachers/applications/list` | `teacherHiringApi.listApplications` | `hooks/useHiring.ts` |
| ✅ Wired | `GET` | `/teachers/applications/{id}` | `teacherHiringApi.getApplication` | `hooks/useHiring.ts` |
| ✅ Wired | `POST` | `/teachers/applications/{id}/steps` | `teacherHiringApi.recordStep` | `hooks/useHiring.ts` |
| ✅ Wired | `POST` | `/teachers/profiles/{profileId}/safeguarding-training` | `teacherHiringApi.recordSafeguardingTraining` | `hooks/useHiring.ts` |
| ✅ Wired | `PATCH` | `/teachers/me/profile` | `teacherApi.requestProfileChange` | `hooks/useTeacher.ts` |
| ✅ Wired | `DELETE` | `/teachers/me/profile/pending` | `teacherMeApi.withdrawPendingChange` | `hooks/useTeacher.ts` |
| ✅ Wired | `GET` | `/teachers/profile-changes` | `teacherHiringApi.listProfileChanges` | `hooks/useHiring.ts` |
| ✅ Wired | `POST` | `/teachers/profiles/{profileId}/review` | `teacherHiringApi.reviewProfileChange` | `hooks/useHiring.ts` |
| ✅ Wired | `GET` | `/teachers/me/students/{studentId}` | `teacherApi.student` | `hooks/useTeacherStudents.ts` |
| ✅ Wired | `GET` | `/teachers/me/classes/{classId}/brief` | `teacherApi.brief` | `hooks/useTeacher.ts` |
| ✅ Wired | `GET` | `/teachers/teacher-tiers` | `teacherTiersApi.list` | `hooks/useTeacherTiers.ts` |
| ✅ Wired | `POST` | `/teachers/teacher-tiers` | `teacherTiersApi.create` | `hooks/useTeacherTiers.ts` |
| ✅ Wired | `PATCH` | `/teachers/teacher-tiers/{id}` | `teacherTiersApi.update` | `hooks/useTeacherTiers.ts` |
| ✅ Wired | `PATCH` | `/teachers/{profileId}/tier` | `teacherTiersApi.assign` | `hooks/useTeacherTiers.ts` |

### mushaf (4)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/mushaf/layouts` | `mushafApi.layouts` | `hooks/useMushaf.ts` |
| ✅ Wired | `GET` | `/mushaf/pages/{layout}/{page}` | `mushafApi.page` | `hooks/useMushaf.ts` |
| ✅ Wired | `GET` | `/mushaf/ayah-words` | `mushafApi.ayahWords` | `hooks/useMushaf.ts` |
| ✅ Wired | `DELETE` | `/mushaf/cache` | `settingsApi.clearMushafCache` | `hooks/useSettings.ts` |

### classroom (13)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/classroom/classes/{classId}/token` | `classroomApi.token` | `hooks/useClassroom.ts` |
| ✅ Wired | `GET` | `/classroom/classes/{classId}/state` | `classroomApi.state` | `hooks/useClassroom.ts` |
| ✅ Wired | `GET` | `/classroom/classes/{classId}/attendance` | `classroomApi.attendance` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/attendance/close` | `classroomApi.closeAttendance` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/page` | `classroomApi.setPage` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/highlight` | `classroomApi.setHighlight` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/layout` | `classroomApi.setLayout` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/tajweed` | `classroomApi.setTajweed` | `hooks/useClassroom.ts` |
| ✅ Wired | `GET` | `/classroom/classes/{classId}/recording/consent` | `classroomApi.recordingConsent` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/recording/start` | `classroomApi.startRecording` | `hooks/useClassroom.ts` |
| ✅ Wired | `GET` | `/classroom/bandwidth-advice` | `classroomApi.bandwidthAdvice` | `hooks/useClassroom.ts` |
| ✅ Wired | `POST` | `/classroom/classes/{classId}/recording/stop` | `classroomApi.stopRecording` | `hooks/useClassroom.ts` |
| ✅ Wired | `GET` | `/classroom/classes/{classId}/recording` | `classroomApi.recording` | `components/lessons/RecordingPlayer.tsx` |

### lessons (13)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/classes/{classId}/mistakes` | `lessonsApi.markMistake` | `hooks/useClassroomMistakes.ts` |
| ✅ Wired | `GET` | `/classes/{classId}/mistakes` | `lessonsApi.classMistakes` | `hooks/useClassroomMistakes.ts` |
| ✅ Wired | `GET` | `/students/{studentId}/mistakes` | `lessonsReadApi.mistakes`, `lessonsApi.studentMistakes` | `hooks/useParentProgress.ts`, `hooks/useClassroomMistakes.ts` |
| ✅ Wired | `POST` | `/mistakes/{mistakeId}/dismiss` | `lessonsApi.dismissMistake` | `hooks/useClassroomMistakes.ts` |
| ✅ Wired | `POST` | `/mistakes/{mistakeId}/confirm` | `lessonsApi.confirmMistake` | `hooks/useClassroomMistakes.ts` |
| ✅ Wired | `GET` | `/classes/{classId}/lesson-card/prefill` | `lessonsApi.prefill` | `hooks/useLessonCards.ts` |
| ✅ Wired | `POST` | `/classes/{classId}/lesson-card` | `lessonsApi.submit` | `hooks/useLessonCards.ts` |
| ✅ Wired | `GET` | `/lesson-cards/{lessonCardId}` | `teacherEnrolmentsApi.lessonCard`, `lessonsReadApi.get`, `lessonsApi.get` | `hooks/useTeacherStudents.ts`, `hooks/useParentProgress.ts` +1 |
| ✅ Wired | `PATCH` | `/lesson-cards/{lessonCardId}` | `lessonsApi.update` | `hooks/useLessonCards.ts` |
| ✅ Wired | `GET` | `/students/{studentId}/lesson-cards` | `teacherEnrolmentsApi.lessonCards`, `lessonsReadApi.listForStudent` | `hooks/useTeacherStudents.ts`, `hooks/useParentProgress.ts` |
| ✅ Wired | `GET` | `/lesson-cards/{lessonCardId}/edit-log` | `lessonsApi.editLog` | `hooks/useLessonCards.ts` |
| ✅ Wired | `PATCH` | `/lesson-cards/{lessonCardId}/ai-draft` | `lessonsApi.saveAiDraft` | `hooks/useLessonCards.ts` |
| ✅ Wired | `POST` | `/lesson-cards/{lessonCardId}/ai-draft/approve` | `lessonsApi.approveAiDraft` | `hooks/useLessonCards.ts` |

### hifz (3)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/hifz/students/{studentId}/pages` | `hifzApi.pages` | `hooks/useHifz.ts` |
| ✅ Wired | `GET` | `/hifz/students/{studentId}/pages/{pageNumber}` | `hifzApi.page` | `hooks/useHifz.ts` |
| ✅ Wired | `POST` | `/hifz/students/{studentId}/pages/initialize` | `hifzApi.initialize` | `hooks/useHifz.ts` |

### admin/console (6)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/admin/console/overview` | `adminConsoleApi.overview` | `hooks/useAdminConsole.ts` |
| ✅ Wired | `GET` | `/admin/console/search` | `adminConsoleApi.overview` | `hooks/useAdminConsole.ts` |
| ✅ Wired | `PATCH` | `/admin/console/users/{id}/status` | `adminConsoleApi.setUserStatus` | `hooks/useAdminConsole.ts` |
| ✅ Wired | `PATCH` | `/admin/console/users/{id}/roles` | `adminConsoleApi.setUserRoles` | `hooks/useAdminConsole.ts` |
| ✅ Wired | `GET` | `/admin/console/teachers/{teacherId}/readiness` | `adminConsoleApi.teacherReadiness` | `hooks/useAdminConsole.ts` |
| ✅ Wired | `POST` | `/admin/console/teachers` | `adminConsoleApi.provisionTeacher` | `hooks/useAdminConsole.ts` |

### admin/crm (8)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/admin/crm/leads` | `crmApi.listLeads` | `hooks/useCrm.ts` |
| ✅ Wired | `POST` | `/admin/crm/leads` | `crmApi.createLead` | `hooks/useCrm.ts` |
| ✅ Wired | `PATCH` | `/admin/crm/leads/{id}/status` | `crmApi.updateLeadStatus` | `hooks/useCrm.ts` |
| ✅ Wired | `GET` | `/admin/crm/pipeline` | `crmApi.pipeline` | `hooks/useCrm.ts` |
| ✅ Wired | `GET` | `/admin/crm/leads/by-area` | `leadsByAreaApi.list`, `crmApi.leadsByArea` | `hooks/useCrm.ts` |
| ✅ Wired | `GET` | `/admin/crm/tasks` | `crmApi.listTasks` | `hooks/useCrm.ts` |
| ✅ Wired | `POST` | `/admin/crm/tasks` | `crmApi.createTask` | `hooks/useCrm.ts` |
| ✅ Wired | `POST` | `/admin/crm/tasks/{id}/complete` | `crmApi.completeTask` | `hooks/useCrm.ts` |

### admissions (16)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/trials` | `admissionsAdminApi.bookTrial` | `hooks/useAdminAdmissions.ts` |
| ✅ Wired | `POST` | `/trials/{classId}/outcome` | `admissionsAdminApi.recordTrialOutcome` | `hooks/useAdminAdmissions.ts` |
| ✅ Wired | `POST` | `/teacher-changes` | `admissionsGuardianApi.requestTeacherChange` | `hooks/useParentEnrolments.ts` |
| ✅ Wired | `GET` | `/teacher-changes` | `admissionsAdminApi.listTeacherChanges`, `admissionsGuardianApi.myTeacherChanges` | `hooks/useAdminAdmissions.ts`, `hooks/useParentEnrolments.ts` |
| ✅ Wired | `POST` | `/teacher-changes/{id}/resolve` | `admissionsAdminApi.resolveTeacherChange` | `hooks/useAdminAdmissions.ts` |
| ✅ Wired | `GET` | `/content` | `contentApi.list` | `hooks/useContent.ts` |
| ✅ Wired | `GET` | `/content/{slug}` | `contentApi.bySlug` | `hooks/useContent.ts` |
| ✅ Wired | `GET` | `/faq` | `fetchFaqs`, `cmsAdminApi.publicFaq`, `contentApi.faqs` | `hooks/useFaqs.ts`, `hooks/useCms.ts` |
| ✅ Wired | `POST` | `/faq` | `contentApi.submitFaq` | `hooks/useContent.ts` |
| ✅ Wired | `GET` | `/content-admin` | `cmsAdminApi.list` | `hooks/useCms.ts` |
| ✅ Wired | `POST` | `/content-admin` | `cmsAdminApi.save` | `hooks/useCms.ts` |
| ✅ Wired | `DELETE` | `/content-admin/{id}` | `cmsAdminApi.remove` | `hooks/useCms.ts` |
| ✅ Wired | `POST` | `/faq-admin/{id}/moderate` | `cmsAdminApi.moderateFaq` | `hooks/useCms.ts` |
| ✅ Wired | `GET` | `/trials` | `admissionsAdminApi.listTrials` | `hooks/useAdminAdmissions.ts` |
| ✅ Wired | `GET` | `/trials/{classId}/outcome` | `admissionsAdminApi.getTrialOutcome` | `components/shared/TrialResultForm.tsx` |
| ✅ Wired | `PATCH` | `/trials/{classId}/outcome` | `admissionsAdminApi.editTrialOutcome` | `hooks/useAdminAdmissions.ts` |

### parent (7)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/parent/students/{studentId}/dashboard` | `parentProgressApi.dashboard` | `hooks/useParentProgress.ts` |
| ✅ Wired | `GET` | `/parent/students/{studentId}/charts` | `parentProgressApi.charts` | `hooks/useParentProgress.ts` |
| ✅ Wired | `GET` | `/parent/students/{studentId}/report-card` | `parentProgressApi.reportCard` | `hooks/useParentProgress.ts` |
| ✅ Wired | `GET` | `/parent/threads` | `messagingApi.listThreads` | `hooks/useMessaging.ts` |
| ✅ Wired | `POST` | `/parent/threads` | `messagingApi.openThread` | `hooks/useMessaging.ts` |
| ✅ Wired | `GET` | `/parent/threads/{id}` | `messagingApi.getThread` | `hooks/useMessaging.ts` |
| ✅ Wired | `POST` | `/parent/threads/{id}/messages` | `messagingApi.postMessage` | `hooks/useMessaging.ts` |

### teacher (3)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/teacher/threads` | `messagingApi.listThreads` | `hooks/useMessaging.ts` |
| ✅ Wired | `GET` | `/teacher/threads/{id}` | `messagingApi.getThread` | `hooks/useMessaging.ts` |
| ✅ Wired | `POST` | `/teacher/threads/{id}/messages` | `messagingApi.postMessage` | `hooks/useMessaging.ts` |

### quality (6)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/quality/classes/{classId}/rating` | `qualityRatingApi.rateClass` | `hooks/useParentSchedule.ts` |
| ✅ Wired | `GET` | `/quality/teachers/{teacherId}/rating` | `qaApi.teacherRating`, `qualityRatingApi.teacherRating`, `teacherApi.rating` | `hooks/useQa.ts`, `hooks/useParentEnrolments.ts` +2 |
| ✅ Wired | `POST` | `/qa/classes/{classId}/review` | `qaApi.submitReview` | `hooks/useQa.ts` |
| ✅ Wired | `POST` | `/qa/reviews/{id}/reply` | `teacherApi.replyToReview` | `hooks/useTeacher.ts` |
| ✅ Wired | `POST` | `/qa/teachers/{teacherId}/sample` | `qaApi.drawSample` | `hooks/useQa.ts` |
| ✅ Wired | `GET` | `/qa/teachers/{teacherId}/scorecard` | `qaApi.scorecard` | `hooks/useQa.ts` |

### safeguarding (9)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/cases` | `casesApi.open` | `hooks/useCases.ts` |
| ✅ Wired | `GET` | `/cases` | `casesApi.list` | `hooks/useCases.ts` |
| ✅ Wired | `POST` | `/cases/report` | `casesApi.report` | `hooks/useCases.ts` |
| ✅ Wired | `GET` | `/cases/mine` | `casesApi.mine` | `hooks/useCases.ts` |
| ✅ Wired | `GET` | `/cases/sla` | `casesApi.sla` | `hooks/useCases.ts` |
| ✅ Wired | `GET` | `/cases/{id}` | `casesApi.get` | `hooks/useCases.ts` |
| ✅ Wired | `POST` | `/cases/{id}/notes` | `casesApi.addNote` | `hooks/useCases.ts` |
| ✅ Wired | `POST` | `/cases/{id}/transition` | `casesApi.transition` | `hooks/useCases.ts` |
| ✅ Wired | `POST` | `/cases/{id}/assign` | `casesApi.assign` | `hooks/useCases.ts` |

### billing (15)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/billing/plans` | `fetchPlans`, `admissionsAdminApi.listPlans`, `publicPlansApi.list`, `billingAdminApi.plans`, `billingFamilyApi.plans` | `hooks/usePlans.ts`, `hooks/useAdminAdmissions.ts` +2 |
| ✅ Wired | `GET` | `/billing/plans/{id}/price` | `publicPlansApi.priceFor`, `billingFamilyApi.price` | `hooks/usePlanPrices.ts` |
| ✅ Wired | `PATCH` | `/billing/plans/{id}/tier` | `publicPlansApi.setTier`, `billingAdminApi.setPlanTier` | `hooks/useTeacherTiers.ts` |
| ✅ Wired | `GET` | `/billing/family` | `billingFamilyApi.family` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/checkout` | `billingFamilyApi.checkout` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscribe` | `billingFamilyApi.subscribe` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/cancel` | `billingFamilyApi.cancel` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/pause` | `billingFamilyApi.pause` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/resume` | `billingFamilyApi.resume` | `hooks/useBilling.ts` |
| ✅ Wired | `GET` | `/billing/offers` | `billingFamilyApi.offers` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/sync` | `billingFamilyApi.sync` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/change-plan` | `billingFamilyApi.changePlan` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/weekly-times` | `billingFamilyApi.weeklyTimes` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/subscriptions/{id}/keep` | `billingFamilyApi.keep` | `hooks/useBilling.ts` |
| ✅ Wired | `POST` | `/billing/portal` | `billingFamilyApi.portal` | `hooks/useBilling.ts` |

### admin/billing (9)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/admin/billing/invoices` | `billingAdminApi.issueInvoice` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/refunds` | `billingAdminApi.refund` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/invoices/{invoiceId}/write-off` | `billingAdminApi.writeOffInvoice` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/dunning/run` | `billingAdminApi.runDunning` | `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/admin/billing/lookups` | `billingAdminApi.lookups` | `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/admin/billing/prices` | `billingAdminApi.prices` | `hooks/useFinance.ts` |
| ✅ Wired | `PUT` | `/admin/billing/prices` | `billingAdminApi.setPrice` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/plans` | `billingAdminApi.createPlan` | `hooks/useFinance.ts` |
| ✅ Wired | `PATCH` | `/admin/billing/plans/{id}` | `billingAdminApi.updatePlan` | `hooks/useFinance.ts` |

### payroll (7)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/payroll/my-payslips` | `payrollTeacherApi.myPayslips` | `hooks/useTeacherPayslips.ts` |
| ✅ Wired | `GET` | `/payroll/rates` | `payrollAdminApi.rates` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/periods` | `payrollAdminApi.openPeriod` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/periods/{id}/calculate` | `payrollAdminApi.calculate` | `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/payroll/periods/{id}/report` | `payrollAdminApi.report` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/entries/{id}/paid` | `payrollAdminApi.markPaid` | `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/payroll/periods` | `payrollAdminApi.periods` | `hooks/useFinance.ts` |

### webhooks (4)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ➖ Server-to-server | `POST` | `/webhooks/payments` | — | — |
| ➖ Server-to-server | `POST` | `/webhooks/video` | — | — |
| ➖ Server-to-server | `POST` | `/webhooks/whatsapp` | — | — |
| ➖ Server-to-server | `GET` | `/webhooks/whatsapp` | — | — |
