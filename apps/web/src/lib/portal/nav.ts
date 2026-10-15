import { Role } from '@/lib/types';

export type PortalKey = 'parent' | 'student' | 'teacher' | 'supervisor' | 'safeguarding' | 'admin';

export interface PortalNavItem {
  label: string;
  href: string;
  /** lucide-react icon name, resolved in PortalShell. */
  icon: string;
  /** Restrict a single item further than the portal (e.g. super-admin-only). */
  roles?: Role[];
}

export interface PortalDefinition {
  key: PortalKey;
  label: string;
  basePath: string;
  roles: Role[];
  nav: PortalNavItem[];
}

const STAFF_ADMIN = [Role.ADMIN, Role.SUPER_ADMIN];

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
      { label: 'Children', href: '/parent/children', icon: 'Users' },
      { label: 'Timetable', href: '/parent/timetable', icon: 'CalendarDays' },
      { label: 'Messages', href: '/parent/messages', icon: 'MessageSquare' },
      { label: 'Billing', href: '/parent/billing', icon: 'CreditCard' },
      { label: 'Privacy & consent', href: '/parent/privacy', icon: 'ShieldCheck' },
      { label: 'Notifications', href: '/parent/notifications', icon: 'Bell' },
    ],
  },
  student: {
    key: 'student',
    label: 'Student portal',
    basePath: '/student',
    roles: [Role.STUDENT, Role.CHILD_STUDENT],
    nav: [
      { label: 'Overview', href: '/student', icon: 'LayoutDashboard' },
      { label: 'Notifications', href: '/student/notifications', icon: 'Bell' },
    ],
  },
  teacher: {
    key: 'teacher',
    label: 'Teacher portal',
    basePath: '/teacher',
    roles: [Role.TEACHER],
    nav: [
      { label: 'Today', href: '/teacher', icon: 'LayoutDashboard' },
      { label: 'Timetable', href: '/teacher/timetable', icon: 'CalendarDays' },
      { label: 'Availability', href: '/teacher/availability', icon: 'Clock' },
      { label: 'Students', href: '/teacher/students', icon: 'GraduationCap' },
      { label: 'Messages', href: '/teacher/messages', icon: 'MessageSquare' },
      { label: 'Payslips', href: '/teacher/payslips', icon: 'Wallet' },
      { label: 'Profile', href: '/teacher/profile', icon: 'UserCircle' },
      { label: 'Notifications', href: '/teacher/notifications', icon: 'Bell' },
    ],
  },
  supervisor: {
    key: 'supervisor',
    label: 'Quality & supervision',
    basePath: '/supervisor',
    roles: [Role.SUPERVISOR, Role.EXAMINER, Role.SUPER_ADMIN],
    nav: [
      { label: 'Overview', href: '/supervisor', icon: 'LayoutDashboard' },
      { label: 'Teachers & scorecards', href: '/supervisor/teachers', icon: 'BadgeCheck' },
      { label: 'Class reviews', href: '/supervisor/reviews', icon: 'ClipboardCheck' },
      { label: 'Hiring pipeline', href: '/supervisor/applications', icon: 'UserPlus' },
      { label: 'Cases', href: '/supervisor/cases', icon: 'ShieldAlert' },
    ],
  },
  safeguarding: {
    key: 'safeguarding',
    label: 'Safeguarding',
    basePath: '/safeguarding',
    roles: [Role.SAFEGUARDING_LEAD, Role.SUPER_ADMIN],
    nav: [
      { label: 'Case board', href: '/safeguarding', icon: 'ShieldAlert' },
      { label: 'SLA monitor', href: '/safeguarding/sla', icon: 'Timer' },
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
      { label: 'CRM', href: '/admin/crm', icon: 'Target' },
      { label: 'Trials & placement', href: '/admin/trials', icon: 'Sparkles' },
      { label: 'Teacher changes', href: '/admin/teacher-changes', icon: 'Repeat' },
      { label: 'Teachers', href: '/admin/teachers', icon: 'GraduationCap' },
      { label: 'Scheduling', href: '/admin/scheduling', icon: 'CalendarDays' },
      { label: 'Courses', href: '/admin/courses', icon: 'BookOpen' },
      { label: 'Billing', href: '/admin/billing', icon: 'CreditCard' },
      { label: 'Payroll', href: '/admin/payroll', icon: 'Wallet' },
      { label: 'Content & FAQ', href: '/admin/content', icon: 'FileText' },
      { label: 'Settings', href: '/admin/settings', icon: 'Settings' },
      { label: 'Audit log', href: '/admin/audit', icon: 'ScrollText', roles: [Role.SUPER_ADMIN] },
    ],
  },
};

/** Portals a user can enter, in priority order (used for the portal switcher). */
export function portalsForRoles(roles: Role[] = []): PortalDefinition[] {
  const order: PortalKey[] = ['admin', 'safeguarding', 'supervisor', 'teacher', 'parent', 'student'];
  return order.map((key) => PORTALS[key]).filter((portal) => portal.roles.some((r) => roles.includes(r)));
}

export function navForRoles(portal: PortalDefinition, roles: Role[] = []): PortalNavItem[] {
  return portal.nav.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r)));
}
