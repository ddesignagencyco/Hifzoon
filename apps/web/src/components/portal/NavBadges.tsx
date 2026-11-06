'use client';

import React from 'react';
import { useTeacherChanges, useTrialList } from '@/hooks/useAdminAdmissions';
import { useCrmPipeline } from '@/hooks/useCrm';
import { trialState } from '@/lib/api/modules/admissions-admin';
import { useHiringApplications, usePendingProfileChanges } from '@/hooks/useHiring';
import { useAdminEnrolments } from '@/hooks/useCoursesAdmin';
import { useCases } from '@/hooks/useCases';
import { useUnreadThreadCount } from '@/hooks/useMessaging';
import { useInterviewsAwaitingOutcome } from '@/hooks/useInterviews';
import { useOutstandingLessonCards } from '@/hooks/useLessonCards';
import { useTrialsAwaitingResult } from '@/hooks/useTeacherSchedule';
import { isTrialResultDue } from '@/components/teacher/teacher-worklists';
import { useFamilyBilling } from '@/hooks/useBilling';
import { useMissingConsents } from '@/hooks/useFamilyConsent';
import { useAdminDataRequests } from '@/hooks/useDataRequestsAdmin';
import { useUnreadNotifications } from '@/hooks/useNotifications';
import { usePracticeAssignments, usePracticeToReview } from '@/hooks/usePractice';
import { useActiveFamily, useFamilyStudents } from '@/hooks/useFamily';
import { useMyEnrolments } from '@/hooks/useStudent';
import { useOpenMistakes, type MistakeStudent } from '@/components/practice/MistakesToPractise';
import { countPracticeAttention, usePracticeSeen } from '@/lib/practice-seen';
import { FamilyBilling, isPayable } from '@/lib/api/modules/billing-family';
import { AdminDataRequest } from '@/lib/api/modules/data-requests-admin';
import { isAwaitingTeacher } from '@/lib/api/modules/courses-admin';
import { CaseListItem, isCaseOverdue } from '@/lib/api/modules/cases';
import { ApplicationListItem } from '@/lib/api/modules/teacher-hiring';
import { NavBadgeKey } from '@/lib/portal/nav';
import { cn } from '@/lib/utils';

/** What a badge shows: nothing for 0 / unknown, `99+` above 99. */
export function navBadgeText(count: number | undefined): string | null {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(count);
}

/** Applications still moving through hiring (not approved or rejected). */
export function countApplicationsInProgress(rows: readonly Pick<ApplicationListItem, 'status'>[] | undefined): number | undefined {
  return rows?.filter((a) => a.status !== 'APPROVED' && a.status !== 'REJECTED').length;
}

/** Cases not yet closed, and how many of those are past their SLA. */
export function countOpenCases(
  rows: readonly Pick<CaseListItem, 'status' | 'dueAt'>[] | undefined,
  now = Date.now(),
): { open: number; overdue: number } | undefined {
  if (!rows) return undefined;
  const open = rows.filter((c) => c.status !== 'CLOSED');
  return { open: open.length, overdue: open.filter((c) => isCaseOverdue(c, now)).length };
}

/**
 * Billing items the family has to act on: each invoice still to pay, and each live plan
 * that needs its weekly times chosen (after a plan change, or when the chosen times could
 * not be booked).
 */
export function countBillingAttention(data: FamilyBilling | undefined): number | undefined {
  if (!data) return undefined;
  const invoices = data.invoices.filter(isPayable).length;
  const times = data.subscriptions.filter(
    (s) => s.status !== 'CANCELLED' && Boolean(s.setup?.timesNeeded || s.setup?.scheduleError),
  ).length;
  return invoices + times;
}

/** Data requests still owed an answer, and how many of those are past their deadline. */
export function countOpenDataRequests(
  rows: readonly Pick<AdminDataRequest, 'status' | 'overdue'>[] | undefined,
): { open: number; overdue: number } | undefined {
  if (!rows) return undefined;
  const open = rows.filter((r) => r.status === 'REQUESTED' || r.status === 'IN_PROGRESS');
  return { open: open.length, overdue: open.filter((r) => r.overdue).length };
}

export type NavBadgeVariant = 'pill' | 'dot';

