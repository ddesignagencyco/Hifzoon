'use client';

import { PageHeader } from '@/components/ui/primitives';
import { HiringPipeline } from '@/components/admin/teachers/HiringPipeline';

/** `/admin/hiring` — teacher applicants, step by step. */
export default function AdminHiringPage() {
  return (
    <>
      <PageHeader
        eyebrow="Hiring"
        title="Hiring pipeline"
        description="Move teacher applicants through recitation review, interview, ID and reference checks, and training."
      />
      <HiringPipeline basePath="/admin/hiring/applications" />
    </>
  );
}
