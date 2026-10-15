'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks';
import { Role } from '@/lib/types';
import { getSafeRedirectUrl } from '@/lib/api/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

/**
 * Route protection wrapper for sensitive portals, session dashboards,
 * and security settings pages. Redirects unauthenticated visitors to /login.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const safeTarget = getSafeRedirectUrl(pathname, '/portal-preview');
      const redirectTarget = encodeURIComponent(safeTarget);
      router.replace(`/login?redirect=${redirectTarget}`);
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  if (isLoading) {
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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber/10 border border-amber/30 flex items-center justify-center text-amber">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1 max-w-sm">
          <p className="text-sm font-semibold text-ink">Authentication Required</p>
          <p className="text-xs text-muted">Please sign in to access your family records or security settings.</p>
        </div>
      </div>
    );
  }

  if (allowedRoles && allowedRoles.length > 0 && currentUser) {
    const hasRole = currentUser.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return (
        <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="text-center space-y-2 max-w-md">
            <h2 className="text-base font-semibold text-ink">Restricted Access</h2>
            <p className="text-xs text-muted">
              Your account ({currentUser.roles.join(', ')}) does not have permission to view this section.
            </p>
            <button
              type="button"
              onClick={() => router.push('/portal-preview')}
              className="py-2 px-4 rounded-full bg-green-950 text-white text-xs font-semibold hover:bg-green-900 cursor-pointer"
            >
              Return to Portal
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
