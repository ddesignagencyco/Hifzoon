'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTeacherOnboarding } from '@/hooks/useTeacherOnboarding';
import { BrandLoader } from '@/components/ui/BrandLoader';
import {
  isOnboardingOpenPath,
  rememberComplete,
  rememberedComplete,
} from '@/lib/api/modules/teacher-onboarding';

const STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SUPERVISOR'];
const noSubscription = () => () => undefined;

/**
 * Locks the teacher portal to `/teacher/onboarding` until the one-time profile setup is
 * submitted. Sign-out and account security live outside `/teacher`, so they stay reachable.
 *
 * Staff who also hold TEACHER are never gated. Once complete, the result is remembered on
 * the device and the status is never fetched again for that teacher.
 */
export function TeacherOnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser } = useAuth();
  const roles: string[] = currentUser?.roles ?? [];
  const exempt = !roles.includes('TEACHER') || roles.some((r) => STAFF_ROLES.includes(r));
  // localStorage is not available while rendering on the server, where this reads null.
  const userId = currentUser?.id;
  const remembered = useSyncExternalStore<boolean | null>(
    noSubscription,
    () => (userId ? rememberedComplete(userId) : false),
    () => null,
  );

  const check = Boolean(currentUser) && !exempt && remembered === false;
  const status = useTeacherOnboarding(check);
  const locked =
    check && status.data !== undefined && status.data.required && !status.data.complete;
  const onSetupPage = isOnboardingOpenPath(pathname);

  useEffect(() => {
    if (status.data?.complete && currentUser) rememberComplete(currentUser.id);
  }, [status.data, currentUser]);

  useEffect(() => {
    if (locked && !onSetupPage) router.replace('/teacher/onboarding');
  }, [locked, onSetupPage, router]);

  if (exempt || remembered === true || onSetupPage) return <>{children}</>;
  // Fail open on an error: the API still refuses the key actions with PROFILE_INCOMPLETE.
  if (status.isError) return <>{children}</>;
  if (remembered === null || status.isLoading || status.data === undefined || locked) {
    return <BrandLoader variant="section" label="Loading your portal…" />;
  }
  return <>{children}</>;
}
