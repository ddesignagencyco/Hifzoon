import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, UserStatus } from '@hifzoon/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { QUEUE } from '../../queue/queue.constants';
import { MAILER, MESSENGER, Mailer, Messenger } from '../../integrations/providers';
import { EMAIL_ATTACHMENTS, renderEmail } from './email-templates';

/** Template keys, kept in one place so FE, worker and tests agree. */
export const TEMPLATE = {
  CLASS_REMINDER_DAY_BEFORE: 'class.reminder.day-before',
  CLASS_REMINDER_15_MIN: 'class.reminder.15-min',
  CLASS_CANCELLED: 'class.cancelled',
  CLASS_RESCHEDULED: 'class.rescheduled',
  LESSON_CARD_READY: 'lesson-card.ready',
  /** The teacher approved the lesson summary after the card was already shared. */
  LESSON_SUMMARY_READY: 'lesson-card.summary-ready',
  /** A teacher set practice between classes (FR-AIC). */
  PRACTICE_ASSIGNED: 'practice.assigned',
  /** The teacher replied to a practice session: feedback and any words to work on. */
  PRACTICE_REVIEWED: 'practice.reviewed',
  /** Someone asked the academy to call them back (public site). */
  CRM_CALLBACK_REQUESTED: 'crm.callback-requested',
  TRIAL_BOOKED: 'trial.booked',
  REPORT_CARD_READY: 'report-card.ready',
  MISSED_CLASS: 'class.missed',
  TEACHER_CHANGE: 'class.teacher-change',
  /** An examiner has been given an exam to take. */
  ASSESSMENT_ASSIGNED: 'course.assessment-assigned',
  /** A class needs a substitute and the teacher is being offered it. */
  SUBSTITUTE_OFFERED: 'class.substitute-offered',
  PAYMENT_FAILED: 'billing.payment-failed',
  /** Recurring billing (FR-NTF-02): the plan started, a renewal failed, it changed or ended. */
  BILLING_SUBSCRIBED: 'billing.subscribed',
  BILLING_RENEWAL_FAILED: 'billing.renewal-failed',
  BILLING_PLAN_CHANGED: 'billing.plan-changed',
  BILLING_PLAN_ENDING: 'billing.plan-ending',
  BILLING_PLAN_ENDED: 'billing.plan-ended',
  /** The plan's classes a week changed: the family picks new weekly times. */
  BILLING_TIMES_NEEDED: 'billing.times-needed',
  SAFEGUARDING_ALERT: 'case.safeguarding-alert',
  PASSWORD_RESET: 'auth.password-reset',
  /** A new staff member sets their password from this link. */
  STAFF_INVITE: 'auth.staff-invite',
  /** An administrator cleared the person's two-factor. */
  TWO_FACTOR_RESET: 'auth.two-factor-reset',
  ACCOUNT_LOCKED: 'auth.account-locked',
  PASSWORD_CHANGED: 'auth.password-changed',
  GUARDIAN_VERIFICATION: 'consent.guardian-verification',
  /** M40 - a family or teacher has an unread message waiting. */
  NEW_MESSAGE: 'message.new',
  DATA_REQUEST: 'consent.data-request',
  /** An admin refused a family's data request; the reason goes with it. */
  DATA_REQUEST_REJECTED: 'consent.data-request-rejected',
  /** CR-05 — admins: a data request is within 7 days of its statutory deadline. */
  DATA_REQUEST_DEADLINE: 'consent.data-request-deadline',
  /** M57 - a teacher staged a profile change for approval. */
  PROFILE_CHANGE_SUBMITTED: 'teacher.profile-change.submitted',
  /** M57 - an admin approved or rejected a teacher's staged change. */
  PROFILE_CHANGE_REVIEWED: 'teacher.profile-change.reviewed',
  /** A newly approved teacher finished the one-time profile setup (admins). */
  TEACHER_PROFILE_COMPLETED: 'teacher.profile.completed',
  /** M63 — an applicant's hiring step moved (sent to their email; they may have no account). */
  TEACHER_APPLICATION_STATUS: 'teacher.application.status',
  /** M63 — approval created the teacher's account; the link sets their password. */
  TEACHER_ACCOUNT_READY: 'teacher.account.ready',
  /** A new teacher application is waiting for review (hiring team). */
  TEACHER_APPLICATION_RECEIVED: 'teacher.application.received',
  /** An applicant's document was refused; they are asked for a new copy. */
  TEACHER_DOCUMENT_REFUSED: 'teacher.document.refused',
  /** The applicant's link to the training course (TRAINING step). */
  TEACHER_TRAINING_INVITE: 'teacher.training.invite',
  /** An applicant passed, or used every attempt of, the training (hiring team). */
  TEACHER_TRAINING_RESULT: 'teacher.training.result',
  /** M61 — staff booked a trial class for the family. */
  TRIAL_BOOKED_BY_ACADEMY: 'trial.booked-by-academy',
  /** Staff gave a trial its teacher but booked no time yet. */
  TRIAL_TEACHER_ASSIGNED: 'trial.teacher-assigned',
  /** The trial's result: the placement and the link to continue, or a thank-you. */
  TRIAL_RESULT_CONTINUE: 'trial.result.continue',
  TRIAL_RESULT_NOT_CONTINUING: 'trial.result.not-continuing',
  /** A class (or trial) was booked with this teacher. */
  TEACHER_CLASS_BOOKED: 'teacher.class.booked',
  /** M62 — a supervisor reviewed a teacher's class; the teacher replied to a review. */
  QA_REVIEW_POSTED: 'qa.review.posted',
  QA_REVIEW_REPLIED: 'qa.review.replied',
  /** M65 — a family left a low rating. */
  LOW_RATING_ALERT: 'qa.low-rating',
  /** M58/M60 — a teacher-change request was resolved. */
  TEACHER_CHANGE_RESOLVED: 'admissions.teacher-change.resolved',
  /**
   * INT — a hiring interview with Qari shb. Sent to the applicant's email address, not to
   * an account: an applicant has none until their application is approved, so the body
   * carries a tokenised join link instead of asking them to sign in.
   */
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  INTERVIEW_RESCHEDULED: 'interview.rescheduled',
  INTERVIEW_CANCELLED: 'interview.cancelled',
  /** A family asked for a revision or follow-up on a shared lesson card; and the answer. */
  REVISION_REQUESTED: 'lesson-card.revision-requested',
  REVISION_ANSWERED: 'lesson-card.revision-answered',
  /** A student passed a level assessment and moved up a level. */
  LEVEL_PASSED: 'course.level-passed',
} as const;