function Pill({
  count,
  label,
  urgent,
  variant,
}: {
  count: number | undefined;
  label: string;
  urgent?: boolean;
  variant: NavBadgeVariant;
}) {
  const text = navBadgeText(count);
  if (!text) return null;
  if (variant === 'dot') {
    // Collapsed sidebar: a dot on the icon; the count stays available to screen readers.
    return (
      <span
        className={cn('absolute top-1 right-1 w-2 h-2 rounded-full', urgent ? 'bg-red' : 'bg-gold')}
        data-testid="nav-badge-dot"
      >
        <span className="sr-only">
          {text} {label}
        </span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'ml-auto min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums inline-flex items-center justify-center',
        urgent ? 'bg-red text-white' : 'bg-gold text-green-950',
      )}
    >
      {text}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function TeacherChangesBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useTeacherChanges('OPEN');
  return <Pill variant={variant} count={q.data?.meta.total} label="open requests" />;
}

function ApplicationsBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useHiringApplications();
  return <Pill variant={variant} count={countApplicationsInProgress(q.data)} label="applications in progress" />;
}

function AwaitingTeacherBadge({ variant }: { variant: NavBadgeVariant }) {
  // Same filters as the Enrolments tab's default and the overview card: one shared request.
  const q = useAdminEnrolments({ status: '' });
  return <Pill variant={variant} count={q.data?.filter(isAwaitingTeacher).length} label="enrolments awaiting a teacher" />;
}

function CasesBadge({ variant }: { variant: NavBadgeVariant }) {
  // Two tiny filtered reads give exact counts (meta.total) without loading every case.
  const open = useCases({ openOnly: true, limit: 1 });
  const overdue = useCases({ overdueOnly: true, limit: 1 });
  const overdueCount = overdue.data?.meta.total ?? 0;
  return (
    <Pill
      variant={variant}
      count={open.data?.meta.total}
      urgent={overdueCount > 0}
      label={overdueCount ? `open cases, ${overdueCount} overdue` : 'open cases'}
    />
  );
}

function ProfileChangesBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = usePendingProfileChanges();
  return <Pill variant={variant} count={q.data?.length} label="profile changes to review" />;
}

function CrmTasksBadge({ variant }: { variant: NavBadgeVariant }) {
  // Call-back requests and every other follow-up arrive as open tasks; red once one is overdue.
  const q = useCrmPipeline();
  const overdue = q.data?.overdueTasks ?? 0;
  return (
    <Pill
      variant={variant}
      count={q.data?.openTasks}
      urgent={overdue > 0}
      label={overdue ? `follow-ups, ${overdue} overdue` : 'follow-ups to do'}
    />
  );
}

function TrialsBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useTrialList();
  const now = q.dataUpdatedAt;
  return <Pill variant={variant} count={q.data?.filter((t) => trialState(t, now) === 'needs').length} urgent label="trials needing a result" />;
}

function UnreadThreadsBadge({
  side,
  viewerUserId,
  variant,
}: {
  side: 'guardian' | 'teacher';
  viewerUserId: string | undefined;
  variant: NavBadgeVariant;
}) {
  const count = useUnreadThreadCount(side, viewerUserId);
  return <Pill variant={variant} count={count} label="unread conversations" />;
}

function PracticeToReviewBadge({ variant }: { variant: NavBadgeVariant }) {
  // Same query as the Practice to review page, so the two agree.
  const q = usePracticeToReview();
  return <Pill variant={variant} count={q.data?.length} label="practice sessions to review" />;
}

function PracticeAttentionBadge({ variant }: { variant: NavBadgeVariant }) {
  // Same list as the Practice page: not practised yet, or a teacher reply not opened here.
  const q = usePracticeAssignments();
  const seen = usePracticeSeen();
  return <Pill variant={variant} count={countPracticeAttention(q.data, seen)} label="practice to do or replies to read" />;
}

function OpenMistakesCount({ students, variant }: { students: MistakeStudent[]; variant: NavBadgeVariant }) {
  // Same queries as the Mistakes page, so a mistake marked fixed drops off both.
  const open = useOpenMistakes(students);
  return <Pill variant={variant} count={open.isLoading ? undefined : open.rows.length} label="open mistakes to practise" />;
}

function FamilyMistakesBadge({ variant }: { variant: NavBadgeVariant }) {
  const { familyId } = useActiveFamily();
  const students = useFamilyStudents(familyId);
  return (
    <OpenMistakesCount
      variant={variant}
      students={(students.data ?? []).map((s) => ({ id: s.id, displayName: s.displayName }))}
    />
  );
}

function StudentMistakesBadge({ variant }: { variant: NavBadgeVariant }) {
  const enrolments = useMyEnrolments();
  const student = enrolments.data?.[0]?.student;
  return <OpenMistakesCount variant={variant} students={student ? [{ id: student.id, displayName: student.displayName }] : []} />;
}

function InterviewsAwaitingOutcomeBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useInterviewsAwaitingOutcome();
  return <Pill variant={variant} count={q.data?.length} urgent label="interviews waiting for a result" />;
}

