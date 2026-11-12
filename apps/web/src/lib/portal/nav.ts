import { Role } from '@/lib/types';
import { getDefaultRouteForRole, getSafeRedirectUrl, isStaffUser } from '@/lib/api/client';
import { FeatureKey, featureEnabled } from '@/lib/features';

export type PortalKey = 'parent' | 'student' | 'teacher' | 'supervisor' | 'safeguarding' | 'admin';

/**
 * "Something is waiting" counts shown next to a nav item, resolved in PortalShell from list
 * endpoints the portal already calls (see `components/portal/NavBadges.tsx`).
 */
export type NavBadgeKey =
  | 'teacherChangesOpen'
  | 'applicationsInProgress'
  | 'enrolmentsAwaitingTeacher'
  | 'casesOpen'
  | 'profileChangesPending'
  | 'crmTasksOpen'
  | 'trialsNeedingResult'
  | 'unreadThreadsGuardian'
  | 'unreadThreadsTeacher'
  | 'practiceToReview'
  | 'practiceAttention'
  | 'openMistakesFamily'
  | 'openMistakesStudent'
  | 'interviewsAwaitingOutcome'
  | 'teacherTodayTasks'
  | 'teacherLessonCardsDue'
  | 'teacherTrialResultsDue'
  | 'billingAttention'
  | 'consentMissing'
  | 'dataRequestsOpen'
  | 'notificationsUnread';

export interface PortalNavItem {
  label: string;
  href: string;
  /** lucide-react icon name, resolved in PortalShell. */
  icon: string;
  /** Restrict a single item further than the portal (e.g. super-admin-only). */
  roles?: Role[];
  /** Shown only while this feature flag is on (see `src/lib/features.ts`). */
  feature?: FeatureKey;
  /** A count of items waiting here, shown as a pill (resolved in PortalShell). */
  badge?: NavBadgeKey;
  /**
   * Pages under another item's path that belong to this one, e.g. a child's practice
   * (`/parent/children/<id>/practice/…`) is Practice, not Children.
   */
  alsoActive?: RegExp;
}

export interface PortalDefinition {
  key: PortalKey;
  label: string;
  basePath: string;
  roles: Role[];
  nav: PortalNavItem[];
}

const STAFF_ADMIN = [Role.ADMIN, Role.SUPER_ADMIN];
const QUALITY = [Role.SUPERVISOR, Role.SUPER_ADMIN];

/**
 * Single source of truth for every role portal and its sidebar.
 * Each `href` maps to a route under `src/app/<portal>/...`.
 */