export type TemplateKey = (typeof TEMPLATE)[keyof typeof TEMPLATE];

/**
 * Values interpolated into a template. Narrow on purpose: an object ending up in an
 * email body is a bug, and 
estrict-template-expressions catches it at lint time.
 */
export type TemplateData = Record<string, string | number | boolean | null | undefined>;

interface LocaleStrings {
  subject: (data: TemplateData) => string;
  body: (data: TemplateData) => string;
}

/** Template fields that have a built-in fallback in the copy, so absence is not an error. */
const OPTIONAL_TEMPLATE_FIELDS = new Set([
  'homework',
  'summary',
  'resetUrl',
  'reason',
  'notes',
  'comment',
  'resolutionNote',
]);

/**
 * Minimal locale-aware copy. Kept in code rather than in the database so a missing
 * translation is a deploy-time error instead of a blank email at 3am — and so the
 * Urdu and Arabic text can be reviewed by a native speaker in one PR (NFR-L10N-01).
 */
const STRINGS: Record<string, Partial<Record<TemplateKey, LocaleStrings>>> = {
  en: {
    [TEMPLATE.CLASS_REMINDER_DAY_BEFORE]: {
      subject: (d) => `Class tomorrow: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} is teaching ${d.studentName} tomorrow at ${d.localTime} (${d.timeZone}). ` +
        `Join: ${d.joinUrl}`,
    },
    [TEMPLATE.CLASS_REMINDER_15_MIN]: {
      subject: (d) => `Class in 15 minutes: ${d.studentName}`,
      body: (d) => `Your class with ${d.teacherName} starts at ${d.localTime}. Join: ${d.joinUrl}`,
    },
    [TEMPLATE.LESSON_CARD_READY]: {
      subject: (d) => `Lesson card for ${d.studentName} is ready`,
      body: (d) =>
        `${d.teacherName} has shared the lesson card from today's class. Today's homework: ${d.homework || 'none set'}` +
        (d.summary ? `\n\nFrom the teacher:\n${d.summary}` : ''),
    },
    [TEMPLATE.LESSON_SUMMARY_READY]: {
      subject: (d) => `How ${d.studentName}'s class went`,
      body: (d) => `${d.teacherName} has added a summary to today's lesson card:\n\n${d.summary}`,
    },
    [TEMPLATE.PRACTICE_ASSIGNED]: {
      subject: (d) => `New practice for ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} has set practice for ${d.studentName}: ${d.range}, ${d.minutes} minutes in all, due ${d.due}. ` +
        `Open it here: ${d.url}`,
    },
    [TEMPLATE.PRACTICE_REVIEWED]: {
      subject: (d) => `${d.teacherName} replied to ${d.studentName}'s practice`,
      body: (d) =>
        `${d.teacherName} has listened to ${d.studentName}'s practice of ${d.range}.` +
        (d.feedback
          ? `

"${d.feedback}"`
          : '') +
        (Number(d.mistakes) > 0
          ? `

Words to work on: ${d.mistakes}.`
          : '') +
        `

See it here: ${d.url}`,
    },
    [TEMPLATE.CRM_CALLBACK_REQUESTED]: {
      subject: (d) => `Call-back request: ${d.contactName}`,
      body: (d) =>
        `${d.contactName} asked the academy to get in touch (${d.contact}). Course: ${d.course}. ` +
        `It is in Admin → CRM, with a follow-up task due within 24 hours.`,
    },
    [TEMPLATE.PASSWORD_CHANGED]: {
      subject: () => 'Your Hifzoon password was changed',
      body: () =>
        'The password on your Hifzoon account was just changed and other devices were signed out. ' +
        'If this was not you, reset your password straight away and contact support.',
    },
    [TEMPLATE.PROFILE_CHANGE_SUBMITTED]: {
      subject: (d) => `Profile change to review: ${d.teacherName}`,
      body: (d) =>
        `${d.teacherName} submitted changes to their public profile (${d.fields}) for approval. ` +
        `Open Admin → Teachers → Profile changes to review them.`,
    },
    [TEMPLATE.TEACHER_PROFILE_COMPLETED]: {
      subject: (d) => `${d.teacherName} completed their teacher profile`,
      body: (d) =>
        `${d.teacherName} finished their profile setup, so their public profile can now be shown ` +
        `to families. See Admin → Teachers.`,
    },
    [TEMPLATE.TEACHER_APPLICATION_STATUS]: {
      subject: (d) => `Your Hifzoon teaching application: ${d.stage}`,
      body: (d) =>
        d.outcome === 'rejected'
          ? `Assalamu alaikum ${d.name}. Thank you for applying to teach with Hifzoon. After the ${d.stage} step we are not able to continue with your application. ${d.notes ?? ''}`.trim()
          : d.outcome === 'received'
            ? `Assalamu alaikum ${d.name}. JazakAllahu khayran for applying to teach with Hifzoon. We have your application, recitation and documents, and our review board will listen to your recitation next. We will email you after each step.`
            : d.outcome === 'approved'
              ? `Assalamu alaikum ${d.name}. Your application is approved. Welcome to Hifzoon.`
              : `Assalamu alaikum ${d.name}. Your application has passed the ${d.stage} step. We will be in touch about the next step.`,
    },
    [TEMPLATE.TEACHER_APPLICATION_RECEIVED]: {
      subject: (d) => `New teacher application: ${d.applicantName}`,
      body: (d) =>
        `${d.applicantName} applied to teach. Review the recitation and documents: ${d.url}`,
    },
    [TEMPLATE.TEACHER_TRAINING_INVITE]: {
      subject: () => 'Your Hifzoon teacher training',
      body: (d) =>
        `Assalamu alaikum ${d.name}. Your application has reached the training step. Read each short module (the teacher terms, safeguarding, online boundaries, reporting, using the platform, and child-protection standards), confirm it, then accept the teacher terms. Open your training here (the link works for ${d.days} days): ${d.trainingUrl}`,
    },
    [TEMPLATE.TEACHER_TRAINING_RESULT]: {
      subject: (d) => `Training: ${d.applicantName} ${String(d.result).split(' (')[0]}`,
      body: (d) => `${d.applicantName} ${d.result}. Review and record the training step: ${d.url}`,
    },
    [TEMPLATE.TEACHER_DOCUMENT_REFUSED]: {
      subject: (d) => `Hifzoon application: please send a new ${d.document}`,
      body: (d) =>
        `Assalamu alaikum ${d.name}. We could not accept the ${d.document} you sent: ${d.reason}. Please reply to this email with a clear copy (PDF, JPG or PNG) and we will continue your application.`,
    },
    [TEMPLATE.TEACHER_ACCOUNT_READY]: {
      subject: () => 'Your Hifzoon teacher account is ready',
      body: (d) =>
        `Assalamu alaikum ${d.name}. Your teacher account has been created. Set your password here (the link works for ${d.ttlMinutes} minutes): ${d.setPasswordUrl}`,
    },
    [TEMPLATE.TRIAL_BOOKED]: {
      subject: (d) => `${d.kind} booked for ${d.studentName}`,
      body: (d) =>
        `${d.studentName}'s ${String(d.kind).toLowerCase()} (${d.course}) with ${d.teacherName} is booked for ${d.localTime} (${d.timeZone}). The classroom opens 10 minutes before the start: ${d.joinUrl}`,
    },
    [TEMPLATE.TEACHER_CLASS_BOOKED]: {
      subject: (d) => `New ${String(d.kind).toLowerCase()}: ${d.studentName}, ${d.localTime}`,
      body: (d) =>
        `${d.kind} booked with you: ${d.studentName} (${d.course}) on ${d.localTime} (${d.timeZone}). Open the pre-class brief and the classroom here: ${d.joinUrl}`,
    },
    [TEMPLATE.TRIAL_BOOKED_BY_ACADEMY]: {
      subject: (d) => `Free trial booked for ${d.studentName}`,
      body: (d) =>
        `${d.studentName}'s free trial class with ${d.teacherName} is booked for ${d.localTime} (${d.timeZone}). The class opens 10 minutes before the start: ${d.joinUrl}`,
    },
    [TEMPLATE.TRIAL_TEACHER_ASSIGNED]: {
      subject: (d) => `${d.teacherName} will teach ${d.studentName}'s free trial`,
      body: (d) =>
        `Assalamu alaikum. ${d.teacherName} will teach ${d.studentName}'s free trial in ${d.course}. ` +
        `The academy will confirm the trial time with you, or you can book a time yourself from ` +
        `${d.studentName}'s Courses tab in the family portal.`,
    },
    [TEMPLATE.TRIAL_RESULT_CONTINUE]: {
      subject: (d) => `${d.studentName}'s placement after the free trial`,
      body: (d) =>
        `Assalamu alaikum. Thank you for ${d.studentName}'s free trial with ${d.teacherName}. ${d.studentName} starts ${d.course}${d.level ? ` at ${d.level}` : ''}.${d.plan ? ` We recommend ${d.plan}.` : ''} Choose a plan and set up the weekly classes here: ${d.continueUrl}`,
    },
    [TEMPLATE.TRIAL_RESULT_NOT_CONTINUING]: {
      subject: (d) => `Thank you for ${d.studentName}'s free trial`,
      body: (d) =>
        `Assalamu alaikum. Thank you for trying a class with ${d.teacherName}. If you would like to try another time, teacher or course, you can book again here: ${d.bookUrl}`,
    },
    [TEMPLATE.QA_REVIEW_POSTED]: {
      subject: () => 'A supervisor reviewed one of your classes',
      body: (d) =>
        `Your class on ${d.classDate} was reviewed (average ${d.average}/5). Read the feedback and reply: ${d.url}`,
    },
    [TEMPLATE.QA_REVIEW_REPLIED]: {
      subject: (d) => `${d.teacherName} replied to your review`,
      body: (d) =>
        `${d.teacherName} replied to your review of the class on ${d.classDate}: ${d.url}`,
    },
    [TEMPLATE.LOW_RATING_ALERT]: {
      subject: (d) => `Low family rating for ${d.teacherName}`,
      body: (d) =>
        `A family rated a class with ${d.teacherName} ${d.stars}/5. ${d.comment ?? ''} Review the class: ${d.url}`.trim(),
    },
    [TEMPLATE.TEACHER_CHANGE_RESOLVED]: {
      subject: (d) => `Teacher change for ${d.studentName}: ${d.outcome}`,
      body: (d) =>
        `The request to change ${d.studentName}'s teacher was ${d.outcome}. ${d.resolutionNote ?? ''}`.trim(),
    },
    [TEMPLATE.PROFILE_CHANGE_REVIEWED]: {
      subject: (d) => `Your profile changes were ${d.outcome}`,
      body: (d) =>
        d.outcome === 'approved'
          ? 'The changes you submitted to your public profile were approved and are now live.'
          : `The changes you submitted to your public profile were not approved. ${d.reason ?? ''}`.trim(),
    },
    [TEMPLATE.CLASS_CANCELLED]: {
      subject: (d) => `Class cancelled: ${d.studentName}`,
      body: (d) =>
        `The class on ${d.localDate} has been cancelled by ${d.cancelledBy}. ` +
        `A make-up credit has been added to your account.`,
    },
    [TEMPLATE.CLASS_RESCHEDULED]: {
      subject: (d) => `Class moved: ${d.studentName}`,
      body: (d) =>
        `${d.studentName}'s class has moved from ${formatUtc(d.oldTime)} to ${formatUtc(d.newTime)}. ` +
        `The class link in your timetable is unchanged.`,
    },
    [TEMPLATE.REPORT_CARD_READY]: {
      subject: () => 'A new report card is ready',
      body: () =>
        'A new report card is ready in your Hifzoon portal. ' +
        'Sign in to review progress and next steps.',
    },
    [TEMPLATE.MISSED_CLASS]: {
      subject: () => 'A class was marked as missed',
      body: () =>
        'A class on your timetable was marked as missed. ' +
        'Open your timetable to see the class and any make-up options.',
    },
    [TEMPLATE.ASSESSMENT_ASSIGNED]: {
      subject: (d) => `Exam assigned: ${d.studentName}`,
      body: (d) =>
        `You have been asked to examine ${d.studentName} (${d.courseName}, ${d.levelName}) for ` +
        `the ${d.examType} exam${d.scheduledFor ? ` planned for ${d.scheduledFor}` : ''}. ` +
        `Open your exams to record the result once it is taken.`,
    },
    [TEMPLATE.SUBSTITUTE_OFFERED]: {
      subject: (d) => `Can you cover a ${d.courseName} class?`,
      body: (d) =>
        `A ${d.courseName} class on ${d.startsAt} needs a substitute teacher. ` +
        `Open your offers to accept or decline before ${d.expiresAt}; the first teacher to accept gets it.`,
    },
    [TEMPLATE.TEACHER_CHANGE]: {
      subject: () => 'Your class teacher has changed',
      body: () =>
        'There has been a change to your class teacher. ' +
        'Open your timetable to see the updated teacher and class link.',
    },
    [TEMPLATE.ACCOUNT_LOCKED]: {
      subject: () => 'Your Hifzoon account has been locked',
      body: () =>
        'Your Hifzoon account has been locked after too many failed sign-in attempts. ' +
        'Reset your password to unlock it, or contact support if you need help.',
    },
    [TEMPLATE.NEW_MESSAGE]: {
      subject: () => 'You have a new message on Hifzoon',
      body: () =>
        'You have a new message in your Hifzoon inbox. ' + 'Open Messages to read it and reply.',
    },
    [TEMPLATE.DATA_REQUEST]: {
      subject: (d) => `Your ${d.type} request is ready`,
      body: (d) =>
        `Your ${d.type} request (reference ${d.reference}) is ready. ` +
        `Open Hifzoon to access it.`,
    },
    [TEMPLATE.DATA_REQUEST_REJECTED]: {
      subject: (d) => `Your ${d.type} request was not carried out`,
      body: (d) =>
        `Your ${d.type} request (reference ${d.reference}) was not carried out. ` +
        `Reason: ${d.reason || 'none given'}. Reply to the academy if you have any questions.`,
    },
    [TEMPLATE.DATA_REQUEST_DEADLINE]: {
      subject: (d) => `Data request ${d.reference} is due ${d.dueDate}`,
      body: (d) =>
        `The ${d.type} request ${d.reference} from ${d.familyName} is ${d.status} and must be ` +
        `answered by ${d.dueDate} (30-day statutory deadline). Open the queue: ${d.url}`,
    },
    [TEMPLATE.PAYMENT_FAILED]: {
      subject: (d) => `Payment failed for ${d.invoiceNumber}`,
      body: (d) =>
        `We could not take the payment for ${d.invoiceNumber}. We will retry on ${d.nextRetryDate}. ` +
        `Please update your payment method to avoid the class being paused.`,
    },
    [TEMPLATE.BILLING_SUBSCRIBED]: {
      subject: (d) => `Welcome to ${d.planName}`,
      body: (d) =>
        `Your card is saved and ${d.planName} has started. Weekly classes: ${d.schedule}. ` +
        `It renews automatically on ${d.renewsOn}; manage it any time: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_RENEWAL_FAILED]: {
      subject: (d) => `We couldn't take the payment for ${d.planName}`,
      body: (d) =>
        `The payment of ${d.amount} for ${d.planName} did not go through. Classes continue while we ` +
        `try your card again. Please pay or update your card here: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_CHANGED]: {
      subject: (d) => `Your plan is changing to ${d.planName}`,
      body: (d) => `${d.planName} starts ${d.effective}. Details: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDING]: {
      subject: (d) => `${d.planName} ends on ${d.endsOn}`,
      body: (d) =>
        `As requested, ${d.planName} ends on ${d.endsOn}. Classes continue until then. ` +
        `Changed your mind? Keep the plan here: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDED]: {
      subject: (d) => `${d.planName} has ended`,
      body: (d) =>
        `${d.planName} has ended and its future classes are cancelled. You can start again any time: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_TIMES_NEEDED]: {
      subject: (d) => `Choose new weekly times for ${d.planName}`,
      body: (d) =>
        `${d.planName} has ${d.classesPerWeek} ${Number(d.classesPerWeek) === 1 ? 'class' : 'classes'} a week. Please choose the weekly times: ${d.billingUrl}`,
    },
    [TEMPLATE.SAFEGUARDING_ALERT]: {
      subject: (d) => `Safeguarding report received (${d.caseReference})`,
      body: (d) =>
        `A safeguarding report was raised in a class. Reference ${d.caseReference}. ` +
        `Please open the case record and acknowledge within 15 minutes.`,
    },
    [TEMPLATE.GUARDIAN_VERIFICATION]: {
      subject: (d) => `Confirm a guardian for ${d.familyName ?? 'your family'}`,
      body: (d) =>
        // `requesterName` was missing from the payload this template was first shipped
        // with, so the copy rendered a literal "undefined" in front of the one sentence
        // asking a parent to trust a stranger with their children. Both fallbacks keep
        // the message readable if a future caller omits a field.
        `${d.requesterName ?? 'Someone'} asked to join ${d.familyName ?? 'your family'} as a guardian. ` +
        `If you recognise them, confirm this code: ${d.code}. If not, ignore this message and contact support.`,
    },
    [TEMPLATE.STAFF_INVITE]: {
      subject: () => 'You have been invited to Hifzoon',
      body: (d) =>
        `Assalamu alaikum ${d.name}. A Hifzoon staff account has been created for you. ` +
        `Choose your password here (the link works for ${d.ttlHours} hours): ${d.setPasswordUrl ?? ''}`,
    },
    [TEMPLATE.TWO_FACTOR_RESET]: {
      subject: () => 'Your Hifzoon two-factor was reset',
      body: (d) =>
        `Assalamu alaikum ${d.name}. An administrator reset the two-factor on your account. ` +
        `Sign in and set it up again. If you did not ask for this, contact the academy now.`,
    },
    [TEMPLATE.PASSWORD_RESET]: {
      subject: () => 'Reset your Hifzoon password',
      body: (d) =>
        `Use this link within ${d.ttlMinutes} minutes to choose a new password: ${d.resetUrl ?? ''}`,
      // Plain URL, not markup: the delivery path escapes the body before wrapping it in
      // HTML, so an <a> here would arrive as literal text. This template used to
      // interpolate `d.code`, which a reset never sets, so the email arrived with an empty
      // code and no way in (B20).
    },
    [TEMPLATE.INTERVIEW_SCHEDULED]: {
      subject: (d) => `Your Hifzoon interview: ${d.localTime}`,
      body: (d) =>
        `Assalamu alaikum ${d.name}. Your interview with ${d.interviewerName} is booked for ` +
        `${d.localTime} (${d.timeZone}) and lasts about ${d.durationMinutes} minutes. ` +
        `Join from this link — it is yours alone, so please do not share it, and the room opens ` +
        `${d.earlyOpenMinutes} minutes early: ${d.joinUrl}`,
    },
    [TEMPLATE.INTERVIEW_RESCHEDULED]: {
      subject: (d) => `Your Hifzoon interview has moved to ${d.localTime}`,
      body: (d) =>
        `Assalamu alaikum ${d.name}. Your interview with ${d.interviewerName} has been moved to ` +
        `${d.localTime} (${d.timeZone}). Your existing join link still works: ${d.joinUrl}`,
    },
    [TEMPLATE.INTERVIEW_CANCELLED]: {
      subject: () => 'Your Hifzoon interview has been cancelled',
      body: (d) =>
        `Assalamu alaikum ${d.name}. Your interview booked for ${d.localTime} (${d.timeZone}) has been ` +
        `cancelled. ${d.reason ?? 'We will be in touch about the next step.'}`.trim(),
    },
    [TEMPLATE.REVISION_REQUESTED]: {
      subject: (d) => `${d.studentName}'s family asked for a follow-up`,
      body: (d) =>
        `${d.guardianName} asked about the lesson card from ${d.lessonDate} (${d.reasonLabel}):\n\n` +
        `${d.message}\n\nReply here: ${d.url}`,
    },
    [TEMPLATE.REVISION_ANSWERED]: {
      subject: (d) => `Your follow-up about ${d.studentName}'s lesson was answered`,
      body: (d) => `${d.responderName} replied:\n\n${d.response}\n\nSee the lesson card: ${d.url}`,
    },
    [TEMPLATE.LEVEL_PASSED]: {
      subject: (d) => `${d.studentName} passed ${d.levelName}`,
      body: (d) =>
        `Mabrook! ${d.studentName} passed the ${d.levelName} assessment in ${d.courseName} ` +
        `with ${d.score}%. ${d.nextStep}`,
    },
  },

  ur: {
    [TEMPLATE.BILLING_SUBSCRIBED]: {
      subject: (d) => `${d.planName} شروع ہو گیا`,
      body: (d) =>
        `آپ کا کارڈ محفوظ ہو گیا اور ${d.planName} شروع ہو گیا ہے۔ ہفتہ وار کلاسیں: ${d.schedule}۔ ` +
        `یہ ${d.renewsOn} کو خود بخود تجدید ہوگا۔ انتظام: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_RENEWAL_FAILED]: {
      subject: (d) => `${d.planName} کی ادائیگی نہیں ہو سکی`,
      body: (d) =>
        `${d.planName} کے لیے ${d.amount} کی ادائیگی نہیں ہو سکی۔ کلاسیں جاری رہیں گی، ہم دوبارہ کوشش کریں گے۔ ` +
        `ادائیگی کریں یا کارڈ بدلیں: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_PLAN_ENDED]: {
      subject: (d) => `${d.planName} ختم ہو گیا`,
      body: (d) =>
        `${d.planName} ختم ہو گیا ہے اور آئندہ کلاسیں منسوخ ہیں۔ دوبارہ شروع کریں: ${d.billingUrl}`,
    },
    [TEMPLATE.BILLING_TIMES_NEEDED]: {
      subject: (d) => `${d.planName} کے لیے نئے اوقات چنیں`,
      body: (d) =>
        `${d.planName} میں ہفتے میں ${d.classesPerWeek} کلاسیں ہیں۔ اوقات چنیں: ${d.billingUrl}`,
    },
    [TEMPLATE.CLASS_REMINDER_DAY_BEFORE]: {
      subject: (d) => `کل کلاس: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} کل ${d.localTime} (${d.timeZone}) پر ${d.studentName} کو پڑھائیں گے۔ شامل ہوں: ${d.joinUrl}`,
    },
    [TEMPLATE.CLASS_REMINDER_15_MIN]: {
      subject: (d) => `15 منٹ میں کلاس: ${d.studentName}`,
      body: (d) =>
        `${d.teacherName} کے ساتھ کلاس ${d.localTime} پر شروع ہوگی۔ شامل ہوں: ${d.joinUrl}`,
    },
    [TEMPLATE.LESSON_CARD_READY]: {
      subject: (d) => `${d.studentName} کا سبق کارڈ تیار ہے`,
      body: (d) =>
        `${d.teacherName} نے آج کے کلاس کا سبق کارڈ بھیجا ہے۔ ہوم ورک: ${d.homework || 'کوئی نہیں'}` +
        (d.summary ? `\n\nاستاد کی طرف سے:\n${d.summary}` : ''),
    },
  },
};

