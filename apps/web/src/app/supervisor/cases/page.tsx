'use client';

import { CaseBoard } from '@/components/cases/CaseBoard';
import { SupervisorRoleGate } from '@/components/qa/SupervisorRoleGate';

export default function SupervisorCasesPage() {
  return (
    <SupervisorRoleGate>
      <CaseBoard
        basePath="/supervisor/cases"
        eyebrow="Quality & supervision"
        title="Cases"
        description="Complaints and safeguarding concerns you can see as a supervisor. The SLA monitor is for the safeguarding lead."
      />
    </SupervisorRoleGate>
  );
}
