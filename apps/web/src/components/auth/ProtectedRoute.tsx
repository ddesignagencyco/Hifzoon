'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { StatusPage } from '@/components/errors/StatusPage';
import { useAuth } from '@/hooks';
import { Role } from '@/lib/types';
import { getSafeRedirectUrl, wasExplicitSignOut } from '@/lib/api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

/**
 * Shown while the in-memory session is restored. It is the *same* full-screen overlay as the
 * first-load splash (AuthBootSplash), so when a portal is opened directly the splash and this
 * loader overlap exactly and read as one loader instead of two in a row.
 */
function SessionCheckSpinner() {
  return (
    <>
      <div className="min-h-screen bg-cream" aria-hidden />
      <BrandLoader variant="fullscreen" label="Loading…" hideLabel />
    </>
  );
}

/**
 * Route protection wrapper for sensitive portals, session dashboards,
 * and security settings pages. Redirects unauthenticated visitors to /login.
 *
 * Everything behind it depends on the URL (usePathname/useParams) and on the
 * in-memory session, so it streams in behind a Suspense boundary: the prerendered
 * shell is the brand loader (required by Cache Components).
 */
export function ProtectedRoute(props: ProtectedRouteProps) {
  return (
    <Suspense fallback={<SessionCheckSpinner />}>
      <ProtectedRouteGate {...props} />
    </Suspense>
  );
}

function ProtectedRouteGate({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, isAuthenticated, isLoading, isResolved } = useAuth();

  useEffect(() => {
    // Only redirect if authentication status has fully resolved and user is definitely unauthenticated
    if (isResolved && !isLoading && !isAuthenticated) {
      // The user chose to sign out: no redirect back into this (possibly role-specific) page.
      if (wasExplicitSignOut()) {
        router.replace('/login');
        return;
      }
      // The session expired or was never there: come back here after signing in.
      const safeTarget = getSafeRedirectUrl(pathname, '/dashboard');
      router.replace(`/login?redirect=${encodeURIComponent(safeTarget)}`);
    }
  }, [isResolved, isLoading, isAuthenticated, router, pathname]);

  // While session is being verified, keep showing the seamless spinner
  if (!isResolved || isLoading) {
    return <SessionCheckSpinner />;
  }

  // Session resolved, but unauthenticated: keep spinner active while navigation completes
  if (!isAuthenticated) {
    return <SessionCheckSpinner />;
  }

  if (allowedRoles && allowedRoles.length > 0 && currentUser) {
    const hasRole = currentUser.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return (
        <StatusPage
          kind="forbidden"
          body={`This area is for ${allowedRoles.map((r) => r.toLowerCase().replace(/_/g, ' ')).join(', ')} accounts. You are signed in as ${currentUser.name}.`}
          actions={[
            { label: 'Go to my portal', href: '/dashboard', variant: 'primary' },
            { label: 'Go to homepage', href: '/', variant: 'secondary' },
          ]}
        />
      );
    }
  }

  return <>{children}</>;
}
