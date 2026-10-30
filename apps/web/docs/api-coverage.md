# API Coverage — Web vs Backend

**Checked:** 2026-10-29 (after wiring) · **Spec source:** live `GET http://localhost:4000/api/docs-json` (193 operations) · **Web source:** `apps/web/src`

## How this was checked

Every step below was run against the code, not inferred:

1. **Spec.** Every operation (method + path) was pulled from the running API's OpenAPI document.
2. **Web calls.** Every `http.*(...)` and `apiRequest(...)` call in `apps/web/src` was extracted with its method and path, including calls built through path helpers. That gives 240 call sites, and every one of them maps to a real spec operation.
3. **Used by the UI.** Each call was traced to the hooks and components that use its client function.
4. **Mounted.** Those hooks and components were traced through imports back to an `app/**/page.tsx` or `layout.tsx` route.
5. **Response shapes.** The shapes that changed in the Oct 2026 batch were checked live against the running API: `/billing/plans`, `/billing/plans/:id/price`, `/teachers/public` and the monthly availability read.
6. **Build and tests.** `tsc --noEmit` is clean. All 94 unit test files pass (587 tests).

## Summary

| Status | Count | Meaning |
|:--|--:|:--|
| ✅ Wired | 188 | Client function exists, and a mounted page reaches it |
| 🟡 Client only | 1 | `POST /notifications/devices`: push registration, P2, with no mobile app yet |
| ➖ Server-to-server | 4 | Webhooks called by Stripe, LiveKit and Meta, never by the browser |
| ❌ Broken / 🟠 Not mounted / ⛔ Missing | 0 | |
| **Total** | **193** | |

---

## What changed in this pass

| Area | Endpoints | Where in the UI |
|:--|:--|:--|
| Plans sell tiers, not prices (#5) | `GET /billing/plans` (new shape), `GET /billing/plans/:id/price`, `PATCH /billing/plans/:id/tier` | Home and `/pricing` show tier cards with no prices. Parent → Billing loads each plan's price in the family currency. Admin → Billing shows a "Plans, tiers & prices" table where admins pick each plan's tier. Admin → Trials → Record outcome shows the plan's tier. **This fixes the three screens that crashed.** |
| Teacher tiers (#4) | `GET/POST /teachers/teacher-tiers`, `PATCH /teachers/teacher-tiers/:id`, `PATCH /teachers/:profileId/tier` | Admin → Teachers → **Teacher tiers** tab (add, edit, deactivate). Per-teacher **Qualification tier** panel. Badges on public teacher cards, the public profile, and the teacher's own profile card. |
| Profile review and credentials (M54, M57, #7) | `GET /teachers/profile-changes`, `POST /teachers/profiles/:id/review` (+ `reason`), `DELETE /teachers/me/profile/pending` | Admin → Teachers → **Profile changes** queue with before/after view. New certificates are marked "Verified on approval" and link to their documents. Reject asks for a reason. Teacher → Profile has **Withdraw changes** and shows the last rejection reason. The public profile lists verified certificates. |
| Monthly hours and leave (#1) | `GET/PUT …/availability-month/:month`, `PUT …/leave-month/:month` | Teacher → Availability → **Month by month & days off**. Hours can start from the weekly pattern, and days off are marked on a calendar (clearing all now works). |
| Change password (M69) | `POST /auth/change-password` | Account → Security has a real change-password form. The reset link is kept for Google/Apple accounts. |
| Consent notice version (M9) | `GET /consent/policy-version` | Consent wording shows the live version and grants send the version the guardian saw. The hard-coded `'v1'` is gone. |
| Student timetable (M49) | `GET /scheduling/students/me/timetable` | Student home lists the next two weeks of classes, with a Join button that opens 10 minutes before. The old notification-scraping workaround is removed. |
| Teacher's view of a student (M47) | `GET /teachers/me/students/:id` | Teacher → Student shows language, time zone, Mushaf, family and guardians, class consents, and family notes. |
| Report a concern (M56) | `POST /cases/report`, `GET /cases/mine` | New **Report a concern** page in the parent, teacher and student portals, with the user's own report references and statuses. |
| CRM geography | `POST /admin/crm/leads` (+ region, city, postcode), `GET /admin/crm/leads/by-area` | New lead form has region, city and postcode. CRM has a new **Areas** tab. |
| 3 trials per week (#3) | `POST /trials` (behaviour only) | The trials hint uses `TRIAL_SESSIONS_PER_WEEK`. |
| Parent joins as child (M48) | `POST /classroom/classes/:id/token` (+ `asStudentId`) | A parent in the classroom gets **Join as {child}** for each of their own children on the class, with camera and mic, or **Watch only**. |
| Richer classroom state (M55) | `GET /classroom/classes/:id/state` (+ `course`, `students`, `recording`) | The room is titled with the course name, and the REC pill also shows when a recording started on another device. |

## Backend asks

Four issues were found while wiring (R1–R4). The most important is that saving weekly hours wipes month-by-month hours. All four are listed with evidence in [`REQUIREMENTS.md`](./REQUIREMENTS.md).

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

### admin/audit (1)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/admin/audit` | `auditApi.list` | `hooks/useAudit.ts`, `hooks/useFinance.ts` |

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

### scheduling (15)

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

### classroom (11)

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

### admissions (13)

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

### billing (9)

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

### admin/billing (4)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `POST` | `/admin/billing/invoices` | `billingAdminApi.issueInvoice` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/refunds` | `billingAdminApi.refund` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/invoices/{invoiceId}/write-off` | `billingAdminApi.writeOffInvoice` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/admin/billing/dunning/run` | `billingAdminApi.runDunning` | `hooks/useFinance.ts` |

### payroll (6)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ✅ Wired | `GET` | `/payroll/my-payslips` | `payrollTeacherApi.myPayslips` | `hooks/useTeacherPayslips.ts` |
| ✅ Wired | `GET` | `/payroll/rates` | `payrollAdminApi.rates` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/periods` | `payrollAdminApi.openPeriod` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/periods/{id}/calculate` | `payrollAdminApi.calculate` | `hooks/useFinance.ts` |
| ✅ Wired | `GET` | `/payroll/periods/{id}/report` | `payrollAdminApi.report` | `hooks/useFinance.ts` |
| ✅ Wired | `POST` | `/payroll/entries/{id}/paid` | `payrollAdminApi.markPaid` | `hooks/useFinance.ts` |

### webhooks (4)

| Status | Method | Endpoint | Web client | Used by |
|:--|:--|:--|:--|:--|
| ➖ Server-to-server | `POST` | `/webhooks/payments` | — | — |
| ➖ Server-to-server | `POST` | `/webhooks/video` | — | — |
| ➖ Server-to-server | `POST` | `/webhooks/whatsapp` | — | — |
| ➖ Server-to-server | `GET` | `/webhooks/whatsapp` | — | — |
