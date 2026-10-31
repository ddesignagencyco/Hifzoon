'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LogOut, Menu, X, KeyRound, Circle, LayoutDashboard, Users, CalendarDays, MessageSquare, Receipt,
  CreditCard, ShieldCheck, Bell, Clock, GraduationCap, Wallet, UserCircle, BadgeCheck, ClipboardCheck,
  UserPlus, ShieldAlert, Timer, Search, Target, Sparkles, Repeat, BookOpen, FileText, Settings, ScrollText,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';

const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, CalendarDays, MessageSquare, Receipt, CreditCard, ShieldCheck, Bell, Clock, GraduationCap,
  Wallet, UserCircle, BadgeCheck, ClipboardCheck, UserPlus, ShieldAlert, Timer, Search, Target, Sparkles,
  Repeat, BookOpen, FileText, Settings, ScrollText,
};
import { useAuth } from '@/hooks';
import { isStaffUser, isTwoFactorEnrolmentRequired, TWO_FACTOR_ENROLMENT_EVENT } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { NotificationBell } from '@/components/portal/NotificationBell';
import { NavBadge } from '@/components/portal/NavBadges';
import { PORTALS, PortalKey, navForRoles, portalsForRoles, twoFactorSetupPath } from '@/lib/portal/nav';
import { useToast } from '@/components/ui/toast';
import { useSidebarCollapsed } from '@/lib/portal/sidebar-pref';

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = NAV_ICONS[name] ?? Circle;
  return <Icon className={className} aria-hidden />;
}

