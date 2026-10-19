'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalShell } from '@/components/portal/PortalShell';
import { LoadingState } from '@/components/ui/primitives';
import { useAuth } from '@/hooks';
import { portalsForRoles } from '@/lib/portal/nav';

/**
 * Account pages (security, sessions, 2FA) belong to the signed-in experience, so they
 * render inside the user's own portal chrome — sidebar, header, notifications —
 * rather than the public marketing site.
 */
export function AccountShell({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();

  if (isLoading && !currentUser) {
    return <LoadingState label="Verifying secure session…" className="min-h-screen" />;
  }

  // Not signed in: ProtectedRoute redirects to /login?redirect=/account/…
  if (!currentUser) {
    return <ProtectedRoute>{children}</ProtectedRoute>;
  }

  const home = portalsForRoles(currentUser.roles)[0];
  if (!home) {
    return <ProtectedRoute>{children}</ProtectedRoute>;
  }

  return <PortalShell portal={home.key}>{children}</PortalShell>;
}
