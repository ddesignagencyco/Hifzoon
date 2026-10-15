'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LoadingState } from '@/components/ui/primitives';
import { useAuth } from '@/hooks';
import { getDefaultRouteForRole } from '@/lib/api/client';

/** `/dashboard` resolves the signed-in user's home portal from their roles (FR-AUTH-02). */
function RoleRedirect() {
  const router = useRouter();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;
    const target = getDefaultRouteForRole(currentUser.roles);
    router.replace(target === '/dashboard' ? '/' : target);
  }, [currentUser, router]);

  return <LoadingState label="Opening your portal…" className="min-h-screen" />;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <RoleRedirect />
    </ProtectedRoute>
  );
}
