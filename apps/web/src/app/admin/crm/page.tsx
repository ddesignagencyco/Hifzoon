'use client';

import { Suspense } from 'react';
import { CrmWorkspace } from '@/components/admin/crm/CrmWorkspace';
import { LoadingState } from '@/components/ui/primitives';

export default function AdminCrmPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <CrmWorkspace />
    </Suspense>
  );
}
