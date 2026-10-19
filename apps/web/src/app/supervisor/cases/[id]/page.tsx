'use client';

import { useParams } from 'next/navigation';
import { CaseDetailView } from '@/components/cases/CaseDetailView';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';

export default function SupervisorCasePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <SupervisorRoleGate>
      <CaseDetailView id={id} backHref="/supervisor/cases" />
    </SupervisorRoleGate>
  );
}
