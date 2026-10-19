'use client';

import React from 'react';
import { UserX } from 'lucide-react';
import { Card, EmptyState, QueryState } from '@/components/ui/primitives';
import { useTeacherIdentity } from '@/hooks/useTeacher';

/**
 * Renders `children` once the teacher's profile id is known.
 *
 * The API has no `GET /teachers/me`, so the id comes from the teacher's enrolments; a
 * teacher with no students yet (e.g. still in training) cannot be resolved and sees an
 * explanation instead of a broken screen.
 */
export function TeacherIdentityGate({
  children,
  what = 'this page',
}: {
  children: (identity: { teacherId: string; userId: string; zone: string }) => React.ReactNode;
  what?: string;
}) {
  const identity = useTeacherIdentity();
  const unresolved = (
    <Card>
      <EmptyState
        icon={<UserX className="w-5 h-5" aria-hidden />}
        title="No teacher profile on this account"
        description={`We could not load ${what} because this account has no teacher profile yet. Please contact the academy so they can finish setting it up.`}
      />
    </Card>
  );
  return (
    <QueryState query={identity.query} isEmpty={(id) => !id} empty={unresolved} loadingLabel="Loading your profile…">
      {(teacherId) =>
        teacherId && identity.userId ? children({ teacherId, userId: identity.userId, zone: identity.zone }) : unresolved
      }
    </QueryState>
  );
}