export const PORTALS: Record<PortalKey, PortalDefinition> = {
  parent: {
    key: 'parent',
    label: 'Family portal',
    basePath: '/parent',
    roles: [Role.GUARDIAN],
    nav: [
      { label: 'Overview', href: '/parent', icon: 'LayoutDashboard' },
      { label: 'Family', href: '/parent/family', icon: 'UserCircle' },
      { label: 'Children', href: '/parent/children', icon: 'Users' },
      { label: 'Courses', href: '/parent/courses', icon: 'BookOpen' },
      { label: 'Timetable', href: '/parent/timetable', icon: 'CalendarDays' },
      {
        label: 'Practice',
        href: '/parent/practice',
        icon: 'Timer',
        alsoActive: /^\/parent\/children\/[^/]+\/practice(\/|$)/,
        badge: 'practiceAttention',
      },
      { label: 'Mistakes', href: '/parent/mistakes', icon: 'Crosshair', badge: 'openMistakesFamily' },
      { label: 'Lessons', href: '/parent/lessons', icon: 'FileText' },
      { label: 'Quran', href: '/parent/quran', icon: 'BookOpen' },
      { label: 'Duas', href: '/parent/duas', icon: 'ScrollText' },
      { label: 'Trials & bookings', href: '/parent/bookings', icon: 'Sparkles' },
      {
        label: 'Messages',
        href: '/parent/messages',
        icon: 'MessageSquare',
        badge: 'unreadThreadsGuardian',
      },
      {
        label: 'Billing',
        href: '/parent/billing',
        icon: 'CreditCard',
        feature: 'billing',
        badge: 'billingAttention',
      },
      {
        label: 'Privacy & consent',
        href: '/parent/privacy',
        icon: 'ShieldCheck',
        badge: 'consentMissing',
      },
      { label: 'Report a concern', href: '/parent/concerns', icon: 'ShieldAlert' },
      { label: 'Notifications', href: '/parent/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
  student: {
    key: 'student',
    label: 'Student portal',
    basePath: '/student',
    roles: [Role.STUDENT, Role.CHILD_STUDENT],
    nav: [
      { label: 'Overview', href: '/student', icon: 'LayoutDashboard' },
      { label: 'My progress', href: '/student/progress', icon: 'BookOpen' },
      { label: 'Practice', href: '/student/practice', icon: 'Timer', badge: 'practiceAttention' },
      { label: 'Mistakes', href: '/student/mistakes', icon: 'Crosshair', badge: 'openMistakesStudent' },
      { label: 'Quran', href: '/student/quran', icon: 'BookOpen' },
      { label: 'Duas', href: '/student/duas', icon: 'ScrollText' },
      { label: 'Report a concern', href: '/student/concerns', icon: 'ShieldAlert' },
      { label: 'Notifications', href: '/student/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
  teacher: {
    key: 'teacher',
    label: 'Teacher portal',
    basePath: '/teacher',
    roles: [Role.TEACHER],
    nav: [
      {
        label: 'Today',
        href: '/teacher',
        icon: 'LayoutDashboard',
      },
      { label: 'Timetable', href: '/teacher/timetable', icon: 'CalendarDays' },
      { label: 'Lesson cards', href: '/teacher/lesson-cards', icon: 'FileText', badge: 'teacherLessonCardsDue' },
      { label: 'Trial results', href: '/teacher/trials', icon: 'Sparkles', badge: 'teacherTrialResultsDue' },
      { label: 'Cover requests', href: '/teacher/substitutes', icon: 'Repeat' },
      { label: 'Availability', href: '/teacher/availability', icon: 'Clock' },
      { label: 'Students', href: '/teacher/students', icon: 'GraduationCap' },
      {
        label: 'Messages',
        href: '/teacher/messages',
        icon: 'MessageSquare',
        badge: 'unreadThreadsTeacher',
      },
      {
        label: 'Practice to review',
        href: '/teacher/practice',
        icon: 'Timer',
        badge: 'practiceToReview',
      },
      { label: 'Quality reviews', href: '/teacher/reviews', icon: 'ClipboardCheck' },
      { label: 'Payslips', href: '/teacher/payslips', icon: 'Wallet' },
      { label: 'Profile', href: '/teacher/profile', icon: 'UserCircle' },
      { label: 'Report a concern', href: '/teacher/concerns', icon: 'ShieldAlert' },
      { label: 'Notifications', href: '/teacher/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
  supervisor: {
    key: 'supervisor',
    label: 'Quality & supervision',
    basePath: '/supervisor',
    roles: [Role.SUPERVISOR, Role.EXAMINER, Role.SUPER_ADMIN],
    nav: [
      { label: 'Overview', href: '/supervisor', icon: 'LayoutDashboard' },
      // Quality assurance is SUPERVISOR / SUPER_ADMIN only; an EXAMINER sees just the overview.
      {
        label: 'Teachers & scorecards',
        href: '/supervisor/teachers',
        icon: 'BadgeCheck',
        roles: QUALITY,
      },
      { label: 'My exams', href: '/supervisor/exams', icon: 'GraduationCap', roles: [Role.EXAMINER, Role.SUPER_ADMIN] },
      { label: 'My teachers', href: '/supervisor/caseload', icon: 'Users', roles: [Role.SUPERVISOR] },
      { label: 'Review queue', href: '/supervisor/queue', icon: 'Timer', roles: QUALITY },
      {
        label: 'Class reviews',
        href: '/supervisor/reviews',
        icon: 'ClipboardCheck',
        roles: QUALITY,
      },
      { label: 'Family messages', href: '/supervisor/messages', icon: 'MessageSquare', roles: [Role.SUPERVISOR, Role.SUPER_ADMIN] },
      { label: 'Family questions', href: '/supervisor/revision-requests', icon: 'FileText', roles: QUALITY },
      { label: 'Past reviews', href: '/supervisor/past-reviews', icon: 'ScrollText', roles: QUALITY },
      { label: 'Review rubric', href: '/supervisor/rubrics', icon: 'Settings', roles: [Role.SUPER_ADMIN] },
      {
        label: 'Hiring pipeline',
        href: '/supervisor/applications',
        icon: 'UserPlus',
        roles: QUALITY,
        badge: 'applicationsInProgress',
      },
      {
        label: 'Interviews',
        href: '/supervisor/interviews',
        icon: 'Video',
        roles: QUALITY,
        badge: 'interviewsAwaitingOutcome',
      },
      {
        label: 'Cases',
        href: '/supervisor/cases',
        icon: 'ShieldAlert',
        roles: QUALITY,
        badge: 'casesOpen',
      },
      { label: 'Notifications', href: '/supervisor/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
  safeguarding: {
    key: 'safeguarding',
    label: 'Safeguarding',
    basePath: '/safeguarding',
    roles: [Role.SAFEGUARDING_LEAD, Role.SUPER_ADMIN],
    nav: [
      { label: 'Case board', href: '/safeguarding', icon: 'ShieldAlert', badge: 'casesOpen' },
      { label: 'SLA monitor', href: '/safeguarding/sla', icon: 'Timer' },
      { label: 'Notifications', href: '/safeguarding/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
  admin: {
    key: 'admin',
    label: 'Academy admin',
    basePath: '/admin',
    roles: STAFF_ADMIN,
    nav: [
      { label: 'Overview', href: '/admin', icon: 'LayoutDashboard' },
      { label: 'Users & search', href: '/admin/users', icon: 'Search' },
      { label: 'CRM', href: '/admin/crm', icon: 'Target', badge: 'crmTasksOpen' },
      {
        label: 'Trials & placement',
        href: '/admin/trials',
        icon: 'Sparkles',
        badge: 'trialsNeedingResult',
      },
      {
        label: 'Teacher changes',
        href: '/admin/teacher-changes',
        icon: 'Repeat',
        badge: 'teacherChangesOpen',
      },
      {
        label: 'Teachers',
        href: '/admin/teachers',
        icon: 'GraduationCap',
        badge: 'profileChangesPending',
      },
      {
        label: 'Hiring pipeline',
        href: '/admin/hiring',
        icon: 'UserPlus',
        badge: 'applicationsInProgress',
      },
      {
        label: 'Interviews',
        href: '/admin/interviews',
        icon: 'Video',
        badge: 'interviewsAwaitingOutcome',
      },
      { label: 'Scheduling', href: '/admin/scheduling', icon: 'CalendarDays' },
      { label: 'Holidays', href: '/admin/holidays', icon: 'CalendarDays' },
      { label: 'Courses', href: '/admin/courses', icon: 'BookOpen' },
      {
        label: 'Enrolments',
        href: '/admin/enrolments',
        icon: 'Users',
        badge: 'enrolmentsAwaitingTeacher',
      },
      { label: 'Billing', href: '/admin/billing', icon: 'CreditCard', feature: 'billing' },
      { label: 'Invoices & refunds', href: '/admin/invoices', icon: 'Receipt', feature: 'billing' },
      { label: 'Class credits', href: '/admin/class-credits', icon: 'Sparkles', feature: 'billing' },
      { label: 'Payroll', href: '/admin/payroll', icon: 'Wallet' },
      {
        label: 'Data requests',
        href: '/admin/data-requests',
        icon: 'FileLock',
        badge: 'dataRequestsOpen',
      },
      { label: 'Content & FAQ', href: '/admin/content', icon: 'FileText' },
      { label: 'Analytics', href: '/admin/analytics', icon: 'Target', roles: [Role.ADMIN, Role.SUPER_ADMIN] },
      { label: 'Settings', href: '/admin/settings', icon: 'Settings' },
      { label: 'Role permissions', href: '/admin/permissions', icon: 'ShieldCheck', roles: [Role.SUPER_ADMIN] },
      { label: 'Audit log', href: '/admin/audit', icon: 'ScrollText', roles: [Role.SUPER_ADMIN] },
      { label: 'Notifications', href: '/admin/notifications', icon: 'Bell', badge: 'notificationsUnread' },
    ],
  },
};

/**
 * A kids-PIN session (a CHILD_STUDENT account and nothing else) has no account settings: it
 * has no password or email to manage, and the guardians look after everything else.
 */
export function canUseAccountSettings(roles: Role[] = []): boolean {
  return !(roles.length > 0 && roles.every((r) => r === Role.CHILD_STUDENT));
}

/** Portals a user can enter, in priority order (used for the portal switcher). */
export function portalsForRoles(roles: Role[] = []): PortalDefinition[] {
  const order: PortalKey[] = [
    'admin',
    'safeguarding',
    'supervisor',
    'teacher',
    'parent',
    'student',
  ];
  return order
    .map((key) => PORTALS[key])
    .filter((portal) => portal.roles.some((r) => roles.includes(r)));
}

export function navForRoles(portal: PortalDefinition, roles: Role[] = []): PortalNavItem[] {
  return portal.nav.filter(
    (item) =>
      (!item.feature || featureEnabled(item.feature)) &&
      (!item.roles || item.roles.some((r) => roles.includes(r))),
  );
}

/** True when `roles` may open `path`: its portal (and any role-restricted nav item) admits them. Public paths are open. */
export function canAccessPath(path: string, roles: Role[] = []): boolean {
  const pathname = path.split(/[?#]/)[0];
  const within = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  const portal = Object.values(PORTALS).find((p) => within(p.basePath));
  if (!portal) return true;
  if (!portal.roles.some((r) => roles.includes(r))) return false;
  const restricted = portal.nav.find(
    (item) => item.roles && item.href !== portal.basePath && within(item.href),
  );
  return restricted ? restricted.roles!.some((r) => roles.includes(r)) : true;
}

/**
 * Where to go after signing in. A `?redirect=` is honoured only if the account that just
 * signed in can open it — otherwise (another role's page left over from a previous session,
 * a stale bookmark) the user lands on their own portal instead of a 403.
 */
export function postLoginDestination(
  target: string | null | undefined,
  roles: Role[] = [],
  twoFactorEnabled?: boolean,
): string {
  const safe = getSafeRedirectUrl(target, '/dashboard');
  const destination =
    safe === '/dashboard' || !canAccessPath(safe, roles) ? getDefaultRouteForRole(roles) : safe;
  // FR-AUTH-01 / M42: staff without 2FA set it up first, then continue where they were going.
  if (twoFactorEnabled === false && isStaffUser(roles)) return twoFactorSetupPath(destination);
  return destination;
}

/** The post-sign-in 2FA enrolment step for staff, continuing to `next` afterwards. */
export const TWO_FACTOR_SETUP_PATH = '/auth/two-factor/setup';

export function twoFactorSetupPath(next?: string | null): string {
  const safe = getSafeRedirectUrl(next, '');
  return safe && !safe.startsWith(TWO_FACTOR_SETUP_PATH)
    ? `${TWO_FACTOR_SETUP_PATH}?next=${encodeURIComponent(safe)}`
    : TWO_FACTOR_SETUP_PATH;
}
