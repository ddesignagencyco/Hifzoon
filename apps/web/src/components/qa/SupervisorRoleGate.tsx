'use client';

import React from 'react';
import { ClipboardList, ShieldCheck } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/primitives';
import { useAuth } from '@/hooks/useAuth';
import { Role } from '@/lib/types';

export function canSuperviseQuality(roles: Role[] | undefined): boolean {
  return !!roles?.some((r) => r === Role.SUPERVISOR || r === Role.SUPER_ADMIN);
}

/**
 * The supervisor portal also admits EXAMINER, but QA reviews and cases are
 * SUPERVISOR / SUPER_ADMIN only (an examiner deliberately does not quality-assure
 * teaching). Explain that rather than showing a wall of 403s.
 */
export function SupervisorRoleGate({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  if (canSuperviseQuality(currentUser?.roles)) return <>{children}</>;
  if (currentUser?.roles.includes(Role.EXAMINER)) {
    // The API has no examiner (assessment) endpoints yet — backendrequirement M41.
    return (
      <Card>
        <EmptyState
          icon={<ClipboardList className="w-5 h-5" aria-hidden />}
          title="No assessments assigned yet"
          description="Student level assessments you are asked to examine will appear here. Until then there is nothing to do in this workspace; quality reviews and cases belong to supervisors."
        />
      </Card>
    );
  }
  return (
    <Card>
      <EmptyState
        icon={<ShieldCheck className="w-5 h-5" aria-hidden />}
        title="Supervisor access only"
        description="Quality reviews, teacher scorecards and cases are available to supervisors."
      />
    </Card>
  );
}