function isActive(pathname: string, href: string, basePath: string): boolean {
  if (href === basePath) return pathname === basePath;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Authenticated application chrome shared by every role portal:
 * role guard, sidebar navigation, portal switcher, notifications and sign-out.
 */
export function PortalShell({ portal: portalKey, children }: { portal: PortalKey; children: React.ReactNode }) {
  const portal = PORTALS[portalKey];
  return (
    <ProtectedRoute allowedRoles={portal.roles}>
      <ShellChrome portalKey={portalKey}>{children}</ShellChrome>
    </ProtectedRoute>
  );
}

function ShellChrome({ portalKey, children }: { portalKey: PortalKey; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useSidebarCollapsed();
  const toast = useToast();

  // M42: an unenrolled staff session is restricted to 2FA set-up, so go there directly
  // instead of showing "no access" on every page. Only for the account that is actually
  // restricted — staff without 2FA — never for a family or an enrolled staff member.
  const mustEnrol = Boolean(currentUser && isStaffUser(currentUser.roles) && !currentUser.twoFactorEnabled);
  useEffect(() => {
    if (!mustEnrol) return;
    const goEnrol = () => {
      toast.error('Two-factor authentication is required for staff accounts. Set it up to continue.');
      router.replace(twoFactorSetupPath(`${window.location.pathname}${window.location.search}`));
    };
    if (isTwoFactorEnrolmentRequired()) goEnrol();
    window.addEventListener(TWO_FACTOR_ENROLMENT_EVENT, goEnrol);
    return () => window.removeEventListener(TWO_FACTOR_ENROLMENT_EVENT, goEnrol);
  }, [router, mustEnrol, toast]);

  const portal = PORTALS[portalKey];
  const roles = currentUser?.roles ?? [];
  const nav = navForRoles(portal, roles);
  const otherPortals = portalsForRoles(roles).filter((p) => p.key !== portalKey);

  const handleLogout = async () => {
    await logout(false);
    router.replace('/login');
  };

  /** The full sidebar, or (desktop only) an icon-only rail when `collapsed`. */
  const renderSidebar = (collapsed: boolean) => {
    const itemClass = (active: boolean) =>
      cn(
        'relative flex items-center rounded-xl py-2 text-sm transition-colors',
        collapsed ? 'justify-center px-2' : 'gap-3 px-3',
        active ? 'bg-white/10 text-white font-semibold' : 'text-white/70 hover:bg-white/5 hover:text-white',
      );
    const footerClass = cn(
      'w-full flex items-center rounded-xl py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white cursor-pointer',
      collapsed ? 'justify-center px-2' : 'gap-3 px-3',
    );
    // Collapsed: the visible label is replaced by aria-label + a native tooltip.
    const labelled = (label: string) => (collapsed ? { 'aria-label': label, title: label } : {});
    return (
      <nav aria-label={`${portal.label} navigation`} className="flex flex-col h-full">
        {/* Same height as the top bar (h-14) so the two bottom borders form one line. */}
        <div className={cn('h-14 shrink-0 flex items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'px-5')}>
          <Link href="/" className="flex items-center gap-2.5" {...labelled('Hifzoon home')}>
            <span className="w-9 h-9 rounded-t-[14px] rounded-b-[4px] bg-white p-1 flex items-center justify-center">
              <Image src="/logo.png" alt="" width={28} height={28} className="object-contain" />
            </span>
            {!collapsed && <span className="font-fraunces text-lg text-white">Hifzoon</span>}
          </Link>
        </div>

        <ul className={cn('flex-1 overflow-y-auto py-4 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
          {nav.map((item) => {
            const active = isActive(pathname, item.href, portal.basePath);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={itemClass(active)}
                  {...labelled(item.label)}
                >
                  <NavIcon name={item.icon} className={cn('w-4 h-4 shrink-0', active ? 'text-gold' : 'text-white/50')} />
                  {!collapsed && item.label}
                  {item.badge && (
                    <NavBadge kind={item.badge} viewerUserId={currentUser?.id} variant={collapsed ? 'dot' : 'pill'} />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={cn('py-4 border-t border-white/10 space-y-1', collapsed ? 'px-2' : 'px-3')}>
          {otherPortals.map((p) => (
            <Link key={p.key} href={p.basePath} className={footerClass} {...labelled(p.label)}>
              <Repeat className="w-4 h-4 shrink-0 text-white/50" aria-hidden />
              {!collapsed && p.label}
            </Link>
          ))}
          <Link href="/account/security" className={footerClass} {...labelled('Account security')}>
            <KeyRound className="w-4 h-4 shrink-0 text-white/50" aria-hidden />
            {!collapsed && 'Account security'}
          </Link>
          <button type="button" onClick={handleLogout} className={footerClass} {...labelled('Sign out')}>
            <LogOut className="w-4 h-4 shrink-0 text-white/50" aria-hidden />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-cream flex">
      {/* Fixed (not sticky): body has overflow-x:hidden, which breaks position:sticky. */}
      <aside
        className={cn(
          'hidden lg:block fixed inset-y-0 left-0 z-30 bg-green-950 overflow-hidden transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {renderSidebar(collapsed)}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-green-950/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 bg-green-950 shadow-large">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-4 right-3 p-1.5 text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div className={cn('flex-1 min-w-0 flex flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-64')}>
        <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-line">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 2xl:px-12 h-14 w-full max-w-[1720px] mx-auto">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-1.5 -ml-1.5 rounded-lg text-ink hover:bg-sand cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden lg:inline-flex p-1.5 -ml-1.5 rounded-lg text-ink-2 hover:bg-sand cursor-pointer"
            >
              {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
            <p className="text-xs text-muted truncate hidden sm:block">{portal.label}</p>
            <div className="flex items-center gap-3 ml-auto">
              <NotificationBell portal={portalKey} />
              <div className="text-right leading-tight">
                <p className="text-sm font-semibold text-ink truncate max-w-[160px]">{currentUser?.name}</p>
                <p className="text-[11px] text-muted truncate max-w-[160px]">{currentUser?.email}</p>
              </div>
              <span className="w-9 h-9 rounded-full bg-green-800 text-gold font-semibold text-sm flex items-center justify-center">
                {(currentUser?.name ?? '?').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 2xl:px-12 py-6 sm:py-8 w-full max-w-[1720px] mx-auto">
          <StaffTwoFactorNotice />
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * FR-AUTH-01: 2FA is mandatory for staff. The API does not enforce enrolment yet
 * (backendrequirement M42), so every portal page reminds an unenrolled staff member.
 */
export function StaffTwoFactorNotice() {
  const { currentUser } = useAuth();
  const pathname = usePathname();
  if (!currentUser || currentUser.twoFactorEnabled || !isStaffUser(currentUser.roles)) return null;
  if (pathname.startsWith('/account/security')) return null;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold-100/60 px-4 py-3 text-sm text-ink">
      <span>
        <strong className="font-semibold">Two-factor authentication is required for staff accounts.</strong>{' '}
        Set it up now to keep access to student and family data.
      </span>
      <Link href={twoFactorSetupPath(pathname)} className="shrink-0 font-semibold text-green-800 underline underline-offset-4">
        Set up 2FA
      </Link>
    </div>
  );
}