function TeacherTodayBadge({ variant }: { variant: NavBadgeVariant }) {
  // Lesson cards still owed plus trial results still to record: both are "write it up" work
  // left from classes already taught, so one count on Today reads clearer than two.
  const cards = useOutstandingLessonCards();
  const trials = useTrialsAwaitingResult();
  const count = cards.data || trials.data ? (cards.data?.length ?? 0) + (trials.data?.length ?? 0) : undefined;
  return <Pill variant={variant} count={count} label="lesson cards and trial results to write" />;
}

function TeacherLessonCardsBadge({ variant }: { variant: NavBadgeVariant }) {
  // Same query as the Lesson cards page and Today's "Cards due" tile.
  const cards = useOutstandingLessonCards();
  return <Pill variant={variant} count={cards.data?.length} label="lesson cards to write" />;
}

function TeacherTrialResultsBadge({ variant }: { variant: NavBadgeVariant }) {
  // A trial marked "Teacher absent" has no result to record, so it is not counted.
  const trials = useTrialsAwaitingResult();
  return <Pill variant={variant} count={trials.data?.filter(isTrialResultDue).length} label="trial results to record" />;
}

function BillingAttentionBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useFamilyBilling();
  return <Pill variant={variant} count={countBillingAttention(q.data)} urgent label="billing items to sort out" />;
}

function ConsentMissingBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useMissingConsents();
  return <Pill variant={variant} count={q.data?.length} urgent label="children missing a required consent" />;
}

function DataRequestsBadge({ variant }: { variant: NavBadgeVariant }) {
  const q = useAdminDataRequests({ openOnly: true });
  const counts = countOpenDataRequests(q.data);
  const overdue = counts?.overdue ?? 0;
  return (
    <Pill
      variant={variant}
      count={counts?.open}
      urgent={overdue > 0}
      label={overdue ? `open data requests, ${overdue} overdue` : 'open data requests'}
    />
  );
}

function NotificationsUnreadBadge({ variant }: { variant: NavBadgeVariant }) {
  // Same query as the header bell, so both share one request and agree.
  const q = useUnreadNotifications();
  return <Pill variant={variant} count={q.data?.unread} label="unread notifications" />;
}

/**
 * The count for one nav item. Each kind is its own component so its query only runs for the
 * items the viewer can see; failures stay silent (the page itself reports them).
 */
export function NavBadge({
  kind,
  viewerUserId,
  variant = 'pill',
}: {
  kind: NavBadgeKey;
  viewerUserId: string | undefined;
  variant?: NavBadgeVariant;
}) {
  switch (kind) {
    case 'teacherChangesOpen':
      return <TeacherChangesBadge variant={variant} />;
    case 'applicationsInProgress':
      return <ApplicationsBadge variant={variant} />;
    case 'enrolmentsAwaitingTeacher':
      return <AwaitingTeacherBadge variant={variant} />;
    case 'casesOpen':
      return <CasesBadge variant={variant} />;
    case 'profileChangesPending':
      return <ProfileChangesBadge variant={variant} />;
    case 'crmTasksOpen':
      return <CrmTasksBadge variant={variant} />;
    case 'trialsNeedingResult':
      return <TrialsBadge variant={variant} />;
    case 'unreadThreadsGuardian':
      return <UnreadThreadsBadge side="guardian" viewerUserId={viewerUserId} variant={variant} />;
    case 'unreadThreadsTeacher':
      return <UnreadThreadsBadge side="teacher" viewerUserId={viewerUserId} variant={variant} />;
    case 'practiceToReview':
      return <PracticeToReviewBadge variant={variant} />;
    case 'practiceAttention':
      return <PracticeAttentionBadge variant={variant} />;
    case 'openMistakesFamily':
      return <FamilyMistakesBadge variant={variant} />;
    case 'openMistakesStudent':
      return <StudentMistakesBadge variant={variant} />;
    case 'interviewsAwaitingOutcome':
      return <InterviewsAwaitingOutcomeBadge variant={variant} />;
    case 'teacherTodayTasks':
      return <TeacherTodayBadge variant={variant} />;
    case 'teacherLessonCardsDue':
      return <TeacherLessonCardsBadge variant={variant} />;
    case 'teacherTrialResultsDue':
      return <TeacherTrialResultsBadge variant={variant} />;
    case 'billingAttention':
      return <BillingAttentionBadge variant={variant} />;
    case 'consentMissing':
      return <ConsentMissingBadge variant={variant} />;
    case 'dataRequestsOpen':
      return <DataRequestsBadge variant={variant} />;
    case 'notificationsUnread':
      return <NotificationsUnreadBadge variant={variant} />;
  }
}
