'use client';

import React from 'react';
import { useTeacherChanges } from '@/hooks/useAdminAdmissions';
import { useHiringApplications } from '@/hooks/useHiring';
import { useAdminEnrolments } from '@/hooks/useCoursesAdmin';
import { useCases } from '@/hooks/useCases';
import { useUnreadThreadCount } from '@/hooks/useMessaging';
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
  return <Pill variant={variant} count={q.data?.length} label="open requests" />;
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
  const q = useCases();
  const counts = countOpenCases(q.data);
  return (
    <Pill
      variant={variant}
      count={counts?.open}
      urgent={Boolean(counts?.overdue)}
      label={counts?.overdue ? `open cases, ${counts.overdue} overdue` : 'open cases'}
    />
  );
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
    case 'unreadThreadsGuardian':
      return <UnreadThreadsBadge side="guardian" viewerUserId={viewerUserId} variant={variant} />;
    case 'unreadThreadsTeacher':
      return <UnreadThreadsBadge side="teacher" viewerUserId={viewerUserId} variant={variant} />;
  }
}
