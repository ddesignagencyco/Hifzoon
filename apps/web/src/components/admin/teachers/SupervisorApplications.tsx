'use client';

import React from 'react';
import { ShieldOff } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { useAdminRoles } from '@/hooks/useAdminRoles';
import { HiringPipeline } from './HiringPipeline';

/** `/supervisor/applications` — the hiring pipeline for supervisors (and super admins). */
export function SupervisorApplications() {
  const { canManageHiring } = useAdminRoles();
  return (
    <>
      <PageHeader
        eyebrow="Quality & supervision"
        title="Hiring pipeline"
        description="Review teacher applicants step by step and record safeguarding training."
      />
      {canManageHiring ? (
        <HiringPipeline basePath="/supervisor/applications" />
      ) : (
        <Card>
          <EmptyState
            icon={<ShieldOff className="w-5 h-5" />}
            title="Supervisors only"
            description="Examiners do not have access to the hiring pipeline."
          />
        </Card>
      )}
    </>
  );
}