/**
 * Notifications (NTF-BE-01, NTF-BE-02, FR-NTF-01, FR-NTF-04).
 *
 * Sending is always asynchronous through the queue, never inline in the request that
 * triggered it: a slow SMTP provider must not add latency to a lesson-card submit, and
 * a failed email must be retried without the teacher's work being lost.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(MESSENGER) private readonly messenger: Messenger,
  ) {}

  /**
   * Resolves copy for a template + locale, falling back to English.
   *
   * `missing` lists template fields that were read but absent. A template with a missing
   * field used to render the literal word "undefined" into the stored subject and body
   * and into the email (B34); callers now refuse to send instead.
   */
  resolve(template: TemplateKey, locale: string, data: TemplateData) {
    const language = String(locale ?? 'en')
      .toLowerCase()
      .split(/[-_]/)[0];
    const localised = STRINGS[language]?.[template];
    const strings = localised ?? STRINGS.en[template];
    if (!strings) {
      this.logger.warn(
        `No copy for template "${template}" in "${locale}"; falling back to a generic message`,
      );
      return {
        subject: 'Hifzoon update',
        body: JSON.stringify(data),
        fallback: true,
        missing: [] as string[],
        language: 'en',
      };
    }
    const missing = new Set<string>();
    const tracked = new Proxy(data, {
      get: (target, key) => {
        const value = (target as Record<string, unknown>)[key as string];
        if (
          typeof key === 'string' &&
          (value === undefined || value === null || value === '') &&
          !OPTIONAL_TEMPLATE_FIELDS.has(key)
        ) {
          missing.add(key);
        }
        return value;
      },
    });
    return {
      subject: strings.subject(tracked),
      body: strings.body(tracked),
      fallback: false,
      missing: [...missing],
      language: localised ? language : 'en',
    };
  }

  /**
   * Creates a notification row and queues delivery.
   *
   * The row exists before the send so a delivery failure is visible in the parent
   * portal rather than silently lost, and so `FR-OPS-06` can show what was promised.
   */
  /**
   * The guardians who need to hear about a class (M40).
   *
   * Deliberately the *primary* guardians of the students on the class, deduplicated: a
   * family with two children in the same class hears once, and a second guardian who never
   * opted into WhatsApp does not receive a message on someone else's behalf.
   */
  async guardiansForClass(classId: string): Promise<string[]> {
    const links = await this.prisma.classStudent.findMany({
      where: { classId },
      select: {
        student: {
          select: {
            family: {
              select: { members: { where: { isPrimary: true }, select: { userId: true } } },
            },
          },
        },
      },
      take: 500,
    });

    const ids = new Set<string>();
    for (const link of links) {
      for (const member of link.student.family.members) ids.add(member.userId);
    }
    return [...ids];
  }

  /**
   * M63 — sends a template to an email address that may have no account (a teacher
   * applicant). Not queued as a `notification` row, because that needs a user; failures
   * are logged rather than thrown so they never undo the caller's work.
   */
  async emailAddress(input: {
    to: string;
    template: TemplateKey;
    data: TemplateData;
    locale?: string;
  }): Promise<boolean> {
    const locale = input.locale ?? 'en';
    const copy = this.resolve(input.template, locale, input.data);
    try {
      const rendered = renderEmail({
        template: input.template,
        locale: copy.language,
        subject: copy.subject,
        body: copy.body,
        data: input.data,
      });
      const result = await this.mailer.send({
        to: input.to,
        subject: copy.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: EMAIL_ATTACHMENTS,
        replyTo: undefined,
      });
      return result.accepted;
    } catch (error) {
      this.logger.warn(
        `Email "${input.template}" to an applicant failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async enqueue(input: {
    userIds: string[];
    template: TemplateKey;
    data: TemplateData;
    channel?: NotificationChannel;
    scheduledFor?: Date;
  }): Promise<{ queued: number }> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: input.userIds }, status: UserStatus.ACTIVE, deletedAt: null },
      select: {
        id: true,
        language: true,
        notificationPreferences: {
          select: {
            email: true,
            whatsapp: true,
            push: true,
            quietFrom: true,
            quietTo: true,
            language: true,
          },
        },
      },
    });

    let queued = 0;
    for (const user of users) {
      const preferences = user.notificationPreferences;
      const locale = preferences?.language ?? user.language;

      // FR-NTF-04 — honour quiet hours unless the message is safety-critical.
      //
      // `isWithinQuietHours` is true *inside* the quiet window (and false for
      // safety-critical templates, which must always go out). This used to test its
      // negation, so every notification was recorded SKIPPED and none was ever queued —
      // safeguarding alerts included (B23).
      if (
        isWithinQuietHours(
          input.template,
          preferences ?? undefined,
          input.scheduledFor ?? new Date(),
        )
      ) {
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: input.template,
            channel: input.channel ?? NotificationChannel.EMAIL,
            payload: { ...input.data },
            status: NotificationStatus.SKIPPED,
            failureReason: 'Within quiet hours',
          },
        });
        continue;
      }

      const copy = this.resolve(input.template, locale, input.data);

      if (copy.missing.length > 0 && SAFETY_CRITICAL.has(input.template)) {
        // A safeguarding alert must still reach the lead; log the defect instead of dropping it.
        this.logger.error(
          `"${input.template}" is missing data (${copy.missing.join(', ')}) but is safety-critical; sending anyway`,
        );
      }
      if (copy.missing.length > 0 && !SAFETY_CRITICAL.has(input.template)) {
        // Fail loudly rather than send "undefined" to a family (B34): record the failure so
        // staff can see it, and do not queue a delivery.
        const reason = `Missing template data: ${copy.missing.join(', ')}`;
        this.logger.error(`Not sending "${input.template}" to ${user.id}: ${reason}`);
        await this.prisma.notification.create({
          data: {
            userId: user.id,
            type: input.template,
            channel: input.channel ?? NotificationChannel.EMAIL,
            payload: { ...input.data } as never,
            status: NotificationStatus.FAILED,
            failureReason: reason,
          },
        });
        continue;
      }

      const notification = await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: input.template,
          channel: input.channel ?? NotificationChannel.EMAIL,
          payload: { ...input.data, subject: copy.subject, body: copy.body } as never,
          status: NotificationStatus.QUEUED,
          scheduledFor: input.scheduledFor ?? new Date(),
        },
      });

      await this.queues.add(QUEUE.NOTIFICATION, 'deliver', {
        notificationId: notification.id,
        userId: user.id,
        template: input.template,
        locale,
        channel: input.channel ?? NotificationChannel.EMAIL,
        data: input.data,
      });
      queued += 1;
    }

    return { queued };
  }

  /**
   * Delivers one notification. Called by the worker, and directly from tests so the
   * delivery path is covered without a live SMTP server.
   */
  async deliver(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    return input.channel === NotificationChannel.WHATSAPP
      ? this.deliverWhatsapp(input)
      : this.deliverEmail(input);
  }

  /**
   * Email delivery.
   *
   * The row exists before the send, so a delivery failure is visible in the parent
   * portal rather than silently lost, and so `FR-OPS-06` can show what was promised.
   */
  private async deliverEmail(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });

    if (!user?.email) {
      await this.markFailed(input.notificationId, 'No email address on file');
      return { delivered: false };
    }

    const copy = this.resolve(input.template, input.locale, input.data);
    if (copy.missing.length > 0 && !SAFETY_CRITICAL.has(input.template)) {
      await this.markFailed(
        input.notificationId,
        `Missing template data: ${copy.missing.join(', ')}`,
      );
      return { delivered: false };
    }

    try {
      const rendered = renderEmail({
        template: input.template,
        locale: copy.language,
        subject: copy.subject,
        body: copy.body,
        data: input.data,
      });
      const result = await this.mailer.send({
        to: user.email,
        subject: copy.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: EMAIL_ATTACHMENTS,
        // CR-07 — never expose a personal address in the reply path.
        replyTo: undefined,
        idempotencyKey: input.notificationId,
      });

      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: { status: NotificationStatus.SENT, sentAt: new Date() },
      });
      return { delivered: result.accepted };
    } catch (error) {
      await this.markFailed(input.notificationId, (error as Error).message);
      throw error;
    }
  }

  /**
   * WhatsApp delivery (FR-NTF-03, IR-SW-05).
   *
   * Three refusals happen *before* the provider is called, and each is a case where
   * sending would be wrong rather than merely unhelpful:
   *
   *   - **no phone on file** — nothing to send to;
   *   - **the family has not opted in** — `notificationPreference.whatsapp` defaults to
   *     `false`, and WhatsApp policy requires consent for business-initiated messages.
   *     This is the guard that stops the platform messaging families about children
   *     without permission;
   *   - **the adapter says no** — a second, provider-level consent check.
   *
   * The provider's `messageId` is written to the row, because it is the only handle the
   * delivery webhook will ever give us back. A 200 from WhatsApp means *accepted*, not
   * delivered; the difference is only ever resolved asynchronously by
   * `/webhooks/whatsapp`, which finds the row by exactly this value.
   */
  private async deliverWhatsapp(input: {
    notificationId: string;
    userId: string;
    template: TemplateKey;
    locale: string;
    channel: NotificationChannel;
    data: TemplateData;
  }): Promise<{ delivered: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        phone: true,
        notificationPreferences: { select: { whatsapp: true } },
      },
    });

    if (!user?.phone) {
      await this.markFailed(input.notificationId, 'No WhatsApp number on file');
      return { delivered: false };
    }

    if (!user.notificationPreferences?.whatsapp) {
      // SKIPPED, not FAILED: nothing is wrong, the family simply did not opt in to this
      // channel. A FAILED would show up in an ops report as a broken integration.
      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: NotificationStatus.SKIPPED,
          failureReason: 'Family has not opted in to WhatsApp',
        },
      });
      return { delivered: false };
    }

    if (!(await this.messenger.canContact(user.phone))) {
      await this.markFailed(input.notificationId, 'Recipient has not consented to messages');
      return { delivered: false };
    }

    try {
      const { messageId } = await this.messenger.sendTemplate({
        to: user.phone,
        template: input.template,
        locale: input.locale,
        variables: Object.fromEntries(
          Object.entries(input.data).map(([key, value]) => [key, String(value ?? '')]),
        ),
        idempotencyKey: input.notificationId,
      });

      await this.prisma.notification.update({
        where: { id: input.notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: messageId,
        },
      });
      return { delivered: true };
    } catch (error) {
      await this.markFailed(input.notificationId, (error as Error).message);
      throw error;
    }
  }

  private async markFailed(notificationId: string, reason: string): Promise<void> {
    await this.prisma.notification
      .update({
        where: { id: notificationId },
        data: { status: NotificationStatus.FAILED, failureReason: reason },
      })
      .catch(() => undefined);
  }

  /** M59 — how many of the user's notifications are unread. */
  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** M59 — marks the given notifications read, or all of them when no ids are given. */
  async markRead(userId: string, ids?: string[]) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { marked: result.count, unread: await this.unreadCount(userId) };
  }

  async listForUser(userId: string, limit = 50, skip = 0) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      // B19 — the controller computed a page and then threw it away, so page 2 was page 1
      // again while the total said there was more. Paging that does not page is worse than
      // no paging: the client shows an infinite-looking inbox and cannot reach the rest.
      skip,
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        payload: true,
        // Support needs to answer "why did my WhatsApp not arrive?" without a database
        // console, so the reason a delivery was skipped or failed travels with the row.
        failureReason: true,
        readAt: true,
      },
    });
  }
}

/** Safety-critical messages ignore quiet hours (CR-08 is not a "sometime later"). */
const SAFETY_CRITICAL = new Set<TemplateKey>([TEMPLATE.SAFEGUARDING_ALERT]);

function isWithinQuietHours(
  template: TemplateKey,
  preferences: { quietFrom: Date | null; quietTo: Date | null } | undefined,
  at: Date,
): boolean {
  if (SAFETY_CRITICAL.has(template)) return false;
  if (!preferences?.quietFrom || !preferences.quietTo) return false;

  const minutesNow = at.getUTCHours() * 60 + at.getUTCMinutes();
  const from = preferences.quietFrom.getUTCHours() * 60 + preferences.quietFrom.getUTCMinutes();
  const to = preferences.quietTo.getUTCHours() * 60 + preferences.quietTo.getUTCMinutes();

  // Quiet hours may wrap past midnight (22:00 -> 07:00).
  return from <= to ? minutesNow >= from && minutesNow < to : minutesNow >= from || minutesNow < to;
}

/** New templates only receive an ISO timestamp; show it unambiguously as UTC. */
function formatUtc(value: TemplateData[string]): string {
  const raw = String(value ?? '');
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return raw;
  return `${date.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`;
}
