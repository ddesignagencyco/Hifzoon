'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { StatusPage } from '@/components/errors/StatusPage';
import { useAuth } from '@/hooks';
import { Role } from '@/lib/types';
import { getSafeRedirectUrl } from '@/lib/api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

function SessionCheckSpinner() {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6 space-y-4">
      <div className="relative w-12 h-12 rounded-2xl bg-green-950 flex items-center justify-center shadow-card border border-gold/40">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-ink">Verifying secure session...</p>
        <p className="text-xs text-muted">Checking authentication tokens and session credentials</p>
      </div>
    </div>
  );
}

/**
 * Route protection wrapper for sensitive portals, session dashboards,
 * and security settings pages. Redirects unauthenticated visitors to /login.
 *
 * Everything behind it depends on the URL (usePathname/useParams) and on the
 * in-memory session, so it streams in behind a Suspense boundary: the prerendered
 * shell is the session-check spinner (required by Cache Components).
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
      const safeTarget = getSafeRedirectUrl(pathname, '/dashboard');
      const redirectTarget = encodeURIComponent(safeTarget);
      router.replace(`/login?redirect=${redirectTarget}`);
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
